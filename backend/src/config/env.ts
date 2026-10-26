import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    // Application
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform(Number).default('3000'),
    API_BASE_URL: z.string().default('http://localhost:3000'),
    FRONTEND_URL: z.string().default('http://localhost:5173'),

    // Database
    DATABASE_URL: z.string(),
    DB_CONNECTION_LIMIT: z.string().transform(Number).default('100'),

    // Redis
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_PASSWORD: z.string().optional(),

    // Authentication
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRY: z.string().default('7d'),

    // Cloudflare R2
    R2_ENDPOINT: z.string().url('R2_ENDPOINT must be a valid URL'),
    R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
    R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
    R2_BUCKET_NAME: z.string().default('vidyaverse'),
    R2_PUBLIC_URL: z.string().url('R2_PUBLIC_URL must be a valid URL'),
    R2_REGION: z.string().default('auto'),

    // AI Enhancement
    GEMINI_API_KEY: z.string().optional(),
    ENABLE_AI_ENHANCEMENT: z.string().transform((v) => v === 'true').default('true'),
    OPENCV_THRESHOLD: z.string().transform(Number).default('0.5'),

    // Entitlements (Postgres). Its own datasource, separate from the MySQL ERP
    // database: it is the first component to live on Postgres and keeps its own
    // module boundary so it can be extracted into a service later. When unset the
    // capability API is not registered, so existing environments are unaffected.
    ENTITLEMENTS_DATABASE_URL: z.string().optional(),
    /** Shared secret for HMAC-signing capability-invalidation webhooks to the RPs. */
    ENTITLEMENTS_WEBHOOK_SECRET: z.string().optional(),

    // Taxonomy (Postgres). Same opt-in, separate-datasource shape as entitlements —
    // the shared book-classification tree PDLMS and DigiClassroom both read from.
    // When unset the taxonomy API is not registered.
    TAXONOMY_DATABASE_URL: z.string().optional(),
    /** Shared secret the relying parties (PDLMS/DCP backends) present to call the
     *  taxonomy read/write API server-to-server — this is reference data, not a
     *  per-user resource, so it is not gated behind an OIDC access token like
     *  capabilities is. */
    TAXONOMY_SERVICE_API_KEY: z.string().optional(),
    /** Curriculum v2: load the vendored edu-taxonomy release (Book Buddy's taxonomy) into
     *  taxonomy.node and serve it at /api/v1/curriculum/*. Off until
     *  prisma/taxonomy/migrations/001_curriculum_v2.sql has been applied. */
    TAXONOMY_V2_ENABLED: z.string().transform((v) => v === 'true').default('false'),

    // Email
    // Resend is the preferred transport — it reports bounces and complaints, which
    // shared SMTP does not. When RESEND_API_KEY is absent the mailer falls back to
    // SMTP, so existing environments keep working untouched.
    RESEND_API_KEY: z.string().optional(),
    // Signing secret for the Resend event webhook (`whsec_…`). Without it the
    // webhook refuses every request rather than trusting unsigned input.
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().transform(Number).optional(),
    SMTP_SECURE: z.string().transform((v) => v === 'true').default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().default('Vidyaverse Pro <noreply@vidyaverse.app>'),

    // System
    MAX_UPLOAD_SIZE_MB: z.string().transform(Number).default('10'),
    DEFAULT_TRIAL_DAYS: z.string().transform(Number).default('7'),
    MAINTENANCE_MODE: z.string().transform((v) => v === 'true').default('false'),
    ENABLE_REGISTRATION: z.string().transform((v) => v === 'true').default('true'),

    // WhatsApp / Meta Cloud API (Phase 1 messaging rail). Optional so existing
    // deployments keep validating; per-institution phoneNumberId lives in the DB.
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_API_VERSION: z.string().default('v18.0'),
    WHATSAPP_DIGEST_WINDOW_MINUTES: z.string().transform(Number).default('30'),

    // Payment gateways (Phase 2). Optional so existing deployments keep validating.
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    CASHFREE_APP_ID: z.string().optional(),
    CASHFREE_SECRET_KEY: z.string().optional(),
    CASHFREE_WEBHOOK_SECRET: z.string().optional(),

    // Inbound AI (Phase 3). Optional — without a key the pipeline uses a
    // rule-based keyword classifier so it still works in dev.
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default('claude-3-5-haiku-latest'),

    // Voice transcription (Phase 4). Optional — degrades gracefully if absent.
    BHASHINI_API_KEY: z.string().optional(),
    BHASHINI_PIPELINE_ID: z.string().optional(),
    AZURE_SPEECH_KEY: z.string().optional(),
    AZURE_SPEECH_REGION: z.string().optional(),

    // Better Auth
    BETTER_AUTH_URL: z.string().default('http://localhost:3002'),
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),

    // OIDC Provider (Phase 2 — federation). When OIDC_ENABLED=false the plugin is
    // not registered, so existing deployments and tests are unaffected.
    OIDC_ENABLED: z.string().transform((v) => v === 'true').default('false'),
    // The `iss` claim on every issued ID token. Production is api.vgraphics.in.
    // Locked once any tokens are issued — changing it later invalidates them.
    VIDYAVERSE_ISSUER: z.string().optional(),
    // Trusted origins for relying parties — added to Better Auth trustedOrigins.
    PDLMS_ORIGIN: z.string().optional(),
    DCP_ORIGIN: z.string().optional(),

    // LiveKit (Phase 5 - Calls)
    LIVEKIT_API_KEY: z.string().default('devkey'),
    LIVEKIT_API_SECRET: z.string().default('secret'),
    LIVEKIT_WS_URL: z.string().default('ws://localhost:7880'),
});


// NOTE: process.env and console.error are intentional here — logger is not yet
// initialized during env validation. This is the only file exempt from the
// "zero console.log/console.error" and "zero process.env direct access" rules.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;

// Subscription tier limits
export const SUBSCRIPTION_LIMITS = {
    starter: {
        maxStudents: 500,
        maxTemplates: 3,
        maxUsersPerInstitution: 10,
        aiEnhancementsPerMonth: 100,
        pdfPagesPerMonth: 500,
        bulkOperationsPerDay: 10,
        storageGB: 5,
        enabledServices: ['id_card', 'certificate', 'library_card'],
        emailNotifications: 100,
        smsNotifications: 0,
        whatsappPerMonth: 1000,
        customDomain: false,
        whiteLabel: false,
        apiAccess: false,
        prioritySupport: false,
    },
    professional: {
        maxStudents: 2000,
        maxTemplates: 10,
        maxUsersPerInstitution: 50,
        aiEnhancementsPerMonth: 1000,
        pdfPagesPerMonth: 5000,
        bulkOperationsPerDay: 100,
        storageGB: 20,
        enabledServices: ['id_card', 'certificate', 'group_photo', 'portfolio', 'hall_ticket', 'marksheet', 'library_card', 'transfer_certificate'],
        emailNotifications: 1000,
        smsNotifications: 500,
        whatsappPerMonth: 10000,
        customDomain: false,
        whiteLabel: false,
        apiAccess: true,
        prioritySupport: false,
    },
    enterprise: {
        maxStudents: -1,
        maxTemplates: -1,
        maxUsersPerInstitution: -1,
        aiEnhancementsPerMonth: -1,
        pdfPagesPerMonth: -1,
        bulkOperationsPerDay: -1,
        storageGB: 100,
        enabledServices: ['id_card', 'certificate', 'group_photo', 'portfolio', 'hall_ticket', 'marksheet', 'library_card', 'transfer_certificate'],
        emailNotifications: -1,
        smsNotifications: -1,
        whatsappPerMonth: -1,
        customDomain: true,
        whiteLabel: true,
        apiAccess: true,
        prioritySupport: true,
    },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_LIMITS;
