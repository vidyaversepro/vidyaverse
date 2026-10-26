import { FastifyInstance } from 'fastify';
import academicRoutes from './routes.js';
import curriculumScopeRoutes from './curriculum-scope.routes.js';
import learningPathRoutes from './learning-path.routes.js';
import { logger } from '../../utils/logger.js';

export async function academicModule(app: FastifyInstance) {
    // Cross-app Class/Section resolution — what relying parties consume to learn a
    // student's grade level. Reads the main ERP tables directly (no opt-in gate,
    // unlike entitlements' separate Postgres datasource — there is only one source
    // of truth here and it is always configured).
    app.register(academicRoutes, { prefix: '/api/v1/academic' });

    // Institute curriculum scope for the shared cross-repo taxonomy — what
    // PDLMS/DigiClassroom pull to pre-scope a student's retrieval.
    app.register(curriculumScopeRoutes, { prefix: '/api/v1/academic' });

    // The learner's learning path (curriculum v2 goals and medium), shared by DigiClassroom and PDLMS.
    app.register(learningPathRoutes, { prefix: '/api/v1/academic' });

    logger.info('[academic] profile API + curriculum scope registered');
}
