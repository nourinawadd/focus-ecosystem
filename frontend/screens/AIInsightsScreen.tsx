// frontend/screens/AIInsightsScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    ActivityIndicator, RefreshControl, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import { NavProps } from '../App';
import { apiFetch } from '../api/client';
import { colors, spacing, radii, fontSize } from '../constants/theme';

type ScheduleSlot = {
    day: string;
    startHour: number;
    durationMinutes: number;
    confidence: number;
    task?: string;
};

type Insight = {
    bestProductiveHour: number;
    optimalDuration: number;
    suggestedSchedule: ScheduleSlot[];
    distractionRisk: {
        score: number;
        level: 'low' | 'medium' | 'high';
        factors: string[];
    };
    insightText: string;
    generatedAt: string;
};

type InsightResponse = {
    insight: Insight;
    cached: boolean;
    stale?: boolean;
};

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const formatHour = (h: number) => {
    const hour = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${hour}:00 ${ampm}`;
};

const dayShort = (day: string) => day.slice(0, 3).toUpperCase();

const riskColor = (level: string) => {
    const l = level.toLowerCase();
    if (l === 'low') return '#10b981';
    if (l === 'medium') return '#f59e0b';
    return '#ef4444';
};

const taskColor = (task: string | undefined) => {
    if (!task) return colors.ink;
    const colors_list = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#0ea5e9', '#f97316'];
    let hash = 0;
    for (let i = 0; i < task.length; i++) hash = task.charCodeAt(i) + ((hash << 5) - hash);
    return colors_list[Math.abs(hash) % colors_list.length];
};

// ── Weekly Calendar Component ─────────────────────────────────────────────────
function WeeklyCalendar({ schedule }: { schedule: ScheduleSlot[] }) {
    // Group slots by day
    const byDay: Record<string, ScheduleSlot[]> = {};
    for (const day of DAYS_ORDER) byDay[day] = [];
    for (const slot of schedule) {
        if (slot.day && byDay[slot.day]) byDay[slot.day].push(slot);
    }

    return (
        <View style={cal.container}>
            {DAYS_ORDER.map(day => {
                const slots = byDay[day];
                const hasSlots = slots.length > 0;
                return (
                    <View key={day} style={cal.dayRow}>
                        {/* Day label */}
                        <View style={cal.dayLabelWrap}>
                            <Text style={[cal.dayLabel, hasSlots && cal.dayLabelActive]}>
                                {dayShort(day)}
                            </Text>
                        </View>

                        {/* Slots or empty */}
                        <View style={cal.slotsWrap}>
                            {hasSlots ? (
                                slots.map((slot, i) => {
                                    const color = taskColor(slot.task);
                                    return (
                                        <View key={i} style={[cal.slotCard, { borderLeftColor: color }]}>
                                            <View style={cal.slotTop}>
                                                <Text style={[cal.slotTask, { color }]}>
                                                    {slot.task || 'Focus Session'}
                                                </Text>
                                                <Text style={cal.slotConfidence}>
                                                    {Math.round(slot.confidence * 100)}%
                                                </Text>
                                            </View>
                                            <Text style={cal.slotTime}>
                                                {formatHour(slot.startHour)} · {slot.durationMinutes} min
                                            </Text>
                                            {/* Confidence bar */}
                                            <View style={cal.confBar}>
                                                <View style={[cal.confFill, {
                                                    width: `${Math.round(slot.confidence * 100)}%`,
                                                    backgroundColor: color,
                                                }]} />
                                            </View>
                                        </View>
                                    );
                                })
                            ) : (
                                <View style={cal.emptyDay}>
                                    <Text style={cal.emptyDayText}>Rest day</Text>
                                </View>
                            )}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AIInsightsScreen({ nav }: { nav: NavProps }) {
    const [insight, setInsight] = useState<Insight | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [needsMoreData, setNeedsMoreData] = useState(false);
    const [stale, setStale] = useState(false);

    const fetchInsight = useCallback(async () => {
        if (!nav.token) return;
        setError(null);
        setNeedsMoreData(false);
        try {
            const res = await apiFetch<InsightResponse | null>('/ai/insights', nav.token);
            if (!res || !res.insight) {
                setNeedsMoreData(true);
                setInsight(null);
            } else {
                setInsight(res.insight);
                setStale(Boolean(res.stale));
            }
        } catch (e: any) {
            if (e?.status === 401) { nav.signOut(); return; }
            if (e?.status === 503) setError('AI service is not configured yet. Please add your Gemini API key.');
            else if (e?.status === 502) setError('AI returned an unexpected response. Try regenerating.');
            else setError(e?.message || 'Failed to load insights');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [nav]);

    const regenerate = useCallback(async () => {
        if (!nav.token || generating) return;
        setGenerating(true);
        setError(null);
        try {
            const res = await apiFetch<InsightResponse>('/ai/insights/generate', nav.token, { method: 'POST' });
            setInsight(res.insight);
            setStale(false);
            setNeedsMoreData(false);
        } catch (e: any) {
            if (e?.status === 401) { nav.signOut(); return; }
            if (e?.status === 400) setNeedsMoreData(true);
            else if (e?.status === 503) setError('AI service is not configured yet.');
            else setError(e?.message || 'Failed to regenerate');
        } finally {
            setGenerating(false);
        }
    }, [nav, generating]);

    useEffect(() => { fetchInsight(); }, [fetchInsight]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchInsight(); }, [fetchInsight]);

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={colors.ink} />
                <Text style={styles.loadingText}>Loading your insights…</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => nav.openDrawer()} style={styles.menuBtn}>
                    <Ionicons name="menu" size={26} color={colors.ink} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>AI Insights</Text>
                <View style={{ width: 26 }} />
            </View>

            {/* Not enough data */}
            {needsMoreData && (
                <Card style={styles.emptyCard}>
                    <Ionicons name="bulb-outline" size={48} color={colors.ink} />
                    <Text style={styles.emptyTitle}>Not enough data yet</Text>
                    <Text style={styles.emptyText}>
                        Complete at least 3 focus sessions and I'll give you personalized insights about your productivity patterns.
                    </Text>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => nav.navigate('CreateSession')}>
                        <Text style={styles.primaryBtnText}>Start a session</Text>
                    </TouchableOpacity>
                </Card>
            )}

            {/* Error state */}
            {error && !needsMoreData && (
                <Card style={styles.errorCard}>
                    <Ionicons name="alert-circle-outline" size={32} color="#ef4444" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={fetchInsight}>
                        <Text style={styles.secondaryBtnText}>Try again</Text>
                    </TouchableOpacity>
                </Card>
            )}

            {/* Main content */}
            {insight && !needsMoreData && (
                <>
                    {stale && (
                        <View style={styles.staleBanner}>
                            <Ionicons name="time-outline" size={16} color="#f59e0b" />
                            <Text style={styles.staleText}>
                                This insight is from older data. Add more sessions for a fresh analysis.
                            </Text>
                        </View>
                    )}

                    {/* Hero insight card */}
                    <View style={styles.heroCard}>
                        <View style={styles.heroHeader}>
                            <Ionicons name="sparkles" size={20} color="#fff" />
                            <Text style={styles.heroLabel}>Your AI Insight</Text>
                        </View>
                        <Text style={styles.heroText}>{insight.insightText}</Text>
                    </View>

                    {/* Stats row */}
                    <View style={styles.statsRow}>
                        <Card style={styles.statCard}>
                            <Ionicons name="time-outline" size={22} color={colors.ink} />
                            <Text style={styles.statValue}>{formatHour(insight.bestProductiveHour)}</Text>
                            <Text style={styles.statLabel}>Peak hour</Text>
                        </Card>
                        <Card style={styles.statCard}>
                            <Ionicons name="hourglass-outline" size={22} color={colors.ink} />
                            <Text style={styles.statValue}>{insight.optimalDuration} min</Text>
                            <Text style={styles.statLabel}>Optimal length</Text>
                        </Card>
                    </View>

                    {/* Distraction risk */}
                    <SectionLabel>Distraction risk</SectionLabel>
                    <Card style={styles.riskCard}>
                        <View style={styles.riskHeader}>
                            <View style={[styles.riskBadge, { backgroundColor: riskColor(insight.distractionRisk.level) }]}>
                                <Text style={styles.riskBadgeText}>{insight.distractionRisk.level.toUpperCase()}</Text>
                            </View>
                            <Text style={styles.riskScore}>{insight.distractionRisk.score}/100</Text>
                        </View>
                        {insight.distractionRisk.factors.length > 0 && (
                            <View style={styles.factorList}>
                                {insight.distractionRisk.factors.map((f, i) => (
                                    <View key={i} style={styles.factorRow}>
                                        <Ionicons name="ellipse" size={6} color={colors.muted} />
                                        <Text style={styles.factorText}>{f}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </Card>

                    {/* Weekly Schedule */}
                    <SectionLabel>Weekly Study Schedule</SectionLabel>
                    <Text style={styles.scheduleHint}>
                        Based on your peak study hours and task priorities
                    </Text>

                    {insight.suggestedSchedule.length === 0 ? (
                        <Card style={styles.noScheduleCard}>
                            <Text style={styles.noScheduleText}>
                                Add tasks in Settings to get a personalized weekly schedule
                            </Text>
                            <TouchableOpacity style={styles.primaryBtn} onPress={() => nav.navigate('Settings')}>
                                <Text style={styles.primaryBtnText}>Go to Settings</Text>
                            </TouchableOpacity>
                        </Card>
                    ) : (
                        <Card style={styles.calendarCard}>
                            <WeeklyCalendar schedule={insight.suggestedSchedule} />
                        </Card>
                    )}

                    {/* Regenerate */}
                    <TouchableOpacity
                        style={[styles.regenerateBtn, generating && styles.btnDisabled]}
                        onPress={regenerate}
                        disabled={generating}
                    >
                        {generating ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="refresh" size={18} color="#fff" />
                                <Text style={styles.regenerateBtnText}>Regenerate insights</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <Text style={styles.timestamp}>
                        Generated {new Date(insight.generatedAt).toLocaleString()}
                    </Text>
                </>
            )}
        </ScrollView>
    );
}

// ── Calendar styles ───────────────────────────────────────────────────────────
const cal = StyleSheet.create({
    container: { gap: spacing.sm },
    dayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    dayLabelWrap: { width: 36, paddingTop: spacing.sm + 2 },
    dayLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.mutedLight, letterSpacing: 0.5 },
    dayLabelActive: { color: colors.ink },
    slotsWrap: { flex: 1, gap: spacing.xs },
    slotCard: {
        backgroundColor: colors.bg,
        borderRadius: radii.md,
        padding: spacing.sm + 2,
        borderLeftWidth: 3,
    },
    slotTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    slotTask: { fontSize: fontSize.sm, fontWeight: '700', flex: 1 },
    slotConfidence: { fontSize: fontSize.xs, color: colors.muted, fontWeight: '600' },
    slotTime: { fontSize: fontSize.xs, color: colors.muted, marginBottom: spacing.xs },
    confBar: { height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
    confFill: { height: '100%', borderRadius: 2 },
    emptyDay: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm + 2 },
    emptyDayText: { fontSize: fontSize.xs, color: colors.mutedLight, fontStyle: 'italic' },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.md, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: spacing.xl * 2 },
    center: { justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: spacing.sm, color: colors.muted, fontSize: fontSize.sm },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
    menuBtn: { padding: spacing.xs },
    headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },

    emptyCard: { alignItems: 'center', padding: spacing.lg },
    emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, marginTop: spacing.md, marginBottom: spacing.xs },
    emptyText: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 20 },

    errorCard: { alignItems: 'center', padding: spacing.lg },
    errorText: { fontSize: fontSize.sm, color: colors.ink, textAlign: 'center', marginVertical: spacing.md },

    staleBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', padding: spacing.sm, borderRadius: radii.md, marginBottom: spacing.md, gap: spacing.xs },
    staleText: { flex: 1, fontSize: fontSize.xs, color: '#92400e' },

    heroCard: { backgroundColor: '#1f2937', borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md },
    heroHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
    heroLabel: { color: '#fff', fontSize: fontSize.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
    heroText: { color: '#fff', fontSize: fontSize.md, lineHeight: 22 },

    statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    statCard: { flex: 1, alignItems: 'center', padding: spacing.md },
    statValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, marginTop: spacing.xs },
    statLabel: { fontSize: fontSize.xs, color: colors.muted },

    riskCard: { padding: spacing.md },
    riskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
    riskBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.sm },
    riskBadgeText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '700' },
    riskScore: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
    factorList: { gap: spacing.xs },
    factorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    factorText: { flex: 1, fontSize: fontSize.sm, color: colors.muted },

    scheduleHint: { fontSize: fontSize.xs, color: colors.muted, marginBottom: spacing.sm, marginTop: -spacing.xs },
    calendarCard: { padding: spacing.md, marginBottom: spacing.md },
    noScheduleCard: { alignItems: 'center', padding: spacing.lg, marginBottom: spacing.md },
    noScheduleText: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', marginBottom: spacing.md, lineHeight: 20 },

    regenerateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, padding: spacing.md, borderRadius: radii.md, marginTop: spacing.lg, gap: spacing.xs },
    regenerateBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },

    primaryBtn: { backgroundColor: colors.ink, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.md },
    primaryBtnText: { color: '#fff', fontWeight: '600' },
    secondaryBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
    secondaryBtnText: { color: colors.ink, fontWeight: '600' },
    btnDisabled: { opacity: 0.6 },
    timestamp: { fontSize: fontSize.xs, color: colors.muted, textAlign: 'center', marginTop: spacing.md },
});