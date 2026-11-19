/**
 * The platform role is never settable through better-auth's own endpoints.
 * `globalRole` used to be an ordinary additional field, so an anonymous
 * POST /api/auth/sign-up/email with "globalRole":"admin" created a platform
 * admin ('admin' passes every SUPER_ROLES gate), and /update-user would have
 * let any signed-in user promote themselves. lib/auth.ts marks it input: false.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index';
import { prisma } from '../../src/config/database';
import { auth } from '../../src/lib/auth';
import { createTestSession } from '../setup';

const tag = `sr-${Math.random().toString(36).slice(2, 8)}`;
const roleOf = async (where: { id: string } | { email: string }) =>
    (await prisma.user.findFirst({ where, select: { globalRole: true } }))?.globalRole;

describe('globalRole is not client-settable', () => {
    let app: FastifyInstance;
    let userId: string;
    let cookie: string;
    const origin = process.env.FRONTEND_URL || 'http://localhost:5173';

    beforeAll(async () => {
        app = (await buildApp()) as unknown as FastifyInstance;
        await app.ready();
        const res = await auth.api.signUpEmail({ body: { email: `${tag}-member@example.test`, password: 'TestPassword123!', name: 'Member' } });
        userId = res.user.id;
        // Sign-in needs a verified address.
        await prisma.user.update({ where: { id: userId }, data: { emailVerified: true, isActive: true, globalRole: 'user' } });
        cookie = (await createTestSession(userId)).cookie.split(';')[0];
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
        await app.close();
    });

    const signUp = (n: string, extra: Record<string, unknown>) => app.inject({
        method: 'POST', url: '/api/auth/sign-up/email', headers: { origin },
        payload: { email: `${tag}-${n}@example.test`, password: 'TestPassword123!', name: `Sign-up ${n}`, ...extra },
    });

    it('signs up an ordinary account with the default role', async () => {
        const res = await signUp('plain', {});
        expect(res.statusCode).toBe(200);
        expect(await roleOf({ email: `${tag}-plain@example.test` })).toBe('student');
    });

    it.each(['admin', 'support', 'super_admin'])('anonymous sign-up cannot ask for %s', async (role) => {
        const res = await signUp(role, { globalRole: role });
        // Refused outright, or created without the role: never the role.
        expect(await roleOf({ email: `${tag}-${role}@example.test` }) ?? null).not.toBe(role);
        expect(res.statusCode).not.toBe(500);
    });

    it('a signed-in user cannot promote themselves through /update-user', async () => {
        const update = (payload: Record<string, unknown>) => app.inject({
            method: 'POST', url: '/api/auth/update-user', headers: { origin, cookie }, payload,
        });
        // The route is reachable with these headers (so a refusal below is about the field).
        expect((await update({ name: 'Renamed Member' })).statusCode).toBe(200);
        expect((await prisma.user.findUnique({ where: { id: userId } }))?.name).toBe('Renamed Member');

        await update({ globalRole: 'admin' });
        expect(await roleOf({ id: userId })).toBe('user');
    });
});
