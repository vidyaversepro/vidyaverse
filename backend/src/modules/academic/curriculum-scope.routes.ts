/**
 * Institute curriculum scope — admin management, and the RP-facing pull endpoint
 * both PDLMS and DigiClassroom call to pre-scope a student's retrieval.
 *
 * Same self-authenticating story as capabilities/academic (session cookie OR OIDC
 * bearer token — an RP holds a token, not a Vidyaverse session), so this module's
 * prefix is listed in index.ts's PUBLIC_PREFIXES for the same reason documented
 * there.
 */
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { expandScope, scopeExpansionAvailable } from '../curriculum/scope-expansion.js';
import { authenticateSessionOrToken } from '../entitlements/capabilities/bearer-auth.js';
import {
    getInstitutionScope,
    getScopeNodeIdsForUser,
    setInstitutionScope,
} from './curriculum-scope-service.js';

const SUPER_ROLES = ['super_admin', 'admin'];

const setScopeSchema = z.object({
    taxonomyNodeIds: z.array(z.string().uuid()),
});

const curriculumScopeRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook('onRequest', authenticateSessionOrToken);

    /**
     * The signed-in student's own institute curriculum scope — what PDLMS/DCP call.
     * Scoped to the caller's own session on purpose, same reasoning as capabilities
     * and /my-class: no institutionId parameter, so this cannot become an
     * enumeration endpoint. Never errors — see curriculum-scope-service.ts's
     * fail-open policy; an empty array means "no scope configured" and "hub
     * unreachable" alike, both of which mean the same thing to the caller: don't
     * filter.
     */
    fastify.get('/my-curriculum-scope', async (request, reply) => {
        const userId = request.user?.userId;
        if (!userId) {
            return reply.status(401).send({ success: false, error: 'Not authenticated' });
        }
        let scopeNodeIds = await getScopeNodeIdsForUser(userId);
        // `?expand=descendants` (PDLMS, with curriculum v2 on) asks for each scope node plus everything below it.
        // Without the parameter, or with v2 off here, the scope is returned as stored, as DigiClassroom reads it.
        const { expand } = request.query as { expand?: string };
        if (expand === 'descendants' && scopeNodeIds.length > 0 && scopeExpansionAvailable()) {
            try {
                scopeNodeIds = await expandScope(scopeNodeIds);
            } catch (err) {
                // Fail open like the rest of this endpoint: the stored ids alone would hide books tagged below them.
                logger.warn(`[curriculum-scope] could not expand scope for ${userId}, returning no scope: ${(err as Error).message}`);
                scopeNodeIds = [];
            }
        }
        return reply.send({ success: true, data: { scopeNodeIds } });
    });

    /** Admin: read an institute's configured scope. */
    fastify.get('/institutions/:id/curriculum-scope', {
        preHandler: [fastify.requireRole(SUPER_ROLES)],
        handler: async (request, reply) => {
            const { id } = request.params as { id: string };
            const scopeNodeIds = await getInstitutionScope(id);
            return reply.send({ success: true, data: { institutionId: id, scopeNodeIds } });
        },
    });

    /** Admin: replace an institute's full scope. */
    fastify.put('/institutions/:id/curriculum-scope', {
        preHandler: [fastify.requireRole(SUPER_ROLES)],
        handler: async (request, reply) => {
            const { id } = request.params as { id: string };
            const parsed = setScopeSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send({ success: false, error: parsed.error.message });
            }
            const scopeNodeIds = await setInstitutionScope(id, parsed.data.taxonomyNodeIds, request.user?.userId);
            return reply.send({ success: true, data: { institutionId: id, scopeNodeIds } });
        },
    });
};

export default curriculumScopeRoutes;
