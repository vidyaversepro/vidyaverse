import { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { isTaxonomyConfigured, taxonomyDb } from '../taxonomy/client.js';
import { ensureCurriculumLoaded } from './loader.js';
import curriculumRoutes from './routes.js';

/**
 * Curriculum v2 (Book Buddy's taxonomy) behind TAXONOMY_V2_ENABLED, off by default. Needs the taxonomy database too,
 * and the tables from prisma/taxonomy/migrations/001_curriculum_v2.sql. The old /api/v1/taxonomy/* is untouched.
 */
export async function curriculumModule(app: FastifyInstance) {
    if (!env.TAXONOMY_V2_ENABLED) {
        logger.info('[curriculum] curriculum API not registered — TAXONOMY_V2_ENABLED is off');
        return;
    }
    if (!isTaxonomyConfigured()) {
        logger.warn('[curriculum] TAXONOMY_V2_ENABLED is on but TAXONOMY_DATABASE_URL is unset — not registered');
        return;
    }
    app.register(curriculumRoutes, { prefix: '/api/v1/curriculum' });
    logger.info('[curriculum] curriculum API registered');

    if (process.env.TAXONOMY_AUTOLOAD === '0' || env.NODE_ENV === 'test') return;
    // In the background once the server is up: the first load after a deploy takes a few seconds, later starts
    // find the release already loaded and do nothing.
    app.addHook('onReady', async () => {
        const started = Date.now();
        void ensureCurriculumLoaded(taxonomyDb())
            .then((r) => {
                if (r.status === 'loaded') logger.info(`[curriculum] edu-taxonomy ${r.version} loaded: ${r.nodes} nodes in ${Date.now() - started} ms`);
                else logger.info(`[curriculum] edu-taxonomy ${r.version} already loaded (${r.nodes} nodes)`);
            })
            .catch((err: Error) => logger.error(`[curriculum] taxonomy load failed: ${err.message}`));
    });
}
