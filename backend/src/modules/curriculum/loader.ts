/**
 * Brings taxonomy.node (and its combinations) up to the vendored edu-taxonomy release. A port of Book Buddy's
 * CurriculumLoaderService, so both apps load the same files into the same shape with the same ids.
 *
 * Runs once at start-up, in the background, so the API serves while it works:
 *   1. the files are compared with their RELEASE.json; a copy that differs is refused whole;
 *   2. if that release is the one loaded last (taxonomy.release), it stops (every ordinary restart);
 *   3. otherwise the whole file is checked (ids, parents first, codes) and refused if anything is off;
 *   4. in one transaction, under an advisory lock so two instances starting together do not both load: every node is
 *      upserted, nodes missing from the file are made inactive (never deleted), and the combinations are replaced.
 * A failure is logged and never stops the API from starting.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Prisma, PrismaClient } from '../../../node_modules/.prisma/taxonomy-client/index.js';
import {
    CombinationRow,
    DATA_FILES,
    DEACTIVATE_MISSING_SQL,
    ReleaseManifest,
    UPSERT_NODES_SQL,
    inBatches,
    nodeBatchParams,
    parseCombinations,
    parseNodes,
    problemsIn,
    releaseProblems,
} from './taxonomy-data.js';

const BATCH = 500;
/** Taken inside the load's transaction. Its own key: Book Buddy's loader uses 7_340_021 in a different database. */
const LOAD_LOCK_KEY = 7_340_022;

export type LoadResult = { status: 'loaded' | 'current'; version: string; nodes: number };

/** prisma/taxonomy/edu-taxonomy, wherever the backend runs from (src/ under tsx, dist/ when compiled). */
export function releaseDir(): string {
    if (process.env.TAXONOMY_DATA_DIR) return resolve(process.env.TAXONOMY_DATA_DIR);
    const here = dirname(fileURLToPath(import.meta.url));
    return resolve(here, '..', '..', '..', 'prisma', 'taxonomy', 'edu-taxonomy');
}

export async function readRelease(dir: string) {
    const [csv, combinations, manifest] = await Promise.all([
        readFile(join(dir, DATA_FILES[0])),
        readFile(join(dir, DATA_FILES[1])),
        readFile(join(dir, 'RELEASE.json'), 'utf8'),
    ]);
    const release = JSON.parse(manifest) as ReleaseManifest;
    const problems = releaseProblems(release, { csv, combinations });
    if (problems.length) {
        throw new Error(`edu-taxonomy release in ${dir} refused: ${problems.join('; ')}`);
    }
    return { release, csv, combinations };
}

export async function ensureCurriculumLoaded(db: PrismaClient, dir: string = releaseDir()): Promise<LoadResult> {
    const { release, csv, combinations } = await readRelease(dir);
    const hash = release.release_hash;

    // Cheap early exit that avoids parsing 2.7 MB on every start. Compared with the release loaded LAST, not with
    // any release ever loaded: going back to an earlier release must load it again, or the nodes the release in
    // between made inactive would stay inactive.
    const done = await latestRelease(db);
    if (done?.hash === hash) return { status: 'current', version: done.version, nodes: done.nodeCount };

    const rows = parseNodes(csv.toString('utf8'));
    const combos = parseCombinations(combinations.toString('utf8'));
    const problems = problemsIn(rows, combos);
    if (rows.length !== release.node_count) problems.push(`${rows.length} nodes, RELEASE.json says ${release.node_count}`);
    if (problems.length) {
        throw new Error(`taxonomy file refused (${problems.length} problems), first: ${problems.slice(0, 3).join('; ')}`);
    }

    return db.$transaction(
        async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOAD_LOCK_KEY}::bigint)`;
            const again = await latestRelease(tx);
            if (again?.hash === hash) return { status: 'current' as const, version: again.version, nodes: again.nodeCount };

            // Sort positions are rewritten for many siblings at once; the constraint is checked at commit.
            await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');
            for (const batch of inBatches(rows, BATCH)) {
                await tx.$executeRawUnsafe(UPSERT_NODES_SQL, ...nodeBatchParams(batch));
            }
            await tx.$executeRawUnsafe(DEACTIVATE_MISSING_SQL, rows.map((r) => r.id));
            await replaceCombinations(tx, combos, new Map(rows.map((r) => [r.code, r.id])));
            const loaded = { version: release.version, nodeCount: rows.length, loadedAt: new Date() };
            await tx.curriculumRelease.upsert({ where: { hash }, create: { hash, ...loaded }, update: loaded });
            return { status: 'loaded' as const, version: release.version, nodes: rows.length };
        },
        { timeout: 120_000, maxWait: 30_000 },
    );
}

function latestRelease(db: Pick<PrismaClient, 'curriculumRelease'> | Prisma.TransactionClient) {
    return db.curriculumRelease.findFirst({ orderBy: { loadedAt: 'desc' } });
}

async function replaceCombinations(
    tx: Prisma.TransactionClient,
    combos: CombinationRow[],
    idByCode: Map<string, string>,
): Promise<void> {
    await tx.curriculumCombinationClass.deleteMany();
    await tx.curriculumCombination.deleteMany();
    if (!combos.length) return;
    await tx.curriculumCombination.createMany({
        data: combos.map((c) => ({
            code: c.code,
            name: c.name,
            rule: c.rule,
            compulsory: c.compulsory,
            choose: c.choose as Prisma.InputJsonValue,
            languageRule: c.languageRule,
        })),
    });
    const links = combos.flatMap((c) =>
        c.classCodes.flatMap((k) => {
            const classNodeId = idByCode.get(k);
            return classNodeId ? [{ combinationCode: c.code, classNodeId }] : [];
        }),
    );
    if (links.length) await tx.curriculumCombinationClass.createMany({ data: links });
}
