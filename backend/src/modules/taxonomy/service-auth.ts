/**
 * Accepts a shared-secret API key on the taxonomy read/tagging endpoints, OR falls
 * through to a normal Vidyaverse admin session.
 *
 * This is deliberately NOT the same shape as capabilities' bearer-auth.ts. Capability
 * reads are "what may THIS signed-in user do" — inherently per-user, so an OIDC access
 * token (which names a user) is the right credential. Taxonomy reads are reference
 * data ("what does the tree look like", "what is book X tagged as") with no per-user
 * dimension — the caller is a PDLMS/DCP BACKEND, not a browser holding a user's token.
 * A shared secret is the right credential for a server-to-server reference-data call;
 * inventing a per-user token flow for a request that names no user would be the wrong
 * shape.
 *
 * Vidyaverse's own admin UI reaches the same endpoints too (to render the tagging
 * picker in its book/course integrations), authenticated normally via session cookie
 * — hence the fallback rather than requiring every caller to know the API key.
 */
import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';

const SUPER_ROLES = ['super_admin', 'admin'];
const API_KEY_HEADER = 'x-taxonomy-api-key';

/** The service key, or a Vidyaverse session holding one of `roles` (any signed-in user when `roles` is null). */
function authenticateServiceOr(roles: string[] | null) {
    return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        const presented = request.headers[API_KEY_HEADER];
        const key = Array.isArray(presented) ? presented[0] : presented;

        if (key) {
            if (!env.TAXONOMY_SERVICE_API_KEY) {
                return reply.status(503).send({
                    success: false,
                    error: 'Taxonomy service API key is not configured on this deployment.',
                });
            }
            if (key !== env.TAXONOMY_SERVICE_API_KEY) {
                return reply.status(401).send({ success: false, error: 'Invalid taxonomy service API key' });
            }
            // No per-user identity to attach — this is a service-to-service call.
            return;
        }

        // No API key presented — fall back to a normal admin session.
        const server = request.server as unknown as {
            authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void>;
            requireRole: (roles: string[]) => (req: FastifyRequest, rep: FastifyReply) => Promise<void>;
    };
    await server.authenticate(request, reply);
    if (reply.sent || !roles) return;
    await server.requireRole(roles)(request, reply);
    };
}

export const authenticateServiceOrAdmin = authenticateServiceOr(SUPER_ROLES);

/**
 * For curriculum v2 reads only: the education taxonomy is public reference data (boards, classes, exams), and an
 * institution's own admin needs it to say which class their class is. Any signed-in Vidyaverse user, or the key.
 */
export const authenticateServiceOrSession = authenticateServiceOr(null);
