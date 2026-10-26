import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Building2,
    GraduationCap,
    Users,
    Loader2,
    Trash2,
    ArrowLeft,
    Plus,
    Calendar,
    Mail,
    Phone,
    MapPin,
    BookOpen,
    ChevronRight,
    GitBranch,
    Layers,
    MoreVertical,
    Edit,
    Palette,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import {
    useInstitution,
    useCreateClass,
    useUpdateClass,
    useDeleteClass,
    useCreateStream,
    useUpdateStream,
    useDeleteStream,
    useCreateSection,
    useUpdateSection,
    useDeleteSection,
    useCreateBulkSections,
    useTeachers,
} from '@/lib/queries';
import { normalizeAcademics, NormalizedClass, NormalizedStream, NormalizedSection } from '@/lib/normalizeAcademics';
import { ClassCurriculumPanel } from '@/components/institutions/ClassCurriculumPanel';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import SectionStudentOnboarding from '@/components/institutions/SectionStudentOnboarding';
import ModulesSubscriptionPanel from '@/components/institutions/ModulesSubscriptionPanel';
import BrandingPanel from '@/components/institutions/BrandingPanel';

export default function InstitutionDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: institution, isLoading: loadingInst } = useInstitution(id);

    if (loadingInst) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!institution) {
        return (
            <div className="p-4 sm:p-6 text-center">
                <p className="text-muted-foreground">Institution not found.</p>
                <Button variant="link" onClick={() => navigate('/app/institutions')}>
                    ← Back to Institutions
                </Button>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6">
            <PageHeader
                breadcrumb={[
                    { label: 'Dashboard', href: '/app/dashboard' },
                    { label: 'Institutions', href: '/app/institutions' },
                    { label: institution.name },
                ]}
                title={institution.name}
                description={`Code: ${institution.code} · Academic Year: ${institution.academicYear || '—'} `}
                action={
                    <Button variant="outline" onClick={() => navigate('/app/institutions')}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                    </Button>
                }
            />

            <Tabs defaultValue="overview" className="mt-6">
                <TabsList className="bg-muted p-1 rounded-xl gap-1 overflow-x-auto no-scrollbar flex-nowrap justify-start w-full">
                    <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-4 py-2 gap-2">
                        <Building2 className="w-4 h-4" />
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="academics" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-4 py-2 gap-2">
                        <GraduationCap className="w-4 h-4" />
                        Classes & Sections
                    </TabsTrigger>
                    <TabsTrigger value="students" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-4 py-2 gap-2">
                        <Users className="w-4 h-4" />
                        Students
                    </TabsTrigger>
                    <TabsTrigger value="modules" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-4 py-2 gap-2">
                        <Layers className="w-4 h-4" />
                        Modules
                    </TabsTrigger>
                    <TabsTrigger value="branding" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-4 py-2 gap-2">
                        <Palette className="w-4 h-4" />
                        Branding
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-6 focus-visible:outline-none">
                    <OverviewTab institution={institution} />
                </TabsContent>
                <TabsContent value="academics" className="mt-6 focus-visible:outline-none">
                    <AcademicsTab institutionId={institution.id} />
                </TabsContent>
                <TabsContent value="students" className="mt-6 focus-visible:outline-none">
                    <StudentsTab institutionId={institution.id} />
                </TabsContent>
                <TabsContent value="modules" className="mt-6 focus-visible:outline-none">
                    <ModulesSubscriptionPanel institutionId={institution.id} />
                </TabsContent>
                <TabsContent value="branding" className="mt-6 focus-visible:outline-none">
                    <BrandingPanel institution={institution as any} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ institution }: { institution: any }) {
    const infoItems = [
        { icon: Building2, label: 'Institution Code', value: institution.code },
        { icon: Calendar, label: 'Academic Year', value: institution.academicYear || '—' },
        { icon: Mail, label: 'Contact Email', value: institution.contactEmail || '—' },
        { icon: Phone, label: 'Contact Phone', value: institution.contactPhone || '—' },
        { icon: MapPin, label: 'Address', value: institution.address || '—' },
    ];

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8 shadow-sm">
                <h2 className="text-lg text-foreground mb-6">Institution Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {infoItems.map((item) => (
                        <div key={item.label} className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-muted">
                                <item.icon className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{item.label}</p>
                                <p className="text-sm font-medium text-foreground mt-0.5">{item.value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Subscription</p>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="capitalize">{institution.subscriptionTier}</Badge>
                        <Badge variant={institution.subscriptionStatus === 'active' ? 'default' : 'secondary'} className="capitalize">
                            {institution.subscriptionStatus}
                        </Badge>
                    </div>
                </div>
                <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Students</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{institution._count?.students ?? '—'}</p>
                </div>
                <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Onboarding</p>
                    <Badge variant={institution.onboardingCompleted ? 'default' : 'secondary'} className="mt-2">
                        {institution.onboardingCompleted ? 'Complete' : 'Pending'}
                    </Badge>
                </div>
            </div>
        </motion.div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Academics Tab (Classes → Streams → Sections) - Hierarchical Rendering
// ─────────────────────────────────────────────────────────────────────────────
function AcademicsTab({ institutionId }: { institutionId: string }) {
    const queryClient = useQueryClient();

    // 1. Fetch entire hierarchy directly for instantaneous UI
    const { data: rawClasses, isLoading: loadingClasses } = useQuery<NormalizedClass[]>({
        queryKey: ['classes', institutionId],
        queryFn: async () => { const res = await api.get('/class', { params: { institutionId } }); return res.data.data; },
        enabled: !!institutionId
    });
    const { data: rawStreams, isLoading: loadingStreams } = useQuery<NormalizedStream[]>({
        queryKey: ['streams', 'all', institutionId],
        queryFn: async () => { const res = await api.get('/stream', { params: { institutionId } }); return res.data.data; },
        enabled: !!institutionId
    });
    const { data: rawSections, isLoading: loadingSections } = useQuery<NormalizedSection[]>({
        queryKey: ['sections', 'all', institutionId],
        queryFn: async () => { const res = await api.get('/section', { params: { institutionId, limit: 1000 } }); return res.data.data; },
        enabled: !!institutionId
    });

    // 2. Normalize and compute the reactive hierarchy
    const normalizedData = useMemo(() => {
        return normalizeAcademics(rawClasses || [], rawStreams || [], rawSections || []);
    }, [rawClasses, rawStreams, rawSections]);

    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);

    // Context derivations
    const selectedClass = useMemo(() => normalizedData.find(c => c.id === selectedClassId), [normalizedData, selectedClassId]);
    const streamsEnabled = selectedClass?.streamsEnabled ?? false;
    const activeStreams = selectedClass?.streams || [];
    const activeSections = useMemo(() => {
        if (!selectedClass) return [];
        if (streamsEnabled) {
            if (!selectedStreamId) return [];
            const stream = selectedClass.streams.find(s => s.id === selectedStreamId);
            return stream?.sections || [];
        } else {
            return selectedClass.sections; // Fallback directly tied to class
        }
    }, [selectedClass, streamsEnabled, selectedStreamId]);

    // Auto-select first class
    useEffect(() => {
        if (normalizedData.length > 0 && !selectedClassId) {
            setSelectedClassId(normalizedData[0].id);
        }
    }, [normalizedData, selectedClassId]);

    // Reset stream selection when class changes
    useEffect(() => {
        setSelectedStreamId(null);
    }, [selectedClassId]);

    // Auto-select first stream when streams load
    useEffect(() => {
        if (streamsEnabled && activeStreams.length > 0 && !selectedStreamId) {
            setSelectedStreamId(activeStreams[0].id);
        }
    }, [activeStreams, streamsEnabled, selectedStreamId]);

    // Class mutations
    const [isAddClassOpen, setIsAddClassOpen] = useState(false);
    const [isEditClassOpen, setIsEditClassOpen] = useState(false);
    const [editClassId, setEditClassId] = useState('');
    const [newClassName, setNewClassName] = useState('');
    const createClass = useCreateClass();
    const updateClass = useUpdateClass();
    const deleteClass = useDeleteClass();

    // Stream mutations
    const [isAddStreamOpen, setIsAddStreamOpen] = useState(false);
    const [isEditStreamOpen, setIsEditStreamOpen] = useState(false);
    const [editStreamId, setEditStreamId] = useState('');
    const [addStreamClassId, setAddStreamClassId] = useState<string>('');
    const [newStreamName, setNewStreamName] = useState('');
    const [newStreamDesc, setNewStreamDesc] = useState('');
    const createStream = useCreateStream();
    const updateStream = useUpdateStream();
    const deleteStream = useDeleteStream();

    // Section mutations & Bulk State
    const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
    const [isEditSectionOpen, setIsEditSectionOpen] = useState(false);
    const [editSectionId, setEditSectionId] = useState('');
    const [addSectionClassId, setAddSectionClassId] = useState<string>('');
    const [addSectionStreamId, setAddSectionStreamId] = useState<string>('');

    // Single Section
    const [newSectionName, setNewSectionName] = useState('');
    const [newSectionCapacity, setNewSectionCapacity] = useState('40');

    // Bulk Section Generation
    const [sectionCreationMode, setSectionCreationMode] = useState<'single' | 'bulk'>('single');
    const [bulkSectionCount, setBulkSectionCount] = useState('3');
    const [bulkBaseCapacity, setBulkBaseCapacity] = useState('40');
    const [bulkNamingScheme, setBulkNamingScheme] = useState<'alphabetic' | 'numeric'>('alphabetic');
    const [bulkPreview, setBulkPreview] = useState<{ name: string; capacity: number; classTeacherId: string }[]>([]);

    const createSection = useCreateSection();
    const updateSection = useUpdateSection();
    const deleteSection = useDeleteSection();
    const createBulkSections = useCreateBulkSections();
    const { data: teachersData } = useTeachers(institutionId || '');
    const teachers = teachersData || [];

    // Dialog state sync
    useEffect(() => {
        if (isAddStreamOpen && selectedClassId) {
            setAddStreamClassId(selectedClassId);
        } else if (!isAddStreamOpen) {
            setAddStreamClassId('');
            setNewStreamName('');
            setNewStreamDesc('');
        }
    }, [isAddStreamOpen, selectedClassId]);

    useEffect(() => {
        if (isAddSectionOpen && selectedClassId) {
            setAddSectionClassId(selectedClassId);
            if (streamsEnabled && selectedStreamId) {
                setAddSectionStreamId(selectedStreamId);
            }
        } else if (!isAddSectionOpen) {
            setAddSectionClassId('');
            setAddSectionStreamId('');
            setNewSectionName('');
            setNewSectionCapacity('40');
            setSectionCreationMode('single');
            setBulkPreview([]);
        }
    }, [isAddSectionOpen, selectedClassId, selectedStreamId, streamsEnabled]);

    // External streams for Add Section dialog selectively enabled
    const addSectionStreamsEnabled = normalizedData.find(c => c.id === addSectionClassId)?.streamsEnabled;

    // ── Handlers ──
    const handleAddClass = () => {
        if (!newClassName.trim()) return;
        createClass.mutate({ institutionId, name: newClassName.trim() }, {
            onSuccess: () => {
                toast.success('Class added successfully');
                setNewClassName('');
                setIsAddClassOpen(false);
                queryClient.invalidateQueries({ queryKey: ['classes', institutionId] });
            },
            onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add class'),
        });
    };

    const handleEditClassSubmit = () => {
        if (!newClassName.trim() || !editClassId) return;
        updateClass.mutate({ id: editClassId, institutionId, name: newClassName.trim() }, {
            onSuccess: () => {
                toast.success('Class updated successfully');
                setIsEditClassOpen(false);
                queryClient.invalidateQueries({ queryKey: ['classes', institutionId] });
            },
            onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update class'),
        });
    };

    const handleDeleteClass = (classId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (window.confirm('Delete this class and all its streams/sections?')) {
            deleteClass.mutate({ id: classId, institutionId }, {
                onSuccess: () => {
                    toast.success('Class deleted');
                    queryClient.invalidateQueries({ queryKey: ['classes', institutionId] });
                    queryClient.invalidateQueries({ queryKey: ['streams', 'all', institutionId] });
                    queryClient.invalidateQueries({ queryKey: ['sections', 'all', institutionId] });
                    if (selectedClassId === classId) {
                        setSelectedClassId(null);
                        setSelectedStreamId(null);
                    }
                },
                onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete class'),
            });
        }
    };

    const handleToggleStreams = () => {
        if (!selectedClassId) return;
        const newValue = !streamsEnabled;
        updateClass.mutate({ id: selectedClassId, institutionId, streamsEnabled: newValue }, {
            onSuccess: () => {
                toast.success(newValue ? 'Streams enabled for this class' : 'Streams disabled for this class');
                queryClient.invalidateQueries({ queryKey: ['classes', institutionId] });
                if (!newValue) setSelectedStreamId(null);
            },
            onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update class'),
        });
    };

    const handleAddStream = () => {
        if (!newStreamName.trim() || !addStreamClassId) return;
        createStream.mutate({
            institutionId,
            classId: addStreamClassId,
            name: newStreamName.trim(),
            description: newStreamDesc.trim() || undefined,
        }, {
            onSuccess: () => {
                toast.success('Stream added successfully');
                setNewStreamName('');
                setNewStreamDesc('');
                setIsAddStreamOpen(false);
                queryClient.invalidateQueries({ queryKey: ['streams', 'all', institutionId] });
                queryClient.invalidateQueries({ queryKey: ['classes', institutionId] }); // To update stream count on class
            },
            onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add stream'),
        });
    };

    const handleEditStreamSubmit = () => {
        if (!newStreamName.trim() || !editStreamId || !selectedClassId) return;
        updateStream.mutate({
            id: editStreamId,
            institutionId,
            classId: selectedClassId,
            name: newStreamName.trim(),
            description: newStreamDesc.trim() || undefined,
        }, {
            onSuccess: () => {
                toast.success('Stream updated successfully');
                setIsEditStreamOpen(false);
                queryClient.invalidateQueries({ queryKey: ['streams', 'all', institutionId] });
                queryClient.invalidateQueries({ queryKey: ['classes', institutionId] }); // To update stream count on class
            },
            onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update stream'),
        });
    };

    const handleDeleteStream = (streamId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!selectedClassId) return;
        if (window.confirm('Delete this stream and all its sections?')) {
            deleteStream.mutate({ id: streamId, classId: selectedClassId, institutionId }, {
                onSuccess: () => {
                    toast.success('Stream deleted');
                    queryClient.invalidateQueries({ queryKey: ['streams', 'all', institutionId] });
                    queryClient.invalidateQueries({ queryKey: ['sections', 'all', institutionId] });
                    queryClient.invalidateQueries({ queryKey: ['classes', institutionId] }); // To update stream count on class
                    if (selectedStreamId === streamId) setSelectedStreamId(null);
                },
                onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete stream'),
            });
        }
    };

    const handleAddSection = () => {
        if (sectionCreationMode === 'single') {
            if (!newSectionName.trim() || !addSectionClassId) return;
            if (addSectionStreamsEnabled && !addSectionStreamId) {
                toast.error('Please select a stream first');
                return;
            }
            createSection.mutate({
                institutionId,
                classId: addSectionClassId,
                streamId: addSectionStreamsEnabled ? addSectionStreamId || undefined : undefined,
                name: newSectionName.trim(),
                expectedStudentCount: parseInt(newSectionCapacity) || 40,
            }, {
                onSuccess: () => {
                    toast.success('Section added successfully');
                    setNewSectionName('');
                    setNewSectionCapacity('40');
                    setIsAddSectionOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['sections', 'all', institutionId] });
                    queryClient.invalidateQueries({ queryKey: ['classes', institutionId] }); // To update section count on class
                    queryClient.invalidateQueries({ queryKey: ['streams', 'all', institutionId] }); // To update section count on stream
                },
                onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add section'),
            });
        } else {
            handleBulkSubmit();
        }
    };

    const handleEditSectionSubmit = () => {
        if (!newSectionName.trim() || !editSectionId || !selectedClassId) return;
        updateSection.mutate({
            id: editSectionId,
            institutionId,
            classId: selectedClassId,
            streamId: streamsEnabled ? selectedStreamId || undefined : undefined,
            name: newSectionName.trim(),
            expectedStudentCount: parseInt(newSectionCapacity) || undefined,
        }, {
            onSuccess: () => {
                toast.success('Section updated successfully');
                setIsEditSectionOpen(false);
                queryClient.invalidateQueries({ queryKey: ['sections', 'all', institutionId] });
            },
            onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update section'),
        });
    };

    const handleGeneratePreview = () => {
        const count = parseInt(bulkSectionCount) || 1;
        const capacity = parseInt(bulkBaseCapacity) || 40;
        const preview = [];

        for (let i = 0; i < count; i++) {
            let name = '';
            if (bulkNamingScheme === 'alphabetic') {
                name = String.fromCharCode(65 + i); // 65 is 'A'
            } else {
                name = (i + 1).toString();
            }
            preview.push({ name, capacity, classTeacherId: 'none' });
        }
        setBulkPreview(preview);
    };

    const handleBulkSubmit = async () => {
        if (!addSectionClassId || bulkPreview.length === 0) return;

        const payload = bulkPreview.map(section => ({
            institutionId: institutionId!,
            classId: addSectionClassId,
            streamId: addSectionStreamsEnabled ? addSectionStreamId || undefined : undefined,
            name: section.name,
            expectedStudentCount: section.capacity,
            classTeacherId: section.classTeacherId === 'none' ? undefined : section.classTeacherId
        }));

        createBulkSections.mutate(payload, {
            onSuccess: () => {
                toast.success(`${payload.length} sections generated successfully`);
                setIsAddSectionOpen(false);
                setBulkPreview([]);
                setSectionCreationMode('single');
                queryClient.invalidateQueries({ queryKey: ['sections', 'all', institutionId] });
                queryClient.invalidateQueries({ queryKey: ['classes', institutionId] });
                queryClient.invalidateQueries({ queryKey: ['streams', 'all', institutionId] });
            },
            onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to generate sections'),
        });
    };

    const handleTeacherChange = (index: number, teacherId: string) => {
        const newPreview = [...bulkPreview];
        newPreview[index] = { ...newPreview[index], classTeacherId: teacherId };
        setBulkPreview(newPreview);
    };

    const handleNameOverride = (index: number, newName: string) => {
        const newPreview = [...bulkPreview];
        newPreview[index] = { ...newPreview[index], name: newName };
        setBulkPreview(newPreview);
    };

    const handleDeleteSection = (sectionId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!selectedClassId) return;

        const section = activeSections.find(s => s.id === sectionId);
        if (section && section._count?.students && section._count.students > 0) {
            toast.error(`Cannot delete section with ${section._count.students} enrolled students. Please remove or transfer them first.`);
            return;
        }

        if (window.confirm('Delete this section?')) {
            deleteSection.mutate({
                id: sectionId,
                classId: selectedClassId,
                streamId: streamsEnabled ? selectedStreamId || undefined : undefined,
                institutionId,
            }, {
                onSuccess: () => {
                    toast.success('Section deleted');
                    queryClient.invalidateQueries({ queryKey: ['sections', 'all', institutionId] });
                    queryClient.invalidateQueries({ queryKey: ['classes', institutionId] }); // To update section count on class
                    queryClient.invalidateQueries({ queryKey: ['streams', 'all', institutionId] }); // To update section count on stream
                },
                onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete section'),
            });
        }
    };

    // Determine if section can be added
    const canAddSection = selectedClassId && (!streamsEnabled || !!selectedStreamId);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">

            {/* Hierarchy Reset / Settings Ribbon */}
            <div className="bg-card rounded-xl border border-border p-3 shadow-sm flex flex-wrap justify-between items-center gap-2">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span className="text-sm font-medium text-muted-foreground">Academics Architecture</span>
                    {selectedClassId && (
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedClassId(null); setSelectedStreamId(null); }} className="h-7 text-xs">
                            Reset View
                        </Button>
                    )}
                </div>
                {selectedClassId && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Advanced Streams</span>
                        <Switch checked={streamsEnabled} onCheckedChange={handleToggleStreams} disabled={updateClass.isPending} />
                    </div>
                )}
            </div>

            {selectedClass && <ClassCurriculumPanel institutionId={institutionId} cls={selectedClass} />}

            {/* THREE CARD LAYOUT */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:h-[600px]">

                {/* ── CARD 1: CLASSES ── */}
                <div className="bg-muted/30 rounded-2xl border-2 border-border p-5 shadow-sm overflow-hidden flex flex-col min-h-[300px] md:h-full">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-border">
                        <div className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-muted-foreground" />
                            <h2 className="text-lg text-foreground">Classes</h2>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => setIsAddClassOpen(true)}>
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                        {loadingClasses ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                        ) : normalizedData.length === 0 ? (
                            <div className="text-center py-8 px-4 text-sm text-muted-foreground border border-dashed rounded-xl border-border">
                                No classes available.<br />Click + to add your first class.
                            </div>
                        ) : (
                            <AnimatePresence mode="popLayout">
                                {normalizedData.map((cls) => (
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        key={cls.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedClassId(cls.id)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedClassId(cls.id); } }}
                                        className={cn(
                                            "w-full text-left p-3 rounded-xl border transition-all flex justify-between items-center group cursor-pointer",
                                            selectedClassId === cls.id
                                                ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                                                : "border-transparent bg-card hover:border-border shadow-sm"
                                        )}
                                    >
                                        <div>
                                            <span className="font-semibold block">{cls.name}</span>
                                            <span className="text-[10px] uppercase tracking-wider opacity-60">
                                                {cls.streamsEnabled ? `${cls._count?.streams || 0} Streams` : `${cls._count?.sections || 0} Sections`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity p-0" onClick={e => e.stopPropagation()}>
                                                        <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                                                    <DropdownMenuItem onClick={() => { setEditClassId(cls.id); setNewClassName(cls.name); setIsEditClassOpen(true); }}>
                                                        <Edit className="w-4 h-4 mr-2" />
                                                        Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => handleDeleteClass(cls.id, e)}>
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <ChevronRight className={cn("w-4 h-4 transition-transform", selectedClassId === cls.id ? "opacity-100 translate-x-1" : "opacity-0")} />
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                    </div>
                </div>

                {/* ── CARD 2: STREAMS ── */}
                <div className="bg-muted/30 rounded-2xl border-2 border-border p-5 shadow-sm overflow-hidden flex flex-col min-h-[300px] md:h-full">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-border">
                        <div className="flex items-center gap-2">
                            <GitBranch className="w-5 h-5 text-muted-foreground" />
                            <h2 className="text-lg text-foreground">Streams</h2>
                        </div>
                        {streamsEnabled && (
                            <Button size="icon" variant="ghost" onClick={() => setIsAddStreamOpen(true)}>
                                <Plus className="w-4 h-4" />
                            </Button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                        {!selectedClassId ? (
                            <div className="text-center py-8 px-4 text-sm text-muted-foreground">
                                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                Select a class first to view streams.
                            </div>
                        ) : !streamsEnabled ? (
                            <div className="text-center py-8 px-4 text-sm text-muted-foreground border border-dashed rounded-xl border-border">
                                No streams available for this class. <br />
                                <span className="text-xs mt-2 block opacity-70">Streams are toggled OFF in settings.</span>
                            </div>
                        ) : loadingStreams ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                        ) : activeStreams.length === 0 ? (
                            <div className="text-center py-8 px-4 text-sm text-muted-foreground border border-dashed rounded-xl border-border">
                                No streams configured.<br />Click + to add a stream.
                            </div>
                        ) : (
                            <AnimatePresence mode="popLayout">
                                {activeStreams.map((stream) => (
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        key={stream.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedStreamId(stream.id)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStreamId(stream.id); } }}
                                        className={cn(
                                            "w-full text-left p-3 rounded-xl border transition-all flex flex-col group shadow-sm cursor-pointer",
                                            selectedStreamId === stream.id
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border bg-card hover:border-primary/40"
                                        )}
                                    >
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 flex justify-between w-full">
                                            <span>{selectedClass?.name}</span>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity p-0 -mt-1 -mr-1" onClick={e => e.stopPropagation()}>
                                                        <MoreVertical className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                                                    <DropdownMenuItem onClick={() => { setEditStreamId(stream.id); setNewStreamName(stream.name); setNewStreamDesc((stream as any).description || ''); setIsEditStreamOpen(true); }}>
                                                        <Edit className="w-4 h-4 mr-2" />
                                                        Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => handleDeleteStream(stream.id, e)}>
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                        <div className="flex justify-between items-center w-full">
                                            <span className="font-semibold text-base">{stream.name}</span>
                                            <ChevronRight className={cn("w-4 h-4 transition-transform", selectedStreamId === stream.id ? "opacity-100 translate-x-1" : "opacity-0")} />
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                    </div>
                </div>

                {/* ── CARD 3: SECTIONS ── */}
                <div className="bg-muted/50 rounded-2xl border-2 border-border p-5 shadow-sm overflow-hidden flex flex-col min-h-[300px] md:h-full">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-border">
                        <div className="flex items-center gap-2">
                            <Layers className="w-5 h-5 text-muted-foreground" />
                            <h2 className="text-lg text-foreground">Sections</h2>
                        </div>
                        {canAddSection && (
                            <Button size="icon" variant="ghost" onClick={() => setIsAddSectionOpen(true)}>
                                <Plus className="w-4 h-4" />
                            </Button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {!selectedClassId ? (
                            <div className="text-center py-8 px-4 text-sm text-muted-foreground">
                                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                Select a class first.
                            </div>
                        ) : (streamsEnabled && !selectedStreamId) ? (
                            <div className="text-center py-8 px-4 text-sm text-muted-foreground">
                                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                Select a stream first.
                            </div>
                        ) : loadingSections ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                        ) : activeSections.length === 0 ? (
                            <div className="text-center py-8 px-4 text-sm text-muted-foreground border border-dashed rounded-xl border-border">
                                No sections available.<br />Click + to add a section.
                            </div>
                        ) : (
                            <AnimatePresence mode="popLayout">
                                {activeSections.map((section) => (
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        key={section.id}
                                        className="p-3 bg-card rounded-xl shadow-sm border border-border relative group transition-all hover:shadow-md"
                                    >
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => { setEditSectionId(section.id); setNewSectionName(section.name); setNewSectionCapacity(section.expectedStudentCount?.toString() || ''); setIsEditSectionOpen(true); }}>
                                                        <Edit className="w-4 h-4 mr-2" />
                                                        Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => handleDeleteSection(section.id, e)}>
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>

                                        <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2 pr-8">
                                            {selectedClass?.name}
                                            {streamsEnabled && section.streamId ? <span className="text-primary/80"> &bull; {activeStreams.find(s => s.id === section.streamId)?.name || 'Stream'}</span> : ''}
                                        </div>

                                        <div className="flex justify-between items-end">
                                            <div className="font-bold text-lg text-foreground leading-none">
                                                Section {section.name}
                                            </div>
                                            <div className="text-right">
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 mb-1 block w-max ml-auto">
                                                    Cap: {section.expectedStudentCount ?? '∞'}
                                                </Badge>
                                                <div className="text-xs text-muted-foreground">
                                                    <span className="font-semibold text-foreground">{section._count?.students ?? 0}</span> Enrolled
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                    </div>
                </div>

            </div>

            {/* DIALOGS */}
            <Dialog open={isAddClassOpen} onOpenChange={setIsAddClassOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Add New Class</DialogTitle>
                        <DialogDescription>Create a class level (e.g., "11th", "B.Com 1st Year").</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Class Name</label>
                            <Input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="e.g., 11th" />
                        </div>
                        <Button onClick={handleAddClass} disabled={!newClassName.trim() || createClass.isPending} className="w-full">
                            {createClass.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Create Class
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddStreamOpen} onOpenChange={setIsAddStreamOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Add New Stream to {selectedClass?.name}</DialogTitle>
                        <DialogDescription>Create a stream for organizing sections.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Stream Name</label>
                            <Input value={newStreamName} onChange={(e) => setNewStreamName(e.target.value)} placeholder="e.g., Science" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Description (Optional)</label>
                            <Input value={newStreamDesc} onChange={(e) => setNewStreamDesc(e.target.value)} placeholder="e.g., PCM + Biology" />
                        </div>
                        <Button onClick={handleAddStream} disabled={!newStreamName.trim() || createStream.isPending} className="w-full">
                            {createStream.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Create Stream
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
                <DialogContent aria-describedby={undefined} className="max-w-md sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Add New Section</DialogTitle>
                        <DialogDescription>Add section(s) under {selectedClass?.name} {streamsEnabled && selectedStreamId ? `> Stream` : ''}.</DialogDescription>
                    </DialogHeader>

                    <Tabs value={sectionCreationMode} onValueChange={(v) => setSectionCreationMode(v as 'single' | 'bulk')} className="mt-2">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="single">Single Section</TabsTrigger>
                            <TabsTrigger value="bulk">Bulk Generate</TabsTrigger>
                        </TabsList>

                        <TabsContent value="single" className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Section Name</label>
                                <Input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="e.g., A" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Capacity (Optional)</label>
                                <Input type="number" value={newSectionCapacity} onChange={(e) => setNewSectionCapacity(e.target.value)} placeholder="40" />
                            </div>
                            <Button onClick={handleAddSection} disabled={!newSectionName.trim() || createSection.isPending} className="w-full">
                                {createSection.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                Create Section
                            </Button>
                        </TabsContent>

                        <TabsContent value="bulk" className="space-y-4 py-4">
                            {bulkPreview.length === 0 ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Number of Sections</label>
                                            <Input type="number" min="1" max="20" value={bulkSectionCount} onChange={(e) => setBulkSectionCount(e.target.value)} placeholder="3" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Base Capacity</label>
                                            <Input type="number" min="1" value={bulkBaseCapacity} onChange={(e) => setBulkBaseCapacity(e.target.value)} placeholder="40" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Naming Scheme</label>
                                        <Select value={bulkNamingScheme} onValueChange={(v: 'alphabetic' | 'numeric') => setBulkNamingScheme(v)}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select scheme" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="alphabetic">Alphabetic (A, B, C...)</SelectItem>
                                                <SelectItem value="numeric">Numeric (1, 2, 3...)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button onClick={handleGeneratePreview} className="w-full" variant="outline">
                                        Generate Preview
                                    </Button>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[120px]">Section Name</TableHead>
                                                    <TableHead className="w-[100px]">Capacity</TableHead>
                                                    <TableHead>Class Teacher</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {bulkPreview.map((section, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell className="p-2">
                                                            <Input
                                                                value={section.name}
                                                                onChange={(e) => handleNameOverride(idx, e.target.value)}
                                                                className="h-8"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="p-2">{section.capacity}</TableCell>
                                                        <TableCell className="p-2 min-w-[150px]">
                                                            <Select value={section.classTeacherId} onValueChange={(val) => handleTeacherChange(idx, val)}>
                                                                <SelectTrigger className="h-8">
                                                                    <SelectValue placeholder="Select Teacher" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">-- Unassigned --</SelectItem>
                                                                    {teachers.map((t: any) => (
                                                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={() => setBulkPreview([])} variant="outline" className="w-full">
                                            Cancel
                                        </Button>
                                        <Button onClick={handleAddSection} disabled={createBulkSections.isPending} className="w-full">
                                            {createBulkSections.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                            Save All ({bulkPreview.length})
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* EDIT DIALOGS */}
            <Dialog open={isEditClassOpen} onOpenChange={setIsEditClassOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Edit Class</DialogTitle>
                        <DialogDescription>Update the name of this class.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Class Name</label>
                            <Input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="e.g., 11th" />
                        </div>
                        <Button onClick={handleEditClassSubmit} disabled={!newClassName.trim() || updateClass.isPending} className="w-full">
                            {updateClass.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Save Changes
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditStreamOpen} onOpenChange={setIsEditStreamOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Edit Stream</DialogTitle>
                        <DialogDescription>Update the name and description for this stream.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Stream Name</label>
                            <Input value={newStreamName} onChange={(e) => setNewStreamName(e.target.value)} placeholder="e.g., Science" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Description (Optional)</label>
                            <Input value={newStreamDesc} onChange={(e) => setNewStreamDesc(e.target.value)} placeholder="e.g., PCM + Biology" />
                        </div>
                        <Button onClick={handleEditStreamSubmit} disabled={!newStreamName.trim() || updateStream.isPending} className="w-full">
                            {updateStream.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Save Changes
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditSectionOpen} onOpenChange={setIsEditSectionOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Edit Section</DialogTitle>
                        <DialogDescription>Update the name and capacity of this section.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Section Name</label>
                            <Input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="e.g., A" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Capacity (Optional)</label>
                            <Input type="number" value={newSectionCapacity} onChange={(e) => setNewSectionCapacity(e.target.value)} placeholder="40" />
                        </div>
                        <Button onClick={handleEditSectionSubmit} disabled={!newSectionName.trim() || updateSection.isPending} className="w-full">
                            {updateSection.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Save Changes
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Students Tab — Section-wise Onboarding
// ─────────────────────────────────────────────────────────────────────────────
function StudentsTab({ institutionId }: { institutionId: string }) {
    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Link to="/app/students">
                    <Button variant="outline" size="sm">
                        View All Students <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                </Link>
            </div>
            <SectionStudentOnboarding institutionId={institutionId} />
        </div>
    );
}
