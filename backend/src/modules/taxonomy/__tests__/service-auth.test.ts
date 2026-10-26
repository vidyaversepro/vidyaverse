/**
 * The taxonomy key, or a session: curriculum reads accept any signed-in user, everything else needs an admin.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env.js', () => ({ env: { TAXONOMY_SERVICE_API_KEY: 'k' } }));

import { authenticateServiceOrAdmin, authenticateServiceOrSession } from '../service-auth';

function call(fn: typeof authenticateServiceOrAdmin, headers: Record<string, string> = {}) {
    const requireRole = vi.fn(() => async () => undefined);
    const authenticate = vi.fn(async () => undefined);
    const sent: number[] = [];
    const reply: any = { sent: false, status: (s: number) => ({ send: () => sent.push(s) }) };
    const request: any = { headers, server: { authenticate, requireRole } };
    return fn(request, reply).then(() => ({ requireRole, authenticate, sent }));
}

describe('taxonomy service auth', () => {
    it('the key alone is enough for both', async () => {
        for (const fn of [authenticateServiceOrAdmin, authenticateServiceOrSession]) {
            const r = await call(fn, { 'x-taxonomy-api-key': 'k' });
            expect([r.authenticate.mock.calls.length, r.sent]).toEqual([0, []]);
        }
        expect((await call(authenticateServiceOrSession, { 'x-taxonomy-api-key': 'wrong' })).sent).toEqual([401]);
    });

    it('without a key: a session for curriculum reads, an admin session otherwise', async () => {
        const session = await call(authenticateServiceOrSession);
        expect([session.authenticate.mock.calls.length, session.requireRole.mock.calls.length]).toEqual([1, 0]);
        const admin = await call(authenticateServiceOrAdmin);
        expect(admin.requireRole).toHaveBeenCalledWith(['super_admin', 'admin']);
    });
});
