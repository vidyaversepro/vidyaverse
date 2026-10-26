import { FastifyRequest, FastifyReply } from 'fastify';
import { createClassService } from './service.js';
import { getTenantPrisma } from '../../lib/prisma-tenant.js';

function getService(request: FastifyRequest) {
    if (request.institutionId) {
        return createClassService(getTenantPrisma(request.institutionId));
    }
    return createClassService();
}
import { NotFoundError } from '../../utils/errors.js';
import { setClassCurriculum } from '../academic/learning-path-service.js';

export const controller = {
    async list(request: FastifyRequest, reply: FastifyReply) {
        const query = request.query as Record<string, string>;
        const result = await getService(request).findAll({
            page: Number(query.page),
            limit: Number(query.limit),
            search: query.search,
            institutionId: query.institutionId || request.institutionId || undefined,
            branchId: query.branchId,
        });
        return reply.send({ success: true, ...result });
    },

    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as {
            institutionId: string;
            branchId?: string;
            name: string;
            displayOrder?: number;
            streamsEnabled?: boolean;
        };
        const data = await getService(request).create(body);
        return reply.status(201).send({ success: true, data });
    },

    async getOne(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const data = await getService(request).findById(id);
        if (!data) throw new NotFoundError('Class not found');
        return reply.send({ success: true, data });
    },

    async update(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const body = request.body as Record<string, any>;
        const data = await getService(request).update(id, body);
        return reply.send({ success: true, data });
    },

    async setCurriculum(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const data = await setClassCurriculum(request.institutionId ?? undefined, id, request.body);
        return reply.send({ success: true, data });
    },

    async delete(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        await getService(request).delete(id);
        return reply.send({ success: true, message: 'Class deleted' });
    },
};
