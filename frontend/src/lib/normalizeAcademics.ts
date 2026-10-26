export interface FlatClass {
    id: string;
    name: string;
    streamsEnabled: boolean;
    /** The curriculum v2 node the class teaches (its students' main learning goal). */
    curriculumNodeId?: string | null;
    _count?: { streams: number; sections: number; students: number };
}

export interface FlatStream {
    id: string;
    classId: string;
    name: string;
    /** The curriculum v2 stream code ("CBSE_SCI_PCM") for the class's node. */
    combinationCode?: string | null;
    _count?: { sections: number };
}

export interface FlatSection {
    id: string;
    classId: string;
    streamId?: string | null;
    name: string;
    expectedStudentCount?: number;
    _count?: { students: number };
}

export interface NormalizedSection extends FlatSection { }

export interface NormalizedStream extends FlatStream {
    sections: NormalizedSection[];
}

export interface NormalizedClass extends FlatClass {
    streams: NormalizedStream[];
    sections: NormalizedSection[]; // For classes without streams or unassigned sections
}

/**
 * Normalizes flat arrays of classes, streams, and sections into a deeply nested hierarchy.
 * @param classes Array of flat class objects
 * @param streams Array of flat stream objects
 * @param sections Array of flat section objects
 * @returns Array of nested class objects
 */
export function normalizeAcademics(
    classes: FlatClass[] = [],
    streams: FlatStream[] = [],
    sections: FlatSection[] = []
): NormalizedClass[] {
    // 1. Map all classes
    const classMap: Record<string, NormalizedClass> = {};
    for (const cls of classes) {
        classMap[cls.id] = { ...cls, streams: [], sections: [] };
    }

    // 2. Map streams to classes
    const streamMap: Record<string, NormalizedStream> = {};
    for (const stream of streams) {
        const normStream: NormalizedStream = { ...stream, sections: [] };
        streamMap[stream.id] = normStream;

        if (classMap[stream.classId]) {
            classMap[stream.classId].streams.push(normStream);
        }
    }

    // 3. Map sections to streams, or fallback directly to classes
    for (const section of sections) {
        const normSection: NormalizedSection = { ...section };

        if (section.streamId && streamMap[section.streamId]) {
            // Assign to stream map
            streamMap[section.streamId].sections.push(normSection);
        } else if (classMap[section.classId]) {
            // Un-streamed section, assign to class directly
            classMap[section.classId].sections.push(normSection);
        }
    }

    return Object.values(classMap);
}
