/**
 * The learning path: what a learner is studying, in curriculum v2 (Book Buddy's taxonomy, ids uuid5(code), equal
 * in every app). The same shape in all four apps (library hub plan, Phase 6):
 *
 *   GET  -> { prompt, skipped, medium, goals: [{ nodeId, isPrimary, code, name, nodeType, path, verification,
 *              gradeLevel, combination, source }], legacy: { board, gradeLevel, stream, medium } }
 *   PUT  <- { goals: [{ nodeId, isPrimary?, combinationCode? }], medium?, skip? }
 *
 * One main goal and up to three more. A goal is a place one studies for: a board's class, a programme, an exam
 * course; never a subject or a whole domain. An institutional student's class node comes first, as an
 * `institution` goal they cannot remove. The legacy fields older code reads (board, class, stream, medium) are
 * derived from the main goal here, never asked for separately.
 *
 * Pure: no database, so DigiClassroom, PDLMS and Book Buddy carry a copy of these rules and their tests.
 */

/** Node types a learner may choose as a goal (Book Buddy's CLASS_NODE_TYPES). */
export const GOAL_NODE_TYPES = ['CLASS', 'PROGRAM', 'SPECIALISATION', 'PERIOD', 'LEVEL', 'EXAM'] as const;
/** One main goal and up to three more (a Class 12 PCM student who is also preparing for JEE). */
export const MAX_GOALS = 4;
/** Study mediums offered at onboarding (ISO 639-1). The books' `medium` uses the same codes. */
export const MEDIUMS = ['en', 'hi'] as const;

export interface GoalNode {
    id: string;
    code: string;
    name: string;
    nodeType: string;
    path: string;
    verification: string;
    gradeFrom: number | null;
    gradeTo: number | null;
}

export interface Goal {
    nodeId: string;
    isPrimary: boolean;
    code: string;
    name: string;
    nodeType: string;
    path: string;
    verification: string;
    gradeLevel: number | null;
    combination: { code: string; name: string } | null;
    /** `institution`: inherited from the learner's class; shown, never editable by the learner. */
    source: 'self' | 'institution';
}

export interface Legacy {
    /** The school board segment of the main goal's code (`CBSE`, `CISCE`, `UP_BOARD`), null outside school. */
    board: string | null;
    /** 1-12 when the main goal is one school class. */
    gradeLevel: number | null;
    /** The stream code of the main goal (`CBSE_SCI_PCM`). */
    stream: string | null;
    medium: string | null;
}

export interface LearningPath {
    /** True when the learner has said nothing yet and did not choose "just exploring": show the question. */
    prompt: boolean;
    skipped: boolean;
    medium: string | null;
    goals: Goal[];
    legacy: Legacy;
}

export interface GoalInput {
    nodeId: string;
    isPrimary?: boolean;
    combinationCode?: string | null;
}

export class LearningPathInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LearningPathInputError';
    }
}

/** A school grade 1-12 when the node is exactly one grade (a class), else null. */
export function gradeOf(node: Pick<GoalNode, 'gradeFrom' | 'gradeTo'>): number | null {
    const { gradeFrom: from, gradeTo: to } = node;
    return from !== null && from === to && from >= 1 && from <= 12 ? from : null;
}

/** The legacy fields from the main goal: board from `SCH.<BOARD>.…`, grade from the class, stream and medium. */
export function deriveLegacy(goals: Goal[], medium: string | null): Legacy {
    const main = goals.find((g) => g.isPrimary) ?? goals[0];
    if (!main) return { board: null, gradeLevel: null, stream: null, medium };
    const seg = main.code.split('.');
    return {
        board: seg[0] === 'SCH' && seg.length >= 2 && seg[1] !== 'PREPRIMARY' ? seg[1] : null,
        gradeLevel: main.gradeLevel ?? goals.map((g) => g.gradeLevel).find((g): g is number => g !== null) ?? null,
        stream: main.combination?.code ?? null,
        medium,
    };
}

/**
 * Checks a PUT body and returns the goals in order, the main one first. Throws LearningPathInputError for a
 * request that cannot be right whatever the taxonomy says (the node checks need the database).
 */
export function normalizeInput(body: unknown): { goals: GoalInput[]; primaryId: string | null; medium: string | null | undefined; skip: boolean } {
    const b = (body ?? {}) as { goals?: unknown; medium?: unknown; skip?: unknown };
    const goals = b.goals ?? [];
    if (!Array.isArray(goals)) throw new LearningPathInputError('goals must be a list');
    if (goals.length > MAX_GOALS) throw new LearningPathInputError(`Choose at most ${MAX_GOALS} (one main goal and ${MAX_GOALS - 1} more)`);
    const out: GoalInput[] = [];
    for (const g of goals as unknown[]) {
        const x = (g ?? {}) as { nodeId?: unknown; isPrimary?: unknown; combinationCode?: unknown };
        if (typeof x.nodeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.nodeId)) throw new LearningPathInputError('Each goal needs a nodeId (a uuid)');
        if (x.combinationCode !== undefined && x.combinationCode !== null && (typeof x.combinationCode !== 'string' || x.combinationCode.length > 60))
            throw new LearningPathInputError('combinationCode must be a stream code');
        if (out.some((o) => o.nodeId === x.nodeId)) continue;
        out.push({ nodeId: x.nodeId, isPrimary: x.isPrimary === true, combinationCode: (x.combinationCode as string | null | undefined) || null });
    }
    const skip = b.skip === true;
    if (!out.length && !skip) throw new LearningPathInputError('Choose what you are studying, or say you are just exploring');
    let medium: string | null | undefined;
    if (b.medium === undefined) medium = undefined;
    else if (b.medium === null) medium = null;
    else if (typeof b.medium === 'string' && (MEDIUMS as readonly string[]).includes(b.medium)) medium = b.medium;
    else throw new LearningPathInputError(`medium must be one of ${MEDIUMS.join(', ')}`);
    const primaryId = (out.find((g) => g.isPrimary) ?? out[0])?.nodeId ?? null;
    return { goals: [...out].sort((a, z) => Number(z.nodeId === primaryId) - Number(a.nodeId === primaryId)), primaryId, medium, skip };
}
