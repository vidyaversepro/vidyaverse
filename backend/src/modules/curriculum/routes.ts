/**
 * Curriculum API: Book Buddy's education taxonomy, served to DigiClassroom and PDLMS.
 *
 * Same paths, query parameters and response bodies as Book Buddy's CurriculumController
 * (`/curriculum/domains | nodes | nodes/:id | nodes/:id/combinations | search`), so the clients in the other apps
 * are the same code as Book Buddy's own. Bodies are therefore bare (no `{ success, data }` envelope), and errors use
 * NestJS's `{ statusCode, message, error }` shape.
 *
 * Authenticated by the taxonomy service key or any Vidyaverse session (../taxonomy/service-auth.ts): the taxonomy is
 * public reference data, and an institution's admin picks their classes' nodes from it. Read-only. So the
 * prefix is in PUBLIC_PREFIXES in src/index.ts, as for /api/v1/taxonomy/.
 */
import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { taxonomyDb } from '../taxonomy/client.js';
import { authenticateServiceOrSession } from '../taxonomy/service-auth.js';
import { CurriculumNodeNotFoundError, CurriculumService } from './service.js';

const uuid = z.string().uuid();

const badRequest = (reply: FastifyReply, message: string) =>
    reply.status(400).send({ statusCode: 400, message, error: 'Bad Request' });

function notFound(err: unknown, reply: FastifyReply) {
    if (err instanceof CurriculumNodeNotFoundError) {
        return reply.status(404).send({ statusCode: 404, message: err.message, error: 'Not Found' });
    }
    throw err;
}

const curriculumRoutes: FastifyPluginAsync<{ service?: CurriculumService }> = async (fastify, opts) => {
    fastify.addHook('onRequest', authenticateServiceOrSession);
    const curriculum = opts.service ?? new CurriculumService(taxonomyDb());

    fastify.get('/domains', async () => curriculum.domains());

    /** `parentId` empty means the top level. */
    fastify.get('/nodes', async (request, reply) => {
        const { parentId } = request.query as { parentId?: string };
        if (parentId && !uuid.safeParse(parentId).success) return badRequest(reply, 'Validation failed (uuid is expected)');
        try {
            return await curriculum.childrenOf(parentId || null);
        } catch (err) {
            return notFound(err, reply);
        }
    });

    fastify.get('/nodes/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        if (!uuid.safeParse(id).success) return badRequest(reply, 'Validation failed (uuid is expected)');
        try {
            return await curriculum.node(id);
        } catch (err) {
            return notFound(err, reply);
        }
    });

    fastify.get('/nodes/:id/combinations', async (request, reply) => {
        const { id } = request.params as { id: string };
        if (!uuid.safeParse(id).success) return badRequest(reply, 'Validation failed (uuid is expected)');
        return curriculum.combinationsFor(id);
    });

    fastify.get('/search', async (request) => {
        const { q = '', domain, types, limit } = request.query as Record<string, string | undefined>;
        const n = limit ? Number(limit) : undefined;
        return curriculum.search(q, {
            domain: domain || undefined,
            types: types ? types.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean) : undefined,
            limit: n !== undefined && Number.isFinite(n) ? n : undefined,
        });
    });
};

export default curriculumRoutes;
