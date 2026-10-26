/**
 * The learner profile service over an in-memory stand-in for the few Prisma calls it makes, and a curriculum with
 * real curriculum v2 ids and codes: goals are checked against the taxonomy, an institutional student's class comes
 * first, "just exploring" is remembered, and only an institution's own admin can set a class's node.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type GoalRow = { userId: string; nodeId: string; isPrimary: boolean; combinationCode: string | null; createdAt: Date };
const db = vi.hoisted(() => ({
    users: new Map<string, { id: string; preferredMedium: string | null; learningPathSkippedAt: Date | null }>(),
    goals: [] as GoalRow[],
    students: new Map<string, { classId: string; streamId: string | null }>(),
    classes: new Map<string, { id: string; institutionId: string; name: string; curriculumNodeId: string | null }>(),
    streams: new Map<string, { id: string; classId: string; name: string; combinationCode: string | null }>(),
}));

vi.mock('../../../config/database.js', () => {
    const learnerGoal = {
        findMany: async ({ where }: any) =>
            db.goals.filter((g) => g.userId === where.userId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || +a.createdAt - +b.createdAt),
        deleteMany: async ({ where }: any) => {
            db.goals = db.goals.filter((g) => g.userId !== where.userId);
        },
        createMany: async ({ data }: any) => {
            if (data.filter((d: GoalRow) => d.isPrimary).length > 1) throw new Error('learner_goals_one_primary_per_user');
            let t = Date.now();
            for (const d of data) db.goals.push({ ...d, createdAt: new Date(t++) });
        },
    };
    const user = {
        findUnique: async ({ where }: any) => db.users.get(where.id) ?? null,
        update: async ({ where, data }: any) => Object.assign(db.users.get(where.id)!, data),
    };
    const student = {
        findUnique: async ({ where }: any) => {
            const s = db.students.get(where.userId);
            if (!s) return null;
            return { section: { class: { curriculumNodeId: db.classes.get(s.classId)!.curriculumNodeId }, stream: s.streamId ? db.streams.get(s.streamId) : null } };
        },
    };
    const cls = {
        findUnique: async ({ where }: any) => {
            const c = db.classes.get(where.id);
            if (!c) return null;
            return { ...c, streams: [...db.streams.values()].filter((s) => s.classId === c.id) };
        },
        update: async ({ where, data }: any) => Object.assign(db.classes.get(where.id)!, data),
    };
    const stream = {
        update: async ({ where, data }: any) => Object.assign(db.streams.get(where.id)!, data),
        updateMany: async ({ where, data }: any) => {
            for (const s of db.streams.values()) if (s.classId === where.classId) Object.assign(s, data);
        },
    };
    const client: any = { learnerGoal, user, student, class: cls, stream };
    client.$transaction = async (arg: any) => (typeof arg === 'function' ? arg(client) : Promise.all(arg));
    return { prisma: client };
});

import { CurriculumNodeNotFoundError } from '../../curriculum/service';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { getLearningPath, setClassCurriculum, setLearningPath, type CurriculumPort } from '../learning-path-service';

const node = (id: string, code: string, nodeType: string, path: string, grade: number | null = null) => ({
    id, code, name: path.split(' > ').pop()!, nameHi: null, nodeType, depth: code.split('.').length, hasChildren: true,
    verification: 'verify', completeness: 'complete', canonicalSubject: null, path, gradeFrom: grade, gradeTo: grade, localName: null,
});
const C9 = node('ef2a0bf3-afb4-5128-a5d6-1fa3d2eeeae2', 'SCH.CBSE.C9', 'CLASS', 'School Education > CBSE > Class 9', 9);
const C11 = node('a6e0bfe8-0a83-5d6c-9a76-6d9f1a3e2c11', 'SCH.CBSE.C11', 'CLASS', 'School Education > CBSE > Class 11', 11);
const JEE = node('b1b2b3b4-0000-5000-8000-00000000jee0'.replace('jee0', '0001'), 'ENT.JEE_MAIN', 'EXAM', 'Entrance Exams > JEE Main');
const SCI = node('f38447cb-5bb0-5188-af1f-42c878282399', 'SCH.CBSE.C9.SCIENCE', 'SUBJECT', 'School Education > CBSE > Class 9 > Science');
const NODES = [C9, C11, JEE, SCI];

const curriculum: CurriculumPort = {
    async node(id) {
        const n = NODES.find((x) => x.id === id);
        if (!n) throw new CurriculumNodeNotFoundError();
        return { node: n };
    },
    async combinationsFor(id) {
        return id === C11.id ? [{ code: 'CBSE_SCI_PCM', name: 'Science (PCM)' }, { code: 'CBSE_COM', name: 'Commerce' }] : [];
    },
};

const U = 'user-1';
beforeEach(() => {
    db.users = new Map([[U, { id: U, preferredMedium: null, learningPathSkippedAt: null }]]);
    db.goals = [];
    db.students = new Map();
    db.classes = new Map([['class-11a', { id: 'class-11a', institutionId: 'inst-1', name: 'XI', curriculumNodeId: null }]]);
    db.streams = new Map([['stream-sci', { id: 'stream-sci', classId: 'class-11a', name: 'Science', combinationCode: null }]]);
});

describe('learning path', () => {
    it('a new learner is asked; "just exploring" is remembered and ends the question', async () => {
        expect(await getLearningPath(U, curriculum)).toMatchObject({ prompt: true, skipped: false, goals: [], medium: null });
        const out = await setLearningPath(U, { skip: true, medium: 'hi' }, curriculum);
        expect(out).toMatchObject({ prompt: false, skipped: true, medium: 'hi', legacy: { board: null, gradeLevel: null, medium: 'hi' } });
    });

    it('stores goals with the main one first, a stream for a class 11, and derives the legacy fields', async () => {
        const out = await setLearningPath(U, { goals: [{ nodeId: JEE.id }, { nodeId: C11.id, isPrimary: true, combinationCode: 'CBSE_SCI_PCM' }], medium: 'en' }, curriculum);
        expect(out.goals.map((g) => [g.code, g.isPrimary, g.source])).toEqual([['SCH.CBSE.C11', true, 'self'], ['ENT.JEE_MAIN', false, 'self']]);
        expect(out.goals[0].combination).toEqual({ code: 'CBSE_SCI_PCM', name: 'Science (PCM)' });
        expect(out.legacy).toEqual({ board: 'CBSE', gradeLevel: 11, stream: 'CBSE_SCI_PCM', medium: 'en' });
        expect(out).toMatchObject({ prompt: false, skipped: false });
        // A later change of goals alone keeps the medium.
        expect((await setLearningPath(U, { goals: [{ nodeId: C9.id }] }, curriculum)).medium).toBe('en');
    });

    it('refuses a subject, an unknown node, and a stream the class does not offer', async () => {
        await expect(setLearningPath(U, { goals: [{ nodeId: SCI.id }] }, curriculum)).rejects.toThrow(/subject: choose a class/);
        await expect(setLearningPath(U, { goals: [{ nodeId: '00000000-0000-4000-8000-000000000000' }] }, curriculum)).rejects.toBeInstanceOf(BadRequestError);
        await expect(setLearningPath(U, { goals: [{ nodeId: C9.id, combinationCode: 'CBSE_SCI_PCM' }] }, curriculum)).rejects.toThrow(/stream is not offered/);
        await expect(setLearningPath(U, { goals: 'all' }, curriculum)).rejects.toBeInstanceOf(BadRequestError);
        expect(db.goals).toEqual([]);
    });

    it("an institutional student's class comes first and their own goals are extras", async () => {
        await setLearningPath(U, { goals: [{ nodeId: JEE.id, isPrimary: true }] }, curriculum);
        db.students.set(U, { classId: 'class-11a', streamId: 'stream-sci' });
        // No node on the class yet: the learner's own goals stand.
        expect((await getLearningPath(U, curriculum)).goals.map((g) => g.code)).toEqual(['ENT.JEE_MAIN']);

        await setClassCurriculum('inst-1', 'class-11a', { nodeId: C11.id, streams: [{ streamId: 'stream-sci', combinationCode: 'CBSE_SCI_PCM' }] }, curriculum);
        const out = await getLearningPath(U, curriculum);
        expect(out.goals.map((g) => [g.code, g.isPrimary, g.source])).toEqual([['SCH.CBSE.C11', true, 'institution'], ['ENT.JEE_MAIN', false, 'self']]);
        expect(out.legacy).toMatchObject({ board: 'CBSE', gradeLevel: 11, stream: 'CBSE_SCI_PCM' });

        // Sending the class back with the goals does not store it as the learner's own.
        await setLearningPath(U, { goals: out.goals.map((g) => ({ nodeId: g.nodeId })) }, curriculum);
        expect(db.goals.map((g) => g.nodeId)).toEqual([JEE.id]);
    });

    it('a class node is set only by its own institution, with streams that fit it; clearing it clears the streams', async () => {
        await expect(setClassCurriculum('inst-2', 'class-11a', { nodeId: C11.id }, curriculum)).rejects.toBeInstanceOf(NotFoundError);
        await expect(setClassCurriculum('inst-1', 'class-11a', { nodeId: SCI.id }, curriculum)).rejects.toThrow(/subject/);
        await expect(setClassCurriculum('inst-1', 'class-11a', { nodeId: C11.id, streams: [{ streamId: 'stream-sci', combinationCode: 'CBSE_SCI_PCB' }] }, curriculum))
            .rejects.toThrow(/not offered/);
        await expect(setClassCurriculum('inst-1', 'class-11a', { nodeId: C11.id, streams: [{ streamId: 'elsewhere' }] }, curriculum)).rejects.toThrow(/Unknown stream/);
        await setClassCurriculum('inst-1', 'class-11a', { nodeId: C11.id, streams: [{ streamId: 'stream-sci', combinationCode: 'CBSE_COM' }] }, curriculum);
        expect(db.streams.get('stream-sci')!.combinationCode).toBe('CBSE_COM');
        await setClassCurriculum('inst-1', 'class-11a', { nodeId: null }, curriculum);
        expect([db.classes.get('class-11a')!.curriculumNodeId, db.streams.get('stream-sci')!.combinationCode]).toEqual([null, null]);
    });

    it('a goal whose node left the taxonomy is dropped from the answer, not an error', async () => {
        db.goals.push({ userId: U, nodeId: '11111111-1111-4111-8111-111111111111', isPrimary: true, combinationCode: null, createdAt: new Date() });
        db.goals.push({ userId: U, nodeId: C9.id, isPrimary: false, combinationCode: null, createdAt: new Date() });
        const out = await getLearningPath(U, curriculum);
        expect(out.goals.map((g) => [g.code, g.isPrimary])).toEqual([['SCH.CBSE.C9', true]]);
    });
});
