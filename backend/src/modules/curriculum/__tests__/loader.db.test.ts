/**
 * The curriculum loader and API against a real Postgres: the migration, a full load of the vendored release, and
 * the HTTP responses. Needs a throwaway database it may wipe the `taxonomy` schema of, e.g.
 *
 *   docker run -d --name vv-taxonomy-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=trio \
 *       -p 127.0.0.1:15435:5432 postgres:16-alpine
 *   CURRICULUM_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:15435/trio?schema=taxonomy \
 *       pnpm run test:unit -- src/modules/curriculum
 *
 * Skipped when CURRICULUM_TEST_DATABASE_URL is unset.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../../node_modules/.prisma/taxonomy-client/index.js';
import { env } from '../../../config/env';
import { ensureCurriculumLoaded, releaseDir } from '../loader';
import curriculumRoutes from '../routes';
import { CurriculumService } from '../service';
import { BOOK_BUDDY_IDS, BOOK_BUDDY_RESPONSES } from './book-buddy-fixtures';

const URL = process.env.CURRICULUM_TEST_DATABASE_URL;
const requireHere = createRequire(import.meta.url);
const BACKEND = resolve(__dirname, '..', '..', '..', '..');
const MIGRATION = join(BACKEND, 'prisma', 'taxonomy', 'migrations', '001_curriculum_v2.sql');
const KEY = 'curriculum-test-service-key';

function dbExecute(file: string) {
    const cli = requireHere.resolve('prisma/build/index.js');
    const r = spawnSync(process.execPath, [cli, 'db', 'execute', '--url', URL as string, '--file', file], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`prisma db execute ${file} failed: ${r.stderr || r.stdout}`);
}

/** A copy of the release with RELEASE.json re-cut, after `edit` changed the CSV text. */
function editedRelease(version: string, edit: (csv: string) => string): string {
    const dir = mkdtempSync(join(tmpdir(), 'edu-taxonomy-'));
    for (const f of ['combinations.json', 'RELEASE.json', 'verify-release.mjs']) copyFileSync(join(releaseDir(), f), join(dir, f));
    writeFileSync(join(dir, 'taxonomy_nodes.csv'), edit(readFileSync(join(releaseDir(), 'taxonomy_nodes.csv'), 'utf8')));
    const r = spawnSync(process.execPath, [join(dir, 'verify-release.mjs'), '--cut', version, dir], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    return dir;
}

describe.skipIf(!URL)('curriculum v2 against Postgres', () => {
    let db: PrismaClient;
    let app: FastifyInstance;
    const tmpDirs: string[] = [];

    beforeAll(async () => {
        const reset = join(mkdtempSync(join(tmpdir(), 'curriculum-reset-')), 'reset.sql');
        // taxonomy_app exists in production and the migration hands it the tables; without the role here the
        // ownership half of the migration would never run (a missing schema grant once hid behind that).
        writeFileSync(
            reset,
            'DROP SCHEMA IF EXISTS taxonomy CASCADE;\n' +
                "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taxonomy_app') THEN CREATE ROLE taxonomy_app NOLOGIN; END IF; END $$;\n",
        );
        dbExecute(reset);
        dbExecute(MIGRATION);

        const mod = requireHere('../../../../node_modules/.prisma/taxonomy-client/index.js') as {
            PrismaClient: new (opts: unknown) => PrismaClient;
        };
        db = new mod.PrismaClient({ datasources: { db: { url: URL } } });

        (env as { TAXONOMY_SERVICE_API_KEY?: string }).TAXONOMY_SERVICE_API_KEY = KEY;
        app = Fastify();
        await app.register(curriculumRoutes, { prefix: '/api/v1/curriculum', service: new CurriculumService(db) });
        await app.ready();
    }, 120_000);

    afterAll(async () => {
        await app?.close();
        await db?.$disconnect();
        for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    });

    it('loads the release once even when two instances start together', async () => {
        const results = await Promise.all([ensureCurriculumLoaded(db), ensureCurriculumLoaded(db)]);
        expect(results.map((r) => r.status).sort()).toEqual(['current', 'loaded']);
        expect(results.every((r) => r.nodes === 7884 && r.version === '2026.10.1')).toBe(true);
        expect(await db.curriculumNode.count()).toBe(7884);
        expect(await db.curriculumCombination.count()).toBe(122);
        expect(await db.curriculumCombinationClass.count()).toBeGreaterThan(0);
        const release = JSON.parse(readFileSync(join(releaseDir(), 'RELEASE.json'), 'utf8'));
        expect(await db.curriculumRelease.findMany({ select: { hash: true, version: true, nodeCount: true } })).toEqual([
            { hash: release.release_hash, version: '2026.10.1', nodeCount: 7884 },
        ]);
    }, 120_000);

    it('does nothing on a restart with the same release', async () => {
        await expect(ensureCurriculumLoaded(db)).resolves.toEqual({ status: 'current', version: '2026.10.1', nodes: 7884 });
    });

    it('gives the 20 sampled codes the same ids as Book Buddy', async () => {
        const rows = await db.curriculumNode.findMany({
            where: { code: { in: BOOK_BUDDY_IDS.map(([code]) => code) } },
            select: { code: true, id: true },
        });
        const got = new Map(rows.map((r) => [r.code, r.id]));
        expect(BOOK_BUDDY_IDS.map(([code]) => [code, got.get(code)])).toEqual(BOOK_BUDDY_IDS);
    });

    it('keeps the path the database derives equal to the file', async () => {
        const node = await db.curriculumNode.findUnique({ where: { code: 'SCH.CBSE.C11.BIOLOGY' } });
        expect(node?.path).toBe('School Education > CBSE > Class 11 > Biology');
    });

    it('refuses a damaged file whole and leaves the database as it was', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'edu-taxonomy-'));
        tmpDirs.push(dir);
        for (const f of ['taxonomy_nodes.csv', 'combinations.json', 'RELEASE.json']) copyFileSync(join(releaseDir(), f), join(dir, f));
        writeFileSync(join(dir, 'taxonomy_nodes.csv'), readFileSync(join(dir, 'taxonomy_nodes.csv'), 'utf8').replace('Biology', 'Biolgy'));
        await expect(ensureCurriculumLoaded(db, dir)).rejects.toThrow(/refused: taxonomy_nodes.csv differs from RELEASE.json/);
        expect(await db.curriculumRelease.count()).toBe(1);
    });

    it('refuses a re-cut release whose tree is broken, writing nothing', async () => {
        // The hashes match (RELEASE.json re-cut), but a node now names a parent that does not exist.
        const dir = editedRelease('2026.10.98', (csv) =>
            csv.replace(',0db7030e-7502-5b02-a5e9-679fa579b987,SCH,2,', ',00000000-0000-5000-8000-000000000000,SCH,2,'));
        tmpDirs.push(dir);
        await expect(ensureCurriculumLoaded(db, dir)).rejects.toThrow(/taxonomy file refused/);
        expect(await db.curriculumRelease.count()).toBe(1);
    });

    it('makes a node missing from a new release inactive, never deletes it', async () => {
        const branch = 'COMP.UPSC.EPFO';
        const below = await db.curriculumNode.count({ where: { code: { startsWith: `${branch}.` } } });
        // EPFO has papers under it; drop the whole branch so the file stays a valid tree.
        const dir = editedRelease('2026.10.99', (csv) =>
            csv.split('\n').filter((line) => !line.includes(`,${branch},`) && !line.includes(`,${branch}.`)).join('\n'));
        tmpDirs.push(dir);
        const r = await ensureCurriculumLoaded(db, dir);
        expect(r).toEqual({ status: 'loaded', version: '2026.10.99', nodes: 7884 - 1 - below });
        expect(await db.curriculumNode.count()).toBe(7884);
        expect(await db.curriculumNode.findUnique({ where: { code: branch }, select: { status: true } })).toEqual({ status: 'inactive' });

        // Back to the real release, loaded before: it is loaded again and the branch comes back.
        await expect(ensureCurriculumLoaded(db)).resolves.toMatchObject({ status: 'loaded', version: '2026.10.1' });
        expect(await db.curriculumNode.findUnique({ where: { code: branch }, select: { status: true } })).toEqual({ status: 'active' });
    }, 120_000);

    describe('withDescendants (institute scope)', () => {
        const idOf = async (code: string) => (await db.curriculumNode.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;

        it('adds every node below a class and nothing from its neighbours', async () => {
            const service = new CurriculumService(db);
            const class9 = await idOf('SCH.CBSE.C9');
            const got = await service.withDescendants([class9]);
            const below = await db.curriculumNode.findMany({ where: { code: { startsWith: 'SCH.CBSE.C9.' } }, select: { id: true } });
            expect(below.length).toBe(13);
            expect([...got].sort()).toEqual([class9, ...below.map((r) => r.id)].sort());
            expect(got).not.toContain(await idOf('SCH.CBSE.C10'));
            expect(got).not.toContain(await idOf('SCH.CBSE'));
        });

        it('takes a leaf as it is, keeps an id that is not in the tree, and answers [] for none', async () => {
            const service = new CurriculumService(db);
            const leaf = await idOf('SCH.CBSE.C9.ENGLISH');
            const oldTreeId = 'c17fffc8-df25-441d-9285-36e722f2d8ca';
            expect(await service.withDescendants([leaf, oldTreeId, leaf])).toEqual([leaf, oldTreeId]);
            expect(await service.withDescendants([oldTreeId])).toEqual([oldTreeId]);
            expect(await service.withDescendants([])).toEqual([]);
        });
    });

    describe('HTTP API', () => {
        const get = (url: string, key: string | null = KEY) =>
            app.inject({ method: 'GET', url: `/api/v1/curriculum${url}`, headers: key ? { 'x-taxonomy-api-key': key } : {} });

        it('refuses a wrong service key', async () => {
            const r = await get('/domains', 'wrong');
            expect(r.statusCode).toBe(401);
        });

        it.each(Object.entries(BOOK_BUDDY_RESPONSES))('GET %s answers exactly what Book Buddy answers', async (url, body) => {
            const r = await get(url);
            expect(r.statusCode).toBe(200);
            expect(r.json()).toEqual(body);
        });

        it('answers 404 and 400 in the NestJS shape', async () => {
            const missing = await get('/nodes/00000000-0000-5000-8000-000000000000');
            expect(missing.statusCode).toBe(404);
            expect(missing.json()).toEqual({ statusCode: 404, message: 'Taxonomy node not found', error: 'Not Found' });
            const bad = await get('/nodes/not-a-uuid');
            expect(bad.statusCode).toBe(400);
            expect(bad.json()).toEqual({ statusCode: 400, message: 'Validation failed (uuid is expected)', error: 'Bad Request' });
            expect((await get('/nodes?parentId=00000000-0000-5000-8000-000000000000')).statusCode).toBe(404);
        });

        it('treats a one-letter search as no search', async () => {
            expect((await get('/search?q=a')).json()).toEqual([]);
        });
    });
});
