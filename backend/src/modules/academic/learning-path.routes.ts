/**
 * The learner's own learning path (what they study, and in which medium), for Vidyaverse's own pages and for the
 * relying parties: DigiClassroom and PDLMS read and write it for federated learners with the OIDC access token
 * they already hold, exactly as they call /my-class. Session cookie OR bearer token, so this prefix is in
 * index.ts's PUBLIC_PREFIXES with the rest of /api/v1/academic. No userId parameter: only ever the caller's own.
 */
import { FastifyPluginAsync } from 'fastify';
import { authenticateSessionOrToken } from '../entitlements/capabilities/bearer-auth.js';
import { getLearningPath, setLearningPath } from './learning-path-service.js';

const learningPathRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook('onRequest', authenticateSessionOrToken);

    fastify.get('/my-learning-path', async (request, reply) => {
        const userId = request.user?.userId;
        if (!userId) return reply.status(401).send({ success: false, error: 'Not authenticated' });
        return reply.send({ success: true, data: await getLearningPath(userId) });
    });

    fastify.put('/my-learning-path', async (request, reply) => {
        const userId = request.user?.userId;
        if (!userId) return reply.status(401).send({ success: false, error: 'Not authenticated' });
        return reply.send({ success: true, data: await setLearningPath(userId, request.body) });
    });
};

export default learningPathRoutes;
