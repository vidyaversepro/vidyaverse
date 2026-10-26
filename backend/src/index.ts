import './instrument.js';
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';
import fastifyWebsocket from '@fastify/websocket';


import { env, connectDatabase, disconnectDatabase, connectRedis, disconnectRedis, initializeMinio } from './config/index.js';
import { authPlugin, rbacPlugin, errorHandlerPlugin } from './plugins/index.js';
import { logger } from './utils/logger.js';

// Validation: see packages/shared-validation/

import { auth } from './lib/auth.js';
import { institutionModule } from './modules/institution/index.js';
import { branchModule } from './modules/branch/index.js';
import { userModule } from './modules/user/index.js';
import { classModule } from './modules/class/index.js';
import { streamModule } from './modules/stream/index.js';
import { sectionModule } from './modules/section/index.js';
import { studentModule } from './modules/student/index.js';
import { photoModule } from './modules/photo/index.js';
import { templateRoutes } from './modules/templates/index.js';
import { idCardRoutes } from './modules/id-cards/index.js';
import { certificateRoutes } from './modules/certificates/index.js';
import { groupPhotoRoutes } from './modules/group-photos/index.js';
import { portfolioRoutes } from './modules/portfolios/index.js';
import { hallTicketRoutes } from './modules/hall-tickets/index.js';
import marksheetRoutes from './modules/marksheets/marksheet.routes.js';
import libraryCardRoutes from './modules/library-cards/library-card.routes.js';
import transferCertificateRoutes from './modules/transfer-certificates/transfer-certificate.routes.js';
import visitingCardRoutes from './modules/visiting-card/visiting-card.routes.js';
import jobRoutes from './modules/jobs/jobs.routes.js';
import { visionariumModule } from './modules/visionarium/index.js';
import { socialModule } from './modules/social/index.js';
import { analyticsModule } from './modules/analytics/index.js';
import { approvalRoutes } from './modules/approvals/index.js';
import authRoutes from './modules/auth/auth.routes.js';
import { opsRoutes } from './modules/ops/index.js';
import { messagingModule } from './modules/messaging/index.js';
import { paymentsModule } from './modules/payments/index.js';
import emailWebhooks from './modules/notifications/email.webhooks.js';
import { SESSION_COOKIE } from './lib/auth-cookies.js';
import { inboundModule } from './modules/inbound/index.js';
import { adminModule } from './modules/admin/index.js';
import { entitlementsModule } from './modules/entitlements/index.js';
import { taxonomyModule } from './modules/taxonomy/index.js';
import { curriculumModule } from './modules/curriculum/index.js';
import { academicModule } from './modules/academic/index.js';
import { admissionsModule } from './modules/admissions/index.js';
import { transportModule } from './modules/transport/index.js';
import { hrModule } from './modules/hr/index.js';
import { financeModule } from './modules/finance/index.js';
import { timetableModule } from './modules/timetable/index.js';
import { integrationsModule } from './modules/integrations/index.js';
import { oidcModule } from './modules/oidc/index.js';
import { hostelModule } from './modules/hostel/index.js';
import { inventoryModule } from './modules/inventory/index.js';
import { healthModule } from './modules/health/index.js';
import { visitorModule } from './modules/visitor/index.js';
import { gradebookModule } from './modules/gradebook/index.js';
import { assignmentsModule } from './modules/assignments/index.js';
import { noticesModule } from './modules/notices/index.js';
import { reportsModule } from './modules/reports/index.js';
import { alumniModule } from './modules/alumni/index.js';
import { placementModule } from './modules/placement/index.js';
import { biometricModule } from './modules/biometric/index.js';
import { feesAdvancedModule } from './modules/fees-advanced/index.js';
import { liveClassesModule } from './modules/live-classes/index.js';
import { mobileAppModule } from './modules/mobile-app/index.js';
import { onlineTestsModule } from './modules/online-tests/index.js';
import { chatRoutes } from './modules/chat/chat.routes.js';
import { initChatWsSubscriber } from './modules/chat/chat.ws.js';
import { callsRoutes } from './modules/calls/calls.routes.js';
import { attendanceModule } from './modules/attendance/index.js';

export async function buildApp() {
    const fastify = Fastify({
        logger: {
            level: env.NODE_ENV === 'production' ? 'info' : 'debug',
        },
        bodyLimit: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    });

    // Capture unhandled route errors to Sentry/GlitchTip (no-op without SENTRY_DSN).
    Sentry.setupFastifyErrorHandler(fastify);

    // Deliberately throws so error tracking can be verified end-to-end. Public
    // (no auth preHandler). Safe to remove once GlitchTip wiring is confirmed.
    fastify.get('/debug-sentry', async () => {
        throw new Error('GlitchTip test error — vidyaverse-backend (safe to ignore)');
    });

    // Inline Zod validator — replaces fastify-type-provider-zod (incompatible with Fastify v4).
    // Duck-types the schema object: if it has .safeParse(), treat it as a Zod schema.
    // Fastify's default fast-json-stringify serialiser is kept for responses (no Zod response
    // schemas exist in this codebase, so setSerializerCompiler is intentionally omitted).
    fastify.setValidatorCompiler(({ schema }) => {
      const s = schema as any;
      if (s != null && typeof s.safeParse === 'function') {
        return (data: unknown) => {
          const result = s.safeParse(data);
          return result.success ? { value: result.data } : { error: result.error };
        };
      }
      // Non-Zod schema passthrough — should not occur in this codebase but safe to have.
      return (data: unknown) => ({ value: data });
    });

    await fastify.register(fastifyWebsocket);

    // Security
    await fastify.register(helmet, {
        contentSecurityPolicy: env.NODE_ENV === 'production',
    });

    // Cookie support (required for CSRF)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await fastify.register(fastifyCookie as any, {
        secret: env.JWT_SECRET,
    });

    // CSRF protection for state-changing requests
    await fastify.register(fastifyCsrf, {
        cookieOpts: { signed: true },
    });

    await fastify.register(cors, {
        origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : true,
        credentials: true,
    });

    await fastify.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
    });

    // File uploads
    await fastify.register(multipart, {
        limits: {
            fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
        },
    });

    // OAuth2 token/revoke endpoints are application/x-www-form-urlencoded per spec.
    // Fastify has no urlencoded parser by default (→ 415), and no other route uses
    // this content type, so this is additive. We keep the raw string as the body so
    // the Better Auth mount can forward it verbatim.
    fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
        done(null, body);
    });

    // API Documentation
    await fastify.register(swagger, {
        openapi: {
            info: {
                title: 'Vidyaverse Pro API',
                description: 'Comprehensive Educational Management Platform API',
                version: '1.0.0',
                contact: { name: 'Vidyaverse Team' },
            },
            servers: [
                { url: `http://localhost:${env.PORT}`, description: 'Local development' },
            ],
            tags: [
                { name: 'Auth', description: 'Authentication & authorization' },
                { name: 'Institutions', description: 'Institution management' },
                { name: 'Students', description: 'Student records' },
                { name: 'ID Cards', description: 'ID card generation' },
                { name: 'Certificates', description: 'Certificate generation' },
                { name: 'Templates', description: 'Template management' },
                { name: 'Group Photos', description: 'Group photo processing' },
                { name: 'Users', description: 'User management' },
                { name: 'System', description: 'Health checks & system info' },
            ],
            components: {
                securitySchemes: {
                    cookieAuth: {
                        type: 'apiKey',
                        in: 'cookie',
                        name: SESSION_COOKIE,
                        description: 'Session cookie set by Better Auth after sign-in',
                    },
                },
            },
        },
    });

    await fastify.register(swaggerUi, {
        routePrefix: '/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: true,
            persistAuthorization: true,
        },
    });

    // Custom plugins
    await fastify.register(errorHandlerPlugin);
    await fastify.register(authPlugin);
    await fastify.register(rbacPlugin);

    // ─────────────────────────────────────────────────────────────────────────
    // GLOBAL AUTH WALL (default-deny)
    // Every route registered after this point requires a valid Better Auth
    // session, EXCEPT the explicit public allowlist below. New modules are
    // therefore authenticated by default — no per-module hook can be forgotten.
    // Per-route requireRole/requireInstitution still apply on top for authZ.
    // Public = login/auth handler, health checks, static assets, external
    // HMAC-verified webhooks, and the public OAuth consent-branding lookup.
    // ─────────────────────────────────────────────────────────────────────────
    const PUBLIC_EXACT = new Set<string>([
        '/health',
        '/api/v1/system/health',
        '/test-ping',
    ]);
    const PUBLIC_PREFIXES = [
        '/api/auth/',                  // Better Auth: login, session, password reset, OIDC token/authorize/jwks/.well-known
        '/uploads/',                   // static assets (server-side render + <img>)
        '/api/v1/inbound/webhooks/',   // WhatsApp inbound webhook (raw-body HMAC)
        '/api/v1/payments/webhooks/',  // Razorpay / Cashfree webhooks (raw-body HMAC)
        '/api/v1/email/webhooks/',     // Resend bounce/complaint webhook (raw-body Svix HMAC)
        // Capability API. NOT public — it authenticates itself, accepting either a
        // session cookie OR an OIDC access token (see capabilities/bearer-auth.ts).
        // The global wall only understands cookies, so it would reject the relying
        // parties' token calls before the route's own hook ever ran.
        '/api/v1/entitlements/capabilities',
        '/api/v1/academic/my-class',   // Class/Section resolution — same self-authenticating story, see modules/academic/routes.ts
        '/api/v1/academic/my-curriculum-scope', // Institute curriculum scope pull — same self-authenticating story, see modules/academic/curriculum-scope.routes.ts
        // NOT public: /api/v1/academic/institutions/:id/curriculum-scope (admin CRUD)
        // relies on session-or-token auth PLUS requireRole — it must still pass
        // through this wall's exemption (it self-authenticates the same way) but the
        // role check inside the route is what actually gates it.
        '/api/v1/academic/institutions/',
        '/api/v1/oauth/',              // public OAuth consent-branding lookup
        // Taxonomy API. NOT public — it authenticates itself, accepting either a
        // shared service API key (PDLMS/DCP backends) OR a Vidyaverse admin session
        // (see modules/taxonomy/service-auth.ts). The global wall only understands
        // cookies, so a server-to-server API-key call would be rejected before the
        // route's own hook ever ran.
        '/api/v1/taxonomy/',
        // Curriculum v2 API: the same self-authenticating service-key-or-admin hook
        // (see modules/curriculum/routes.ts). Registered only with TAXONOMY_V2_ENABLED.
        '/api/v1/curriculum/',
    ];
    fastify.addHook('onRequest', async (request, reply) => {
        // CORS preflight carries no credentials — must pass.
        if (request.method === 'OPTIONS') return;
        const path = request.url.split('?')[0];
        if (PUBLIC_EXACT.has(path)) return;
        for (const prefix of PUBLIC_PREFIXES) {
            if (path.startsWith(prefix)) return;
        }
        // Throws UnauthorizedError (→ 401) when there is no valid session.
        await (fastify as typeof fastify & { authenticate: (req: typeof request, rep: typeof reply) => Promise<void> }).authenticate(request, reply);
    });

    // Root health check — used by Docker HEALTHCHECK and load balancers
    fastify.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
    }));

    // Static file serving for uploaded assets (local dev fallback for MinIO)
    fastify.get('/uploads/*', async (request, reply) => {
        const { '*': filePath } = request.params as { '*': string };
        const path = await import('path');
        const fs = await import('fs');
        const safePath = path.resolve(process.cwd(), 'uploads', filePath);
        
        // Prevent directory traversal
        if (!safePath.startsWith(path.resolve(process.cwd(), 'uploads'))) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        
        if (!fs.existsSync(safePath)) {
            return reply.status(404).send({ error: 'File not found' });
        }

        if (fs.statSync(safePath).isDirectory()) {
            return reply.status(404).send({ error: 'File not found' });
        }

        const ext = path.extname(safePath).toLowerCase();
        const mimeMap: Record<string, string> = {
            '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
        };
        
        const stream = fs.createReadStream(safePath);
        return reply
            .header('Content-Type', mimeMap[ext] || 'application/octet-stream')
            .header('Cache-Control', 'public, max-age=31536000')
            .send(stream);
    });

    // Detailed health check — used by API consumers and monitoring
    fastify.get('/api/v1/system/health', async () => {
        return {
            success: true,
            data: {
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                environment: env.NODE_ENV,
            },
        };
    });

    fastify.get('/test-ping', async () => ({ pong: true }));

    // Better Auth Routes
    fastify.all('/api/auth/*', async (request, reply) => {
        const url = new URL(request.url, env.API_BASE_URL || 'http://localhost:3002');
        const contentType = String(request.headers['content-type'] || '');
        const isForm = contentType.includes('x-www-form-urlencoded');
        const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method);
        // Forward form bodies raw (OAuth2 token/revoke); JSON bodies are re-serialized
        // from the parsed object. Re-encoding a form body as JSON would corrupt it and
        // break the OIDC token exchange for real relying parties.
        const forwardedBody = hasBody
            ? (isForm ? (request.body as string) : JSON.stringify(request.body))
            : undefined;
        const webReq = new Request(url, {
            method: request.method,
            headers: request.headers as HeadersInit,
            body: forwardedBody,
        });

        const response = await auth.handler(webReq);

        const headers: Record<string, string | string[]> = {};
        for (const [key, value] of response.headers as unknown as Iterable<[string, string]>) {
            if (key.toLowerCase() === 'set-cookie') {
                // Fastify can handle array set-cookies
                const existing = headers['set-cookie'] || [];
                headers['set-cookie'] = [...(Array.isArray(existing) ? existing : [existing]), value];
            } else {
                headers[key] = value;
            }
        }

        reply.headers(headers).status(response.status);
        const text = await response.text();
        return reply.send(text);
    });



    // Register Feature Modules
    await fastify.register(institutionModule);
    await fastify.register(branchModule);
    await fastify.register(userModule);
    await fastify.register(classModule);
    await fastify.register(streamModule);
    await fastify.register(sectionModule);
    await fastify.register(studentModule);
    await fastify.register(photoModule);
    await fastify.register(templateRoutes, { prefix: '/api/v1/templates' });
    await fastify.register(idCardRoutes, { prefix: '/api/v1/id-cards' });
    await fastify.register(certificateRoutes, { prefix: '/api/v1/certificates' });
    await fastify.register(groupPhotoRoutes, { prefix: '/api/v1/group-photos' });
    await fastify.register(portfolioRoutes, { prefix: '/api/v1/portfolios' });
    await fastify.register(hallTicketRoutes, { prefix: '/api/v1/hall-tickets' });
    await fastify.register(marksheetRoutes, { prefix: '/api/v1/marksheets' });
    await fastify.register(libraryCardRoutes, { prefix: '/api/v1/library-cards' });
    await fastify.register(transferCertificateRoutes, { prefix: '/api/v1/transfer-certificates' });
    await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
    await fastify.register(visitingCardRoutes, { prefix: '/api/v1/visiting-cards' });
    await fastify.register(jobRoutes, { prefix: '/api/v1/jobs' });
    await fastify.register(visionariumModule);
    await fastify.register(socialModule);
    await fastify.register(analyticsModule);
    await fastify.register(approvalRoutes, { prefix: '/api/approvals' });
    await fastify.register(opsRoutes, { prefix: '/api/ops' });
    await fastify.register(messagingModule);
    await fastify.register(paymentsModule);
    // Public Resend delivery-event webhook (separate plugin => no auth hook,
    // raw-body parsing for Svix signature verification).
    await fastify.register(emailWebhooks, { prefix: '/api/v1/email/webhooks' });
    await fastify.register(inboundModule);
    await fastify.register(adminModule);
    await fastify.register(entitlementsModule);
    await fastify.register(taxonomyModule);
    await fastify.register(curriculumModule);
    await fastify.register(academicModule);
    await fastify.register(admissionsModule);
    await fastify.register(transportModule);
    await fastify.register(hrModule);
    await fastify.register(financeModule);
    await fastify.register(timetableModule);
    await fastify.register(integrationsModule);
    await fastify.register(oidcModule);
    await fastify.register(hostelModule);
    await fastify.register(inventoryModule);
    await fastify.register(healthModule);
    await fastify.register(visitorModule);
    await fastify.register(gradebookModule);
    await fastify.register(assignmentsModule);
    await fastify.register(noticesModule);
    await fastify.register(reportsModule);
    await fastify.register(alumniModule);
    await fastify.register(placementModule);
    await fastify.register(biometricModule);
    await fastify.register(feesAdvancedModule);
    await fastify.register(liveClassesModule);
    await fastify.register(mobileAppModule);
    await fastify.register(onlineTestsModule);
    await fastify.register(chatRoutes, { prefix: '/api/v1/chat' });
    await fastify.register(callsRoutes, { prefix: '/api/v1/calls' });
    await fastify.register(attendanceModule);

    return fastify;
}

import { csvImportWorker } from './workers/csvImportWorker.js';
import { waOutboxWorker } from './workers/waOutboxWorker.js';
import { digestWorker, scheduleDigestJobs } from './workers/digestWorker.js';
import { inboundMediaWorker } from './workers/inboundMediaWorker.js';
import { startAllWorkers } from './workers/index.js';

// Background workers started via startAllWorkers() (ID-card/photo/group-photo/etc.).
// Captured so they can be closed on graceful shutdown.
let backgroundWorkers: Array<{ close?: () => Promise<void> } | undefined> = [];

// Graceful shutdown
async function gracefulShutdown(fastify: any, signal: string) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    await csvImportWorker.close();
    await waOutboxWorker.close();
    await digestWorker.close();
    await inboundMediaWorker.close();
    await Promise.allSettled(backgroundWorkers.map((w) => w?.close?.()));
    await fastify.close();
    await disconnectDatabase();
    await disconnectRedis();

    logger.info('Server shut down successfully');
    process.exit(0);
}

// Main startup
async function main() {
    try {
        // Connect to services
        logger.info('Connecting to database...');
        await connectDatabase();

        logger.info('Connecting to Redis...');
        await connectRedis();

        logger.info('Initializing MinIO...');
        await initializeMinio();

        // Schedule repeatable WhatsApp digest flush jobs (30-min + 17:00 IST)
        await scheduleDigestJobs();

        // Start background job workers (ID-card generation, photo enhancement,
        // group photos, photo-zip import, monthly usage reset). Without this the
        // BullMQ queues are produced-to but never consumed.
        backgroundWorkers = startAllWorkers();

        // Instantiate app
        const app = await buildApp();

        await initChatWsSubscriber(app);

        // Start server
        await app.listen({
            port: env.PORT,
            host: '0.0.0.0',
        });

        logger.info(`
    🚀 Vidyaverse Pro API Server
    ============================
    Environment: ${env.NODE_ENV}
    Port: ${env.PORT}
    API Docs: ${env.API_BASE_URL}/docs
    Health: ${env.API_BASE_URL}/api/v1/system/health
    `);

        // Handle shutdown signals
        process.on('SIGTERM', () => gracefulShutdown(app, 'SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown(app, 'SIGINT'));
    } catch (error) {
        console.error('FULL ERROR:', error);
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

if (process.env.NODE_ENV !== 'test') {
    main();
}
