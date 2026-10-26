/**
 * GET /my-curriculum-scope: stored ids by default (DigiClassroom reads it so), the ids plus everything below them
 * with ?expand=descendants (PDLMS, curriculum v2 on), and no scope at all when the expansion fails.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ ids: [] as string[] }));
const expansion = vi.hoisted(() => ({
    available: true,
    expandScope: vi.fn(async (ids: string[]) => [...ids, 'child-of-' + ids[0]]),
}));

vi.mock('../curriculum-scope-service.js', () => ({
    getScopeNodeIdsForUser: vi.fn(async () => stored.ids),
    getInstitutionScope: vi.fn(),
    setInstitutionScope: vi.fn(),
}));
vi.mock('../../curriculum/scope-expansion.js', () => ({
    scopeExpansionAvailable: () => expansion.available,
    expandScope: expansion.expandScope,
}));
vi.mock('../../entitlements/capabilities/bearer-auth.js', () => ({
    authenticateSessionOrToken: async (request: { user?: { userId: string } }) => {
        request.user = { userId: 'u1' };
    },
}));

import curriculumScopeRoutes from '../curriculum-scope.routes';

describe('GET /my-curriculum-scope', () => {
    let app: FastifyInstance;
    const get = async (query = '') => (await app.inject({ method: 'GET', url: `/my-curriculum-scope${query}` })).json();

    beforeAll(async () => {
        app = Fastify();
        app.decorate('requireRole', () => async () => undefined);
        await app.register(curriculumScopeRoutes);
        await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => {
        stored.ids = ['class-9'];
        expansion.available = true;
        expansion.expandScope.mockClear();
        expansion.expandScope.mockImplementation(async (ids) => [...ids, 'child-of-' + ids[0]]);
    });

    it('returns the stored ids when not asked to expand', async () => {
        expect(await get()).toEqual({ success: true, data: { scopeNodeIds: ['class-9'] } });
        expect(expansion.expandScope).not.toHaveBeenCalled();
    });

    it('returns the ids and what is below them when asked', async () => {
        expect(await get('?expand=descendants')).toEqual({ success: true, data: { scopeNodeIds: ['class-9', 'child-of-class-9'] } });
    });

    it('returns the stored ids when curriculum v2 is off here', async () => {
        expansion.available = false;
        expect(await get('?expand=descendants')).toEqual({ success: true, data: { scopeNodeIds: ['class-9'] } });
        expect(expansion.expandScope).not.toHaveBeenCalled();
    });

    it('does not look anything up for an institute with no scope', async () => {
        stored.ids = [];
        expect(await get('?expand=descendants')).toEqual({ success: true, data: { scopeNodeIds: [] } });
        expect(expansion.expandScope).not.toHaveBeenCalled();
    });

    it('fails open to no scope when the expansion fails', async () => {
        expansion.expandScope.mockRejectedValue(new Error('taxonomy db down'));
        expect(await get('?expand=descendants')).toEqual({ success: true, data: { scopeNodeIds: [] } });
    });

    it('ignores any other value of expand', async () => {
        expect(await get('?expand=everything')).toEqual({ success: true, data: { scopeNodeIds: ['class-9'] } });
    });
});
