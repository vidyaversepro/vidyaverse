import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { NormalizedClass } from '@/lib/normalizeAcademics';

/** Curriculum v2 node, as /api/v1/curriculum returns it (bare JSON, no envelope). */
interface CurriculumNode {
    id: string;
    code: string;
    name: string;
    nodeType: string;
    path: string;
    verification: string;
}

/** What a class can teach: a board's class, a programme, an exam course (the learning-goal node types). */
const GOAL_TYPES = 'CLASS,PROGRAM,SPECIALISATION,PERIOD,LEVEL,EXAM';
const NONE = '__none__';

/**
 * Which curriculum v2 node this class teaches, and for a class with streams which stream each one is. Every student
 * of the class gets it as their main learning goal in DigiClassroom and PDLMS, so their books and tutor follow it.
 */
export function ClassCurriculumPanel({ institutionId, cls }: { institutionId: string; cls: NormalizedClass }) {
    const queryClient = useQueryClient();
    const [nodeId, setNodeId] = useState<string | null>(cls.curriculumNodeId ?? null);
    const [streams, setStreams] = useState<Record<string, string | null>>({});
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setNodeId(cls.curriculumNodeId ?? null);
        setStreams(Object.fromEntries(cls.streams.map((s) => [s.id, s.combinationCode ?? null])));
        setQuery('');
    }, [cls.id, cls.curriculumNodeId, cls.streams]);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    const { data: current } = useQuery<CurriculumNode | null>({
        queryKey: ['curriculum-node', nodeId],
        queryFn: async () => (await api.get(`/curriculum/nodes/${nodeId}`)).data.node,
        enabled: !!nodeId,
    });
    const { data: combinations = [] } = useQuery<Array<{ code: string; name: string }>>({
        queryKey: ['curriculum-combinations', nodeId],
        queryFn: async () => (await api.get(`/curriculum/nodes/${nodeId}/combinations`)).data,
        enabled: !!nodeId && cls.streams.length > 0,
    });
    const { data: results = [], isFetching: searching, error: searchError } = useQuery<CurriculumNode[]>({
        queryKey: ['curriculum-search', debounced],
        queryFn: async () => (await api.get('/curriculum/search', { params: { q: debounced, types: GOAL_TYPES, limit: 20 } })).data,
        enabled: debounced.length >= 2,
    });

    const dirty =
        nodeId !== (cls.curriculumNodeId ?? null) ||
        cls.streams.some((s) => (streams[s.id] ?? null) !== (s.combinationCode ?? null));

    const save = async () => {
        setSaving(true);
        try {
            await api.put(
                `/class/${cls.id}/curriculum`,
                { nodeId, streams: nodeId ? cls.streams.map((s) => ({ streamId: s.id, combinationCode: streams[s.id] ?? null })) : [] },
                { headers: { 'x-institution-id': institutionId } },
            );
            toast.success(nodeId ? 'Curriculum saved: students of this class now study it' : 'Curriculum cleared');
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['classes', institutionId] }),
                queryClient.invalidateQueries({ queryKey: ['streams', 'all', institutionId] }),
            ]);
        } catch (err: any) {
            toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Could not save the curriculum');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
                <GraduationCap className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">Curriculum taught in {cls.name}</h3>
                    <p className="text-xs text-muted-foreground">
                        Its students study this in DigiClassroom and PDLMS: their books, tutor and practice follow it.
                    </p>
                </div>
            </div>

            {nodeId ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{current?.path ?? 'Loading…'}</div>
                        {current && <div className="text-[11px] font-mono text-muted-foreground">{current.code}</div>}
                    </div>
                    <Button size="icon" variant="ghost" aria-label="Clear the curriculum" onClick={() => setNodeId(null)}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">Not set: students of this class choose what they study themselves.</p>
            )}

            <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search a board class, programme or exam (e.g. CBSE Class 9)"
                    aria-label="Search the curriculum"
                    className="pl-9"
                />
                {searching && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
            </div>
            {searchError && <p className="text-xs text-destructive">The curriculum could not be searched.</p>}
            {debounced.length >= 2 && !searching && results.length === 0 && !searchError && (
                <p className="text-xs text-muted-foreground">Nothing matches that. Try a shorter word.</p>
            )}
            {results.length > 0 && (
                <ul className="max-h-56 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                    {results.map((n) => (
                        <li key={n.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    setNodeId(n.id);
                                    setQuery('');
                                    setStreams(Object.fromEntries(cls.streams.map((s) => [s.id, null])));
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-muted/50"
                            >
                                <div className="text-sm text-foreground">{n.path}</div>
                                <div className="text-[11px] text-muted-foreground">
                                    {n.nodeType.toLowerCase()}
                                    {n.verification !== 'sourced' && ' · details to verify'}
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {nodeId && cls.streams.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Streams</div>
                    {combinations.length === 0 ? (
                        <p className="text-xs text-muted-foreground">This curriculum defines no streams.</p>
                    ) : (
                        cls.streams.map((s) => (
                            <div key={s.id} className="flex items-center gap-3">
                                <span className="text-sm w-32 truncate">{s.name}</span>
                                <Select value={streams[s.id] ?? NONE} onValueChange={(v) => setStreams((prev) => ({ ...prev, [s.id]: v === NONE ? null : v }))}>
                                    <SelectTrigger className="h-8 flex-1" aria-label={`Stream code of ${s.name}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>Not set</SelectItem>
                                        {combinations.map((c) => (
                                            <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))
                    )}
                </div>
            )}

            <div className="flex justify-end">
                <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save curriculum
                </Button>
            </div>
        </div>
    );
}
