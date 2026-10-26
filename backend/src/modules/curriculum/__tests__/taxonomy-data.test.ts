import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { releaseDir } from '../loader';
import {
    ReleaseManifest,
    TAXONOMY_ID_NAMESPACE,
    parseCombinations,
    parseNodes,
    problemsIn,
    releaseProblems,
    uuidV5,
} from '../taxonomy-data';
import { BOOK_BUDDY_IDS } from './book-buddy-fixtures';

const dir = releaseDir();
const csv = readFileSync(join(dir, 'taxonomy_nodes.csv'));
const combinations = readFileSync(join(dir, 'combinations.json'));
const release = JSON.parse(readFileSync(join(dir, 'RELEASE.json'), 'utf8')) as ReleaseManifest;

describe('vendored edu-taxonomy release', () => {
    it('is the release Book Buddy cut, byte for byte', () => {
        expect(release.version).toBe('2026.10.1');
        expect(releaseProblems(release, { csv, combinations })).toEqual([]);
    });

    it('passes its own verify-release.mjs (the check Book Buddy ships with it)', () => {
        const r = spawnSync(process.execPath, [join(dir, 'verify-release.mjs')], { encoding: 'utf8' });
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
    });

    it('is refused when a single byte differs', () => {
        const edited = Buffer.concat([csv, Buffer.from('\n')]);
        expect(releaseProblems(release, { csv: edited, combinations })).toEqual([
            expect.stringContaining('taxonomy_nodes.csv differs from RELEASE.json'),
        ]);
    });

    it('parses to a well-formed tree with no problems', () => {
        const rows = parseNodes(csv.toString('utf8'));
        expect(rows).toHaveLength(release.node_count);
        expect(rows).toHaveLength(7884);
        expect(problemsIn(rows, parseCombinations(combinations.toString('utf8')))).toEqual([]);
    });

    it('gives the 20 sampled codes the ids Book Buddy has', () => {
        const byCode = new Map(parseNodes(csv.toString('utf8')).map((r) => [r.code, r.id]));
        for (const [code, id] of BOOK_BUDDY_IDS) {
            expect({ code, id: byCode.get(code) }).toEqual({ code, id });
            expect(uuidV5(TAXONOMY_ID_NAMESPACE, code)).toBe(id);
        }
    });
});
