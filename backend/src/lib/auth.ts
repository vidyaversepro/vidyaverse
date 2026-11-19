import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { jwt } from 'better-auth/plugins/jwt';
import { oidcProvider } from 'better-auth/plugins/oidc-provider';
import { prisma } from '../config/database.js';
import { sendEmail } from '../utils/mailer.js';
import { env } from '../config/env.js';
import { passwordResetEmail, welcomeEmail, verifyEmailEmail } from '../utils/email-templates.js';
import { resolveOidcClaims } from '../modules/oidc/claims-resolver.js';
import { hashClientSecret } from '../modules/oidc/client-secret-hash.js';
import { normaliseEmail } from './email/normalise.js';
import { AUTH_COOKIE_PREFIX } from './auth-cookies.js';
import { syncUserMemberships } from '../modules/entitlements/capabilities/membership-sync.js';

const frontendUrl = env.FRONTEND_URL || 'http://localhost:5173';

const trustedOrigins = [
    frontendUrl,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3002',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'https://vgraphics.in',
    'https://api.vgraphics.in',
    ...(env.PDLMS_ORIGIN ? [env.PDLMS_ORIGIN] : []),
    ...(env.DCP_ORIGIN ? [env.DCP_ORIGIN] : []),
];

const baseConfig = {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: 'mysql' }),
    emailAndPassword: {
        enabled: true,
        // Vidyaverse is the identity provider for Book Buddy and Study Buddy, and
        // those apps trust its `email_verified` claim to decide whether a federated
        // identity may be linked to an existing local account. An unverified signup
        // here would therefore be a route to claiming someone else's account
        // downstream — so the address must be proven before the account is usable.
        requireEmailVerification: true,
        // Not auto-signed-in at signup (the account isn't usable yet);
        // autoSignInAfterVerification below signs them in the instant they click
        // the link, so the user still lands logged in with one click.
        autoSignIn: false,
        sendResetPassword: async ({ user, token }: any) => {
            const resetLink = `${frontendUrl}/reset-password?token=${token}`;
            await sendEmail(
                user.email,
                'Reset Your Password - Vidyaverse Pro',
                passwordResetEmail(user.name || 'there', resetLink)
            );
        },
    },
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        expiresIn: 60 * 60, // 1 hour, matching the password-reset window
        sendVerificationEmail: async ({ user, token }: any) => {
            // Built explicitly rather than using the supplied `url`: better-auth's
            // default callbackURL is relative and resolves against baseURL — the API
            // host, which serves no UI. That is the same trap that broke the OIDC
            // login hand-off, so the frontend origin is named outright here.
            const callbackURL = encodeURIComponent(`${frontendUrl}/verify-email`);
            const verifyLink = `${(env.BETTER_AUTH_URL || '').replace(/\/$/, '')}/api/auth/verify-email?token=${token}&callbackURL=${callbackURL}`;
            await sendEmail(
                user.email,
                'Confirm your email address - Vidyaverse Pro',
                verifyEmailEmail(user.name || 'there', verifyLink)
            );
        },
        afterEmailVerification: async (user: any) => {
            // Welcome lands only once the address is known to be real, so signup
            // doesn't fire two emails into the same inbox at the same moment.
            sendEmail(
                user.email,
                'Welcome to Vidyaverse Pro',
                welcomeEmail(user.name || 'there')
            ).catch((err) => console.error('[auth] welcome email failed:', err));
        },
    },
    user: {
        additionalFields: {
            // SECURITY: never settable by the client. better-auth accepts an
            // additional field in /sign-up/email and /update-user unless it says
            // `input: false`, and 'admin' passes every platform-admin gate
            // (SUPER_ROLES). New accounts take the column default ('student');
            // roles change only through the app's own admin routes.
            globalRole: { type: 'string' as const, returned: true, input: false, required: false },
        },
    },
    advanced: {
        // Distinct per app across the trio. Harmless while cookies stay host-scoped,
        // but single logout needs all three under a common parent domain, where three
        // identically-named cookies would collide. Vidyaverse is the IdP, so its
        // cookie is the one that must remain unambiguous.
        cookiePrefix: AUTH_COOKIE_PREFIX,
    },
    // This is the identity provider — every trio login funnels through these
    // endpoints, so credential-stuffing and email-bomb abuse is throttled here at
    // the source. Per-IP, in-memory (per instance); the generous global ceiling
    // keeps the SPA working while the custom rules clamp the sensitive paths.
    // NOTE: rate limiting is keyed on client IP, which behind Traefik/Cloudflare
    // must arrive via X-Forwarded-For — confirm the proxy sets it.
    rateLimit: {
        enabled: true,
        window: 60,
        max: 120,
        customRules: {
            '/sign-in/email': { window: 60, max: 8 },
            '/sign-up/email': { window: 60, max: 5 },
            '/forget-password': { window: 900, max: 5 },
            '/reset-password': { window: 900, max: 8 },
            '/send-verification-email': { window: 900, max: 5 },
        },
    },
    trustedOrigins,
} satisfies BetterAuthOptions;

// OIDC provider is opt-in via OIDC_ENABLED so existing dev/test environments
// keep their behaviour. When enabled, Vidyaverse becomes an Identity Provider
// for PDLMS and DigiClassroom (see docs/identity-federation-design.md).
const plugins = env.OIDC_ENABLED
    ? [
          jwt({
              jwks: {
                  // EdDSA keys are tiny, fast to verify, and well-supported by `jose` on the RP side.
                  keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' },
              },
          }),
          oidcProvider({
              // Better Auth appends the original authorize query to loginPage, so
              // we must NOT pre-add a query here (would produce a double-`?`). The
              // login page detects the federated flow by the presence of client_id
              // and loops back to /oauth2/authorize after sign-in.
              // These MUST be absolute frontend URLs: baseURL is the API host
              // (api.<domain>) which does not serve the login/consent UI, so a
              // relative '/login' would resolve to api.<domain>/login → 401.
              loginPage: `${frontendUrl}/login`,
              consentPage: `${frontendUrl}/oauth/consent`,
              allowDynamicClientRegistration: false,
              requirePKCE: true,
              storeClientSecret: { hash: hashClientSecret },
              useJWTPlugin: true,
              metadata: {
                  issuer: env.VIDYAVERSE_ISSUER || env.BETTER_AUTH_URL,
                  scopes_supported: ['openid', 'profile', 'email', 'offline_access', 'memberships', 'entitlements'],
                  claims_supported: [
                      'sub', 'iss', 'aud', 'exp', 'nbf', 'iat', 'jti',
                      'email', 'email_verified', 'name', 'picture',
                      'global_role', 'memberships', 'entitlements_url',
                  ],
              },
              scopes: ['openid', 'profile', 'email', 'offline_access', 'memberships', 'entitlements'],
              getAdditionalUserInfoClaim: async (user, scopes, client) =>
                  resolveOidcClaims(user as any, scopes, client),
          }),
      ]
    : [];

export const auth = betterAuth({
    ...baseConfig,
    plugins,
    databaseHooks: {
        user: {
            create: {
                // Store the address canonically. Harmless on MySQL (its collation is
                // already case-insensitive) and load-bearing on Postgres, where
                // `Foo@Bar.com` and `foo@bar.com` are distinct values — see
                // lib/email/normalise.ts for why that would break account linking.
                before: async (user) => {
                    const email = normaliseEmail((user as { email: string }).email);
                    return { data: { ...user, email } };
                },
                after: async (user) => {
                    // The welcome email now fires from emailVerification.afterEmailVerification
                    // instead of here, so a new signup receives the verification mail alone.

                    // Auto-link: if exactly one Student row has parentEmail matching
                    // this new user's email and is not yet linked, set Student.userId.
                    // Zero matches → no-op (admin links manually via PATCH /students/:id/link-user).
                    // Multiple matches → no-op + warn (ambiguous; don't link to a random sibling).
                    try {
                        // parentEmail is entered by admins and bulk imports, so it is
                        // normalised at write and backfilled to lowercase — which is
                        // what lets this stay an indexed equality lookup. MySQL's
                        // collation would forgive a mixed-case row; Postgres would not,
                        // and the auto-link would quietly stop firing.
                        const matches = await prisma.student.findMany({
                            where: { parentEmail: normaliseEmail(user.email), userId: null },
                            select: { id: true },
                        });
                        if (matches.length === 1) {
                            await prisma.student.update({
                                where: { id: matches[0].id },
                                data: { userId: user.id },
                            });
                        } else if (matches.length > 1) {
                            console.warn(
                                `[auth] auto-link skipped for ${user.email} — ${matches.length} student records match`
                            );
                        }
                    } catch (err) {
                        // Non-fatal — admin can still link manually
                        console.error('[auth] student auto-link failed:', err);
                    }
                },
            },
        },
        session: {
            create: {
                after: async (session) => {
                    // Self-healing mirror: the authoritative refresh happens on the
                    // membership-change path, but a missed event must not leave a
                    // user unable to see institution access they are paying for.
                    // Deliberately not awaited — a slow or unreachable entitlements
                    // database must never delay or fail a login.
                    void syncUserMemberships(session.userId);
                },
            },
        },
    },
});
