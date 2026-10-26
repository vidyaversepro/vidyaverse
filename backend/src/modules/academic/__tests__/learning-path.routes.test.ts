/**
 * GET/PUT /my-learning-path: only ever the caller's own path, as the session or bearer token says.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ get: [] as string[], set: [] as Array<[string, unknown]>, user: 'u1' as string | null }));

vi.mock('../learning-path-service.js', () => ({
    getLearningPath: vi.fn(async (userId: string) => {
        calls.get.push(userId);
        return { prompt: true, goals: [] };
    }),
    setLearningPath: vi.fn(async (userId: string, body: unknown) => {
        calls.set.push([userId, body]);
        return { prompt: false, goals: [] };
    }),
}));
vi.mock('../../entitlements/capabilities/bearer-auth.js', () => ({
    authenticateSessionOrToken: async (request: { user?: { userId: string } }) => {
        if (calls.user) request.user = { userId: calls.user };
    },
}));

import learningPathRoutes from '../learning-path.routes';

describe('/my-learning-path', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
        app = Fastify();
        await app.register(learningPathRoutes);
        await app.ready();
    });
    afterAll(() => app.close());

    it("reads and writes the caller's own path", async () => {
        calls.user = 'u1';
        expect((await app.inject({ method: 'GET', url: '/my-learning-path?userId=someone-else' })).json()).toEqual({ success: true, data: { prompt: true, goals: [] } });
        const body = { goals: [{ nodeId: 'n' }], medium: 'hi' };
        expect((await app.inject({ method: 'PUT', url: '/my-learning-path', payload: body })).json()).toEqual({ success: true, data: { prompt: false, goals: [] } });
        expect(calls.get).toEqual(['u1']);
        expect(calls.set).toEqual([['u1', body]]);
    });

    it('401 without a session or token', async () => {
        calls.user = null;
        expect((await app.inject({ method: 'GET', url: '/my-learning-path' })).statusCode).toBe(401);
        expect((await app.inject({ method: 'PUT', url: '/my-learning-path', payload: {} })).statusCode).toBe(401);
    });
});
