/**
 * Reading the vendored edu-taxonomy release (prisma/taxonomy/edu-taxonomy) and turning it into the statements that
 * load it. Ported from Book Buddy's backend/src/curriculum/taxonomy-data.ts, which is the reference: the parsing,
 * the checks and the id rule must stay identical, or the two apps would disagree on ids.
 *
 * Everything here is pure, so it is tested without a database; loader.ts runs the statements.
 */
import { createHash } from 'node:crypto';

/** `id = uuidv5(TAXONOMY_ID_NAMESPACE, code)`: why every app that loads the same release agrees on every id. */
export const TAXONOMY_ID_NAMESPACE = 'bfd0d89e-223c-53fa-8476-1b70678a5d20';

export const DATA_FILES = ['taxonomy_nodes.csv', 'combinations.json'] as const;

export interface TaxonomyRow {
    id: string;
    code: string;
    parentId: string | null;
    depth: number;
    sortOrder: number;
    nodeType: string;
    segment: string;
    name: string;
    nameHi: string | null;
    canonicalSubject: string | null;
    canonicalTopic: string | null;
    status: string;
    verification: string;
    completeness: string;
    path: string;
    attrs: Record<string, unknown>;
}

export interface CombinationRow {
    code: string;
    name: string;
    rule: string;
    compulsory: string[];
    choose: unknown[];
    languageRule: string | null;
    classCodes: string[];
}

/** RELEASE.json, as written by Book Buddy's scripts/check-taxonomy-release.mjs. */
export interface ReleaseManifest {
    name: string;
    version: string;
    id_namespace: string;
    node_count: number;
    combination_count: number;
    release_hash: string;
    files: Record<string, { sha256: string; bytes: number }>;
}

export const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

/**
 * Compares the files with their RELEASE.json before anything else reads them, so a copy that was edited by hand or
 * damaged in transit is refused whole. Returns every problem, or none.
 */
export function releaseProblems(release: ReleaseManifest, files: { csv: Buffer; combinations: Buffer }): string[] {
    const problems: string[] = [];
    if (release.name !== 'edu-taxonomy') problems.push(`RELEASE.json names "${release.name}", expected "edu-taxonomy"`);
    if (release.id_namespace !== TAXONOMY_ID_NAMESPACE) {
        problems.push(`RELEASE.json id namespace ${release.id_namespace} is not ${TAXONOMY_ID_NAMESPACE}`);
    }
    const pairs: Array<[string, Buffer]> = [[DATA_FILES[0], files.csv], [DATA_FILES[1], files.combinations]];
    for (const [name, buf] of pairs) {
        const want = release.files?.[name];
        if (!want) problems.push(`RELEASE.json has no entry for ${name}`);
        else if (want.bytes !== buf.length || want.sha256 !== sha256(buf)) {
            problems.push(`${name} differs from RELEASE.json (sha256 ${sha256(buf)}, ${buf.length} bytes)`);
        }
    }
    if (!problems.length && releaseHash(files.csv, files.combinations) !== release.release_hash) {
        problems.push('release hash differs from RELEASE.json');
    }
    return problems;
}

/** RFC 4180: quoted fields may hold commas, doubled quotes and line breaks. A leading byte-order mark is dropped. */
export function parseCsv(text: string): string[][] {
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (quoted) {
            if (c === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i++;
                } else quoted = false;
            } else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && src[i + 1] === '\n') i++;
            row.push(field);
            field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else field += c;
    }
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

const HEADERS = [
    'id', 'code', 'parent_id', 'parent_code', 'depth', 'sort_order', 'node_type', 'segment', 'name', 'name_hi',
    'canonical_subject', 'canonical_topic', 'status', 'verification', 'completeness', 'path', 'attrs',
] as const;

export function parseNodes(csvText: string): TaxonomyRow[] {
    const [header, ...lines] = parseCsv(csvText);
    if (!header || HEADERS.some((h, i) => header[i] !== h)) {
        throw new Error(`taxonomy_nodes.csv: unexpected header ${JSON.stringify(header)}`);
    }
    return lines.map((cells, n) => {
        if (cells.length !== HEADERS.length) throw new Error(`taxonomy_nodes.csv line ${n + 2}: ${cells.length} columns`);
        const c = Object.fromEntries(HEADERS.map((h, i) => [h, cells[i]])) as Record<(typeof HEADERS)[number], string>;
        return {
            id: c.id,
            code: c.code,
            parentId: c.parent_id || null,
            depth: Number(c.depth),
            sortOrder: Number(c.sort_order),
            nodeType: c.node_type,
            segment: c.segment,
            name: c.name,
            nameHi: c.name_hi || null,
            canonicalSubject: c.canonical_subject || null,
            canonicalTopic: c.canonical_topic || null,
            status: c.status,
            verification: c.verification,
            completeness: c.completeness,
            path: c.path,
            attrs: c.attrs ? (JSON.parse(c.attrs) as Record<string, unknown>) : {},
        };
    });
}

export function parseCombinations(jsonText: string): CombinationRow[] {
    const doc = JSON.parse(jsonText) as { combinations?: Array<Record<string, unknown>> };
    return (doc.combinations ?? []).map((c) => ({
        code: String(c.code),
        name: String(c.name),
        rule: typeof c.rule === 'string' ? c.rule : 'guidance',
        compulsory: Array.isArray(c.compulsory) ? c.compulsory.map(String) : [],
        choose: Array.isArray(c.choose) ? c.choose : [],
        languageRule: typeof c.language_rule === 'string' ? c.language_rule : null,
        classCodes: Array.isArray(c.class_codes) ? c.class_codes.map(String) : [],
    }));
}

/** RFC 4122 version-5 UUID. */
export function uuidV5(namespace: string, name: string): string {
    const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
    const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Checks a file before anything is written, so a damaged or hand-edited file is refused whole rather than half
 * loaded: unique codes, ids that follow the rule, parents that come first, and codes built from the parent's.
 */
export function problemsIn(rows: TaxonomyRow[], combos: CombinationRow[] = []): string[] {
    const problems: string[] = [];
    const byId = new Map<string, TaxonomyRow>();
    const codes = new Set<string>();
    for (const r of rows) {
        if (uuidV5(TAXONOMY_ID_NAMESPACE, r.code) !== r.id) problems.push(`${r.code}: id does not follow uuid5(namespace, code)`);
        if (byId.has(r.id)) problems.push(`${r.code}: duplicate id`);
        if (codes.has(r.code)) problems.push(`${r.code}: duplicate code`);
        codes.add(r.code);
        if (!r.parentId) {
            if (r.nodeType !== 'DOMAIN' || r.depth !== 1 || r.code !== r.segment) problems.push(`${r.code}: a root must be a DOMAIN at depth 1`);
        } else {
            const parent = byId.get(r.parentId);
            if (!parent) problems.push(`${r.code}: parent is missing or comes later in the file`);
            else {
                if (r.code !== `${parent.code}.${r.segment}`) problems.push(`${r.code}: code is not parent code + segment`);
                if (r.depth !== parent.depth + 1) problems.push(`${r.code}: wrong depth`);
            }
        }
        byId.set(r.id, r);
    }
    for (const c of combos) {
        for (const k of c.classCodes) if (!codes.has(k)) problems.push(`combination ${c.code}: unknown class ${k}`);
    }
    return problems;
}

/**
 * sha256(nodes, NUL, combinations). Book Buddy's releaseHash() computes the same value from the same files, and
 * RELEASE.json records it, so `taxonomy.release.hash` names the release identically in every app.
 */
export function releaseHash(csv: Buffer | string, combinations: Buffer | string): string {
    return createHash('sha256').update(csv).update('\u0000').update(combinations).digest('hex');
}

export function inBatches<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/**
 * One statement per batch. Every value travels as text and is cast here, because arrays of mixed types and NULLs
 * inside arrays are unreliable through the raw-query layer ('' stands for NULL). Rows are applied in order, and the
 * file lists parents first, which the database's own guard trigger relies on.
 */
export const UPSERT_NODES_SQL = `
INSERT INTO taxonomy.node (id, code, parent_id, depth, sort_order, node_type, segment, name, name_hi,
                           canonical_subject, canonical_topic, status, verification, completeness, path, attrs)
SELECT t.id::uuid, t.code, NULLIF(t.parent_id, '')::uuid, t.depth::smallint, t.sort_order::int, t.node_type, t.segment,
       t.name, NULLIF(t.name_hi, ''), NULLIF(t.canonical_subject, ''), NULLIF(t.canonical_topic, ''), t.status,
       t.verification, t.completeness, t.path, t.attrs::jsonb
FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
            $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[], $15::text[], $16::text[])
     WITH ORDINALITY AS t(id, code, parent_id, depth, sort_order, node_type, segment, name, name_hi,
                          canonical_subject, canonical_topic, status, verification, completeness, path, attrs, n)
ORDER BY t.n
ON CONFLICT (id) DO UPDATE SET
    sort_order = EXCLUDED.sort_order, name = EXCLUDED.name, name_hi = EXCLUDED.name_hi,
    canonical_subject = EXCLUDED.canonical_subject, canonical_topic = EXCLUDED.canonical_topic,
    status = EXCLUDED.status, verification = EXCLUDED.verification, completeness = EXCLUDED.completeness,
    path = EXCLUDED.path, attrs = EXCLUDED.attrs`;

export function nodeBatchParams(batch: TaxonomyRow[]): string[][] {
    const col = (f: (r: TaxonomyRow) => string) => batch.map(f);
    return [
        col((r) => r.id),
        col((r) => r.code),
        col((r) => r.parentId ?? ''),
        col((r) => String(r.depth)),
        col((r) => String(r.sortOrder)),
        col((r) => r.nodeType),
        col((r) => r.segment),
        col((r) => r.name),
        col((r) => r.nameHi ?? ''),
        col((r) => r.canonicalSubject ?? ''),
        col((r) => r.canonicalTopic ?? ''),
        col((r) => r.status),
        col((r) => r.verification),
        col((r) => r.completeness),
        col((r) => r.path),
        col((r) => JSON.stringify(r.attrs)),
    ];
}

/** Nodes that disappeared from the file are made inactive, never deleted: content may still point at them. */
export const DEACTIVATE_MISSING_SQL = `
UPDATE taxonomy.node SET status = 'inactive'
WHERE status <> 'inactive' AND NOT (id::text = ANY($1::text[]))`;
