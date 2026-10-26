/**
 * The learning-path rules every app shares: input checks, the main goal first, and the legacy fields (board,
 * grade, stream, medium) derived from the main goal.
 */
import { describe, expect, it } from 'vitest';
import { type Goal, LearningPathInputError, deriveLegacy, gradeOf, normalizeInput } from '../learning-path';

const A = '0db7030e-7502-5b02-a5e9-679fa579b987';
const B = 'ef2a0bf3-afb4-5128-a5d6-1fa3d2eeeae2';

const goal = (over: Partial<Goal>): Goal => ({
    nodeId: A, isPrimary: false, code: 'SCH.CBSE.C9', name: 'Class 9', nodeType: 'CLASS', path: 'School Education > CBSE > Class 9',
    verification: 'verify', gradeLevel: 9, combination: null, source: 'self', ...over,
});

describe('normalizeInput', () => {
    it('puts the main goal first, drops repeats, and keeps the medium', () => {
        const r = normalizeInput({ goals: [{ nodeId: A }, { nodeId: B, isPrimary: true }, { nodeId: A }], medium: 'hi' });
        expect(r.goals.map((g) => g.nodeId)).toEqual([B, A]);
        expect(r).toMatchObject({ primaryId: B, medium: 'hi', skip: false });
    });

    it('takes the first goal as main when none is marked', () => {
        expect(normalizeInput({ goals: [{ nodeId: A }, { nodeId: B }] }).primaryId).toBe(A);
    });

    it('leaves the medium alone when absent, clears it with null', () => {
        expect(normalizeInput({ skip: true }).medium).toBeUndefined();
        expect(normalizeInput({ skip: true, medium: null }).medium).toBeNull();
    });

    it.each([
        [{ goals: 'x' }, /list/],
        [{ goals: [{ nodeId: 'CBSE-9' }] }, /uuid/],
        [{ goals: [A, B, A, B, A].map((nodeId, i) => ({ nodeId: nodeId.replace(/.$/, String(i)) })) }, /at most 4/],
        [{}, /just exploring/],
        [{ skip: true, medium: 'fr' }, /medium/],
        [{ goals: [{ nodeId: A, combinationCode: 12 }] }, /stream/],
    ])('refuses %j', (body, msg) => {
        expect(() => normalizeInput(body)).toThrow(LearningPathInputError);
        expect(() => normalizeInput(body)).toThrow(msg);
    });
});

describe('deriveLegacy', () => {
    it('board, grade and stream from the main goal; medium as given', () => {
        const goals = [
            goal({ nodeId: B, code: 'ENT.JEE_MAIN', nodeType: 'EXAM', gradeLevel: null }),
            goal({ isPrimary: true, code: 'SCH.CBSE.C12', gradeLevel: 12, combination: { code: 'CBSE_SCI_PCM', name: 'Science (PCM)' } }),
        ];
        expect(deriveLegacy(goals, 'en')).toEqual({ board: 'CBSE', gradeLevel: 12, stream: 'CBSE_SCI_PCM', medium: 'en' });
    });

    it('no board outside school or for pre-primary; grade falls back to another class goal', () => {
        expect(deriveLegacy([goal({ isPrimary: true, code: 'ENT.NEET_UG', nodeType: 'EXAM', gradeLevel: null }), goal({ gradeLevel: 11 })], null))
            .toEqual({ board: null, gradeLevel: 11, stream: null, medium: null });
        expect(deriveLegacy([goal({ code: 'SCH.PREPRIMARY.NURSERY', gradeLevel: null })], null).board).toBeNull();
        expect(deriveLegacy([goal({ code: 'SCH.UP_BOARD.C10', gradeLevel: 10 })], 'hi')).toMatchObject({ board: 'UP_BOARD', gradeLevel: 10 });
    });

    it('nothing chosen: only the medium', () => {
        expect(deriveLegacy([], 'hi')).toEqual({ board: null, gradeLevel: null, stream: null, medium: 'hi' });
    });
});

describe('gradeOf', () => {
    it('one school grade only', () => {
        expect(gradeOf({ gradeFrom: 9, gradeTo: 9 })).toBe(9);
        expect(gradeOf({ gradeFrom: 11, gradeTo: 12 })).toBeNull();
        expect(gradeOf({ gradeFrom: null, gradeTo: null })).toBeNull();
        expect(gradeOf({ gradeFrom: 13, gradeTo: 13 })).toBeNull();
    });
});
