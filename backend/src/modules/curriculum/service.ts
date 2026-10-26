/**
 * Reads of the education taxonomy for pickers: browse by level, one node with its breadcrumb, the streams of a
 * class, and search. A port of the browsing half of Book Buddy's CurriculumService: the queries and the NodeDto
 * shape are the same, so a client written against either API works against both.
 *
 * Not ported: Book Buddy's `tenantId` narrowing (it reads Book Buddy's own institution curricula), and its
 * institution curriculum endpoints. Institution scope for the trio lives in Vidyaverse's academic module.
 */
import type { PrismaClient } from '../../../node_modules/.prisma/taxonomy-client/index.js';

export interface NodeDto {
    id: string;
    code: string;
    name: string;
    nameHi: string | null;
    nodeType: string;
    depth: number;
    hasChildren: boolean;
    /** sourced = from the regulator's scheme; verify = structure right, details to check; template = a default pattern. */
    verification: string;
    completeness: string;
    canonicalSubject: string | null;
    path: string;
    gradeFrom: number | null;
    gradeTo: number | null;
    localName: string | null;
}

export class CurriculumNodeNotFoundError extends Error {
    constructor() {
        super('Taxonomy node not found');
        this.name = 'CurriculumNodeNotFoundError';
    }
}

/** What a search may return by default: anything below the seven top-level domains. */
const TAGGABLE_EXCLUDED_TYPES = ['DOMAIN'];
const MAX_SEARCH = 30;

type Row = {
    id: string;
    code: string;
    name: string;
    nameHi: string | null;
    nodeType: string;
    depth: number;
    verification: string;
    completeness: string;
    canonicalSubject: string | null;
    path: string;
    attrs: unknown;
};

const SELECT = {
    id: true, code: true, name: true, nameHi: true, nodeType: true, depth: true, verification: true,
    completeness: true, canonicalSubject: true, path: true, attrs: true,
} as const;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const toNodeDto = (r: Row, hasChildren: boolean): NodeDto => {
    const attrs = (r.attrs && typeof r.attrs === 'object' ? r.attrs : {}) as Record<string, unknown>;
    return {
        id: r.id, code: r.code, name: r.name, nameHi: r.nameHi, nodeType: r.nodeType, depth: r.depth, hasChildren,
        verification: r.verification, completeness: r.completeness, canonicalSubject: r.canonicalSubject, path: r.path,
        gradeFrom: num(attrs.grade_from), gradeTo: num(attrs.grade_to),
        localName: typeof attrs.local_name === 'string' ? attrs.local_name : null,
    };
};

export class CurriculumService {
    constructor(private readonly db: PrismaClient) {}

    async domains(): Promise<NodeDto[]> {
        return this.childrenOf(null);
    }

    /** The active children of a node, in order; the seven domains when `parentId` is null. */
    async childrenOf(parentId: string | null): Promise<NodeDto[]> {
        if (parentId) {
            const parent = await this.db.curriculumNode.findUnique({ where: { id: parentId }, select: { id: true } });
            if (!parent) throw new CurriculumNodeNotFoundError();
        }
        const rows = await this.db.curriculumNode.findMany({
            where: { parentId, status: 'active' },
            orderBy: { sortOrder: 'asc' },
            select: SELECT,
        });
        return this.withChildFlags(rows);
    }

    /** One node with the chain from its domain down to it, for a breadcrumb. */
    async node(id: string): Promise<{ node: NodeDto; ancestors: NodeDto[] }> {
        const row = await this.db.curriculumNode.findUnique({ where: { id }, select: SELECT });
        if (!row) throw new CurriculumNodeNotFoundError();
        const parts = row.code.split('.');
        const prefixes = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('.'));
        const ancestors = prefixes.length
            ? await this.db.curriculumNode.findMany({ where: { code: { in: prefixes } }, orderBy: { depth: 'asc' }, select: SELECT })
            : [];
        const [node] = await this.withChildFlags([row]);
        return { node, ancestors: ancestors.map((a) => toNodeDto(a, true)) };
    }

    /** The streams ("Science (PCM)", "Commerce"...) defined for a class, for the stream dropdown. */
    async combinationsFor(classNodeId: string): Promise<Array<{ code: string; name: string }>> {
        const rows = await this.db.curriculumCombinationClass.findMany({
            where: { classNodeId },
            select: { combination: { select: { code: true, name: true } } },
        });
        return rows.map((r) => r.combination).sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * The given ids plus every node below them (code prefix: SCH.CBSE.C9 covers SCH.CBSE.C9.SCIENCE), inactive ones
     * included since a book may still be tagged there. An id that is not in the tree stays in the list unchanged,
     * so a scope that still holds old-tree ids keeps matching what was tagged with them.
     */
    async withDescendants(ids: string[]): Promise<string[]> {
        const unique = [...new Set(ids)];
        if (!unique.length) return [];
        const roots = await this.db.curriculumNode.findMany({ where: { id: { in: unique } }, select: { code: true } });
        if (!roots.length) return unique;
        const below = await this.db.curriculumNode.findMany({
            where: { OR: roots.map((r) => ({ code: { startsWith: `${r.code}.` } })) },
            select: { id: true },
        });
        return [...new Set([...unique, ...below.map((r) => r.id)])];
    }

    /** Name search in English or Hindi, optionally inside one domain or among some node types. */
    async search(query: string, opts: { domain?: string; types?: string[]; limit?: number } = {}): Promise<NodeDto[]> {
        const q = (query ?? '').trim();
        if (q.length < 2) return [];
        const limit = Math.min(Math.max(opts.limit ?? 20, 1), MAX_SEARCH);
        const rows = await this.db.curriculumNode.findMany({
            where: {
                status: 'active',
                nodeType: opts.types?.length ? { in: opts.types } : { notIn: TAGGABLE_EXCLUDED_TYPES },
                ...(opts.domain ? { code: { startsWith: `${opts.domain.toUpperCase()}.` } } : {}),
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { nameHi: { contains: q } },
                    { path: { contains: q, mode: 'insensitive' } },
                ],
            },
            orderBy: [{ depth: 'asc' }, { name: 'asc' }],
            take: limit,
            select: SELECT,
        });
        return this.withChildFlags(rows);
    }

    private async withChildFlags(rows: Row[]): Promise<NodeDto[]> {
        if (!rows.length) return [];
        const parents = await this.db.curriculumNode.groupBy({
            by: ['parentId'],
            where: { parentId: { in: rows.map((r) => r.id) }, status: 'active' },
        });
        const has = new Set(parents.map((p) => p.parentId));
        return rows.map((r) => toNodeDto(r, has.has(r.id)));
    }
}
