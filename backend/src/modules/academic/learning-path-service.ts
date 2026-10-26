/**
 * The learner profile for the trio (library hub plan, Part D): a learner's goals and medium, stored here and read
 * and written by DigiClassroom and PDLMS for federated learners (/api/v1/academic/my-learning-path). An
 * institutional student's class node, set by the institution on the class, comes first as their main goal.
 *
 * Nodes are read from curriculum v2 (the taxonomy database). Without it (TAXONOMY_V2_ENABLED off, or no
 * TAXONOMY_DATABASE_URL) the profile cannot be read or written and callers get a 503: there is no meaningful
 * learning path without the taxonomy, and the apps keep their own copy meanwhile.
 */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import { CurriculumNodeNotFoundError, CurriculumService, type NodeDto } from '../curriculum/service.js';
import { isTaxonomyConfigured, taxonomyDb } from '../taxonomy/client.js';
import {
    GOAL_NODE_TYPES,
    type Goal,
    type LearningPath,
    LearningPathInputError,
    deriveLegacy,
    gradeOf,
    normalizeInput,
} from './learning-path.js';

export class LearningPathUnavailableError extends Error {
    readonly statusCode = 503;
    constructor(message = 'Learning paths need curriculum v2, which is not available here.') {
        super(message);
        this.name = 'LearningPathUnavailableError';
    }
}

/** What the service needs from the taxonomy: one node, and the streams of a class. */
export interface CurriculumPort {
    node(id: string): Promise<{ node: NodeDto }>;
    combinationsFor(classNodeId: string): Promise<Array<{ code: string; name: string }>>;
}

export function learningPathAvailable(): boolean {
    return env.TAXONOMY_V2_ENABLED && isTaxonomyConfigured();
}

function defaultCurriculum(): CurriculumPort {
    if (!learningPathAvailable()) throw new LearningPathUnavailableError();
    return new CurriculumService(taxonomyDb());
}

/** One node, or null when it is not (or no longer) in the taxonomy. */
async function nodeOrNull(curriculum: CurriculumPort, id: string): Promise<NodeDto | null> {
    try {
        return (await curriculum.node(id)).node;
    } catch (err) {
        if (err instanceof CurriculumNodeNotFoundError) return null;
        throw err;
    }
}

async function goalOf(
    curriculum: CurriculumPort,
    nodeId: string,
    isPrimary: boolean,
    combinationCode: string | null,
    source: Goal['source'],
): Promise<Goal | null> {
    const n = await nodeOrNull(curriculum, nodeId);
    if (!n) return null;
    let combination: Goal['combination'] = null;
    if (combinationCode) {
        const found = (await curriculum.combinationsFor(nodeId)).find((c) => c.code === combinationCode);
        combination = { code: combinationCode, name: found?.name ?? combinationCode };
    }
    return {
        nodeId, isPrimary, code: n.code, name: n.name, nodeType: n.nodeType, path: n.path, verification: n.verification,
        gradeLevel: gradeOf(n), combination, source,
    };
}

/** The class node (and stream) a student's institution set on their class, if any. */
async function institutionGoalInput(userId: string): Promise<{ nodeId: string; combinationCode: string | null } | null> {
    const student = await prisma.student.findUnique({
        where: { userId },
        select: { section: { select: { class: { select: { curriculumNodeId: true } }, stream: { select: { combinationCode: true } } } } },
    });
    const nodeId = student?.section?.class?.curriculumNodeId;
    return nodeId ? { nodeId, combinationCode: student?.section?.stream?.combinationCode ?? null } : null;
}

export async function getLearningPath(userId: string, curriculum: CurriculumPort = defaultCurriculum()): Promise<LearningPath> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferredMedium: true, learningPathSkippedAt: true } });
    if (!user) throw new NotFoundError('User not found');

    const [rows, inst] = await Promise.all([
        prisma.learnerGoal.findMany({ where: { userId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }),
        institutionGoalInput(userId),
    ]);

    const goals: Goal[] = [];
    if (inst) {
        const g = await goalOf(curriculum, inst.nodeId, true, inst.combinationCode, 'institution');
        if (g) goals.push(g);
    }
    // With a class from the institution, the learner's own goals are their extras.
    const instIsMain = goals.length > 0;
    for (const r of rows) {
        if (goals.some((g) => g.nodeId === r.nodeId)) continue;
        const g = await goalOf(curriculum, r.nodeId, instIsMain ? false : r.isPrimary, r.combinationCode, 'self');
        if (g) goals.push(g);
    }
    if (!instIsMain && goals.length && !goals.some((g) => g.isPrimary)) goals[0].isPrimary = true;

    const skipped = user.learningPathSkippedAt !== null;
    const medium = user.preferredMedium ?? null;
    return { prompt: goals.length === 0 && !skipped, skipped, medium, goals, legacy: deriveLegacy(goals, medium) };
}

/**
 * Replaces the learner's own goals and/or medium, or records "just exploring" (`skip` with no goals). Each node
 * must be a goal-type node of the taxonomy, and a stream must be one defined for its class.
 */
export async function setLearningPath(userId: string, body: unknown, curriculum: CurriculumPort = defaultCurriculum()): Promise<LearningPath> {
    let input: ReturnType<typeof normalizeInput>;
    try {
        input = normalizeInput(body);
    } catch (err) {
        if (err instanceof LearningPathInputError) throw new BadRequestError(err.message);
        throw err;
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundError('User not found');

    // The institution's class is shown, not stored as the learner's own; sending it back is harmless.
    const inst = await institutionGoalInput(userId);
    const goals = input.goals.filter((g) => g.nodeId !== inst?.nodeId);

    for (const g of goals) {
        const n = await nodeOrNull(curriculum, g.nodeId);
        if (!n) throw new BadRequestError(`No curriculum node ${g.nodeId}`);
        if (!(GOAL_NODE_TYPES as readonly string[]).includes(n.nodeType))
            throw new BadRequestError(`${n.name} is a ${n.nodeType.toLowerCase()}: choose a class, programme or exam`);
        if (g.combinationCode && !(await curriculum.combinationsFor(g.nodeId)).some((c) => c.code === g.combinationCode))
            throw new BadRequestError('That stream is not offered for the class you chose');
    }

    const primaryId = goals.some((g) => g.nodeId === input.primaryId) ? input.primaryId : goals[0]?.nodeId ?? null;
    await prisma.$transaction([
        prisma.learnerGoal.deleteMany({ where: { userId } }),
        ...(goals.length
            ? [prisma.learnerGoal.createMany({
                  data: goals.map((g) => ({ userId, nodeId: g.nodeId, isPrimary: g.nodeId === primaryId, combinationCode: g.combinationCode ?? null })),
              })]
            : []),
        prisma.user.update({
            where: { id: userId },
            data: {
                learningPathSkippedAt: goals.length || inst ? null : input.skip ? new Date() : null,
                ...(input.medium !== undefined ? { preferredMedium: input.medium } : {}),
            },
        }),
    ]);
    return getLearningPath(userId, curriculum);
}

/**
 * An institution admin sets the curriculum node a class teaches (null clears it) and, for a class with streams,
 * each stream's code. Every student of the class then has it as their main goal.
 */
export async function setClassCurriculum(
    institutionId: string | undefined,
    classId: string,
    body: unknown,
    curriculum: CurriculumPort = defaultCurriculum(),
) {
    const b = (body ?? {}) as { nodeId?: unknown; streams?: unknown };
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, institutionId: true, streams: { select: { id: true } } } });
    // Another institution's class is "not found", never "forbidden": its existence is not this admin's business.
    if (!cls || (institutionId && cls.institutionId !== institutionId)) throw new NotFoundError('Class not found');

    let nodeId: string | null = null;
    if (b.nodeId !== null && b.nodeId !== undefined) {
        if (typeof b.nodeId !== 'string') throw new BadRequestError('nodeId must be a curriculum node id or null');
        const n = await nodeOrNull(curriculum, b.nodeId);
        if (!n) throw new BadRequestError(`No curriculum node ${b.nodeId}`);
        if (!(GOAL_NODE_TYPES as readonly string[]).includes(n.nodeType))
            throw new BadRequestError(`${n.name} is a ${n.nodeType.toLowerCase()}: a class teaches a class, programme or exam course`);
        nodeId = b.nodeId;
    }

    const streams = Array.isArray(b.streams) ? (b.streams as Array<{ streamId?: unknown; combinationCode?: unknown }>) : [];
    const known = new Set(cls.streams.map((s) => s.id));
    const offered = nodeId ? new Set((await curriculum.combinationsFor(nodeId)).map((c) => c.code)) : new Set<string>();
    for (const s of streams) {
        if (typeof s.streamId !== 'string' || !known.has(s.streamId)) throw new BadRequestError('Unknown stream for this class');
        if (s.combinationCode !== null && s.combinationCode !== undefined && (typeof s.combinationCode !== 'string' || !offered.has(s.combinationCode)))
            throw new BadRequestError('That stream code is not offered for the curriculum node chosen');
    }

    await prisma.$transaction(async (tx) => {
        await tx.class.update({ where: { id: classId }, data: { curriculumNodeId: nodeId } });
        // Clearing the node clears every stream's code too: a code only means something for its class node.
        if (!nodeId) await tx.stream.updateMany({ where: { classId }, data: { combinationCode: null } });
        else
            for (const s of streams)
                await tx.stream.update({ where: { id: s.streamId as string }, data: { combinationCode: (s.combinationCode as string | null | undefined) ?? null } });
    });
    return prisma.class.findUnique({
        where: { id: classId },
        select: { id: true, name: true, curriculumNodeId: true, streams: { select: { id: true, name: true, combinationCode: true } } },
    });
}
