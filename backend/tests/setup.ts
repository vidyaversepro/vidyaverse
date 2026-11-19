import { vi, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/database';
import { auth } from '../src/lib/auth';

// Mock Redis
vi.mock('../src/config/redis', () => {
    const mockRedisClient = {
        get: vi.fn(),
        set: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
        ping: vi.fn().mockResolvedValue('PONG'),
        scanStream: vi.fn(),
    };
    return {
        getRedisClient: vi.fn(() => mockRedisClient),
        connectRedis: vi.fn(),
        disconnectRedis: vi.fn(),
        cache: {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue(undefined),
            del: vi.fn().mockResolvedValue(undefined),
            delPattern: vi.fn().mockResolvedValue(undefined),
        },
        CACHE_TTL: {
            INSTITUTION_SETTINGS: 3600,
            TEMPLATES: 1800,
            STUDENT_LIST: 300,
            USER_SESSION: 900,
            IMAGE_HASH: 2592000,
        },
    };
});

// Mock MinIO storage
vi.mock('../src/config/minio', () => ({
    storage: {
        uploadFile: vi.fn().mockResolvedValue('https://storage.example.com/file.pdf'),
        deleteFile: vi.fn().mockResolvedValue(true),
        getPresignedUrl: vi.fn().mockResolvedValue('https://storage.example.com/signed-url'),
        generateObjectName: vi.fn((inst, folder, name) => `${inst}/${folder}/${name}`),
    },
}));

// Mock logger
// Mock logger
vi.mock('../src/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

// Test database connection (optional for pure unit tests)
beforeAll(async () => {
    try {
        await prisma.$connect();
    } catch {
        // Database not available — unit tests with mocks will still work
        console.warn('⚠️  Database not available. Integration tests will be skipped.');
    }
});

afterAll(async () => {
    await prisma.$disconnect();
});

// Test utilities
export const createTestInstitution = async () => {
    return prisma.institution.create({
        data: {
            name: `Test Institution ${Math.random().toString(36).substring(7)}`,
            code: `TEST${Math.random().toString(36).substring(7)}`,
            contactEmail: `test${Math.random().toString(36).substring(7)}@example.com`,
            address: 'Test Address',
        },
    });
};

export const createTestUser = async (institutionId: string, role = 'school_admin') => {
    const email = `user${Math.random().toString(36).substring(7)}@example.com`;
    const password = 'TestPassword123!';

    try {
        // Create user via better-auth API to guarantee correct hashing
        const res = await auth.api.signUpEmail({
            body: {
                email,
                password,
                name: 'Test User',
            }
        });

        if (!res || !res.user) {
            console.error("signUpEmail response:", res);
            throw new Error('Failed to create test user via better-auth API');
        }

        // Append the custom institution roles & activate
        return prisma.user.update({
            where: { id: res.user.id },
            data: {
                // Sign-up can no longer set it (lib/auth.ts, input: false).
                globalRole: role === 'super_admin' ? 'super_admin' : 'user',
                isActive: true,
                institutionRoles: {
                    create: {
                        institutionId,
                        role: (role === 'super_admin' ? 'school_admin' : role) as any,
                    }
                }
            }
        });
    } catch (err) {
        console.error("Error in createTestUser:", err);
        throw err;
    }
};

export const createTestSession = async (userId: string) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found for session setup");

    // Sign in programmatically to get a valid token string
    const res = await auth.api.signInEmail({
        body: {
            email: user.email,
            password: 'TestPassword123!'
        },
        asResponse: true
    });

    const cookie = res.headers.get('set-cookie');
    if (!cookie) {
        throw new Error('Failed to create test session via better-auth API');
    }

    return { cookie };
};

export const createTestClass = async (institutionId: string, name = 'Class 10') => {
    return prisma.class.create({
        data: {
            institutionId,
            name,
            displayOrder: 1,
        },
    });
};

export const createTestSection = async (classId: string, name = 'A') => {
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    return prisma.section.create({
        data: {
            classId,
            institutionId: cls!.institutionId,
            name,
        },
    });
};

export const createTestStudent = async (institutionId: string, sectionId: string) => {
    return prisma.student.create({
        data: {
            institutionId,
            sectionId,
            admissionNumber: `ADM${Math.random().toString(36).substring(7)}`,
            name: 'Test Student',
            sex: 'male',
            dob: new Date('2010-01-01'),
            status: 'active',
        },
    });
};

export const cleanupTestData = async (institutionId: string) => {
    try {
        // Clean up in correct order due to foreign keys
        await prisma.attendanceRecord.deleteMany({ where: { session: { institutionId } } });
        await prisma.attendanceSession.deleteMany({ where: { institutionId } });
        await prisma.approvalStep.deleteMany({ where: { request: { institutionId } } });
        await prisma.approvalRequest.deleteMany({ where: { institutionId } });
        await prisma.approvalWorkflow.deleteMany({ where: { institutionId } });
        await prisma.notificationLog.deleteMany({ where: { institutionId } });
        await prisma.notification.deleteMany({ where: { institutionId } });
        await prisma.portfolioSection.deleteMany({ where: { portfolio: { institutionId } } });
        await prisma.portfolio.deleteMany({ where: { institutionId } });
        await prisma.libraryCard.deleteMany({ where: { institutionId } });
        await prisma.transferCertificate.deleteMany({ where: { institutionId } });
        await prisma.marksheet.deleteMany({ where: { institutionId } });
        await prisma.hallTicket.deleteMany({ where: { institutionId } });
        await prisma.examSubject.deleteMany({ where: { examSchedule: { institutionId } } });
        await prisma.examSchedule.deleteMany({ where: { institutionId } });
        await prisma.certificate.deleteMany({ where: { institutionId } });
        await prisma.idCard.deleteMany({ where: { institutionId } });
        await prisma.student.deleteMany({ where: { institutionId } });
        await prisma.section.deleteMany({ where: { class: { institutionId } } });
        await prisma.class.deleteMany({ where: { institutionId } });
        await prisma.subject.deleteMany({ where: { institutionId } });
        await prisma.template.deleteMany({ where: { institutionId } });
        await prisma.session.deleteMany();
        await prisma.user.deleteMany({ where: { institutionRoles: { some: { institutionId } } } });
        await prisma.institution.deleteMany({ where: { id: institutionId } });
    } catch (error) {
        console.error('Cleanup failed:', error);
    }
};
