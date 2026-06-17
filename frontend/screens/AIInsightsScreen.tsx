// frontend/screens/AIInsightsScreen.tsx
// Personalized productivity insights from /api/ai/insights, styled to match
// the Dashboard (ink-on-light, dark hero card, yellow accent).
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import PillBadge from '../components/PillBadge';
import { NavProps } from '../App';
import { apiFetch } from '../api/client';
import { colors, spacing, radii, fontSize } from '../constants/theme';

type Insight = {
  bestProductiveHour: number;
  optimalDuration: number;
  suggestedSchedule: Array<{
    day: string;
    startHour: number;
    durationMinutes: number;
    confidence: number;
    categoryName: string;
  }>;
  distractionRisk: {
    score: number;
    level: 'low' | 'medium' | 'high';
    factors: string[];
  };
  insightText: string;
  generatedAt: string;
};

type InsightResponse = {
  insight: Insight | null;
  cached?: boolean;
  stale?: boolean;
  needsMoreData?: boolean;
  sessionCount?: number;
  sessionsNeeded?: number;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatHour = (h: number) => {
  const hour = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour}:00 ${ampm}`;
};

// Raw model confidence (0-1) reads better as a word than as "83%".
const confidenceWord = (c: number) => (c >= 0.75 ? 'High' : c >= 0.45 ? 'Medium' : 'Low');

const riskMeta = (level: string) => {
  const l = level.toLowerCase();
  if (l === 'low')    return { color: colors.success, label: 'LOW RISK' };
  if (l === 'medium') return { color: colors.amber,   label: 'MEDIUM RISK' };
  return { color: colors.danger, label: 'HIGH RISK' };
};

const sentenceCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "Updated just now / 25m ago / 4h ago / Jun 9".
const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function AIInsightsScreen({ nav }: { nav: NavProps }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsMoreData, setNeedsMoreData] = useState(false);
  const [stale, setStale] = useState(false);
  const [sessionProgress, setSessionProgress] = useState<{ count: number; needed: number } | null>(null);

  const name    = nav.user.name !== 'User' ? nav.user.name : (nav.params.name ?? 'User');
  const initial = name.charAt(0).toUpperCase();

  const fetchInsight = useCallback(async () => {
    if (!nav.token) return;
    setError(null);
    setNeedsMoreData(false);
    try {
      const res = await apiFetch<InsightResponse | null>('/ai/insights', nav.token);
      // A 204 (not enough data, no prior insight) comes back as an empty {} from
      // apiFetch, not null — so guard on the payload, not just the response.
      if (!res || !res.insight) {
        setNeedsMoreData(true);
        setSessionProgress(
          res?.sessionCount != null ? { count: res.sessionCount, needed: res.sessionsNeeded ?? 3 } : null,
        );
        setInsight(null);
      } else {
        setInsight(res.insight);
        setStale(Boolean(res.stale));
      }
    } catch (e: any) {
      if (e?.status === 401) {
        nav.signOut();
        return;
      }
      if (e?.status === 503) {
        setError('AI insights are not available right now.');
      } else if (e?.status === 502) {
        setError('The AI returned an unexpected response. Try regenerating.');
      } else {
        setError(e?.message || 'Failed to load insights');
      }
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
      const res = await apiFetch<InsightResponse>('/ai/insights/generate', nav.token, {
        method: 'POST',
      });
      setInsight(res.insight);
      setStale(false);
      setNeedsMoreData(false);
    } catch (e: any) {
      if (e?.status === 401) {
        nav.signOut();
        return;
      }
      if (e?.status === 400) {
        setNeedsMoreData(true);
        setSessionProgress(
          e?.sessionCount != null ? { count: e.sessionCount, needed: e.sessionsNeeded ?? 3 } : null,
        );
      } else if (e?.status === 503) {
        setError('AI insights are not available right now.');
      } else {
        setError(e?.message || 'Failed to regenerate');
      }
    } finally {
      setGenerating(false);
    }
  }, [nav, generating]);

  useEffect(() => {
    fetchInsight();
  }, [fetchInsight]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInsight();
  }, [fetchInsight]);

  // Schedule, cleaned for display: valid days only, ordered starting from
  // today (so the next relevant slot is on top), capped at 5.
  const todayIdx = new Date().getDay();
  const schedule = (insight?.suggestedSchedule ?? [])
    .filter(s => DAYS.includes(s.day))
    .sort((a, b) => ((DAYS.indexOf(a.day) - todayIdx + 7) % 7) - ((DAYS.indexOf(b.day) - todayIdx + 7) % 7))
    .slice(0, 5);

  const risk = insight ? riskMeta(insight.distractionRisk.level) : null;

  // ── Header (mirrors History / Create Session: back-arrow drawer + centered title) ──
  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={nav.openDrawer} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={24} color={colors.ink} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>AI Insights</Text>
      <TouchableOpacity style={styles.avatar} onPress={() => nav.navigate('Profile')}>
        <Text style={styles.avatarText}>{initial}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={[styles.center, styles.loadingFill]}>
          <ActivityIndicator size="large" color={colors.ink} />
          <Text style={styles.loadingText}>Analyzing your sessions…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
      >
      {/* ── Empty state — not enough data ──────────────────────────────────── */}
      {needsMoreData && (
        <Card style={styles.centerCard} padding={spacing.xxl}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="sparkles-outline" size={26} color={colors.white} />
          </View>
          <Text style={styles.emptyTitle}>Not enough data yet</Text>
          <Text style={styles.emptyText}>
            {sessionProgress
              ? `You've completed ${sessionProgress.count} of ${sessionProgress.needed} sessions needed. Finish a few more and you'll get personalized insights about your productivity patterns.`
              : "Complete at least 3 focus sessions and you'll get personalized insights about your productivity patterns."}
          </Text>
          <TouchableOpacity style={styles.inkBtn} onPress={() => nav.navigate('CreateSession')}>
            <Text style={styles.inkBtnText}>Start a session</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* ── Error state ────────────────────────────────────────────────────── */}
      {error && !needsMoreData && (
        <Card style={styles.centerCard} padding={spacing.xxl}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.muted} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={fetchInsight}>
            <Text style={styles.outlineBtnText}>Try again</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* ── Insight content ────────────────────────────────────────────────── */}
      {insight && !needsMoreData && (
        <>
          {stale && (
            <View style={styles.staleBanner}>
              <Ionicons name="time-outline" size={15} color={colors.amber} />
              <Text style={styles.staleText}>
                Based on older data — complete more sessions for a fresh analysis.
              </Text>
            </View>
          )}

          {/* Hero insight (dark, like the Dashboard score card) */}
          <Card dark style={styles.mb14} padding={22}>
            <View style={styles.heroHeader}>
              <Ionicons name="sparkles" size={13} color={colors.yellow} />
              <SectionLabel noTopMargin style={styles.heroLabel}>Your AI Insight</SectionLabel>
            </View>
            <Text style={styles.heroText}>{insight.insightText}</Text>
          </Card>

          {/* Key numbers */}
          <View style={styles.statsRow}>
            <Card style={styles.statCard} padding={spacing.lg}>
              <Text style={styles.statValue}>{formatHour(insight.bestProductiveHour)}</Text>
              <Text style={styles.statLabel}>Peak hour</Text>
            </Card>
            <Card style={styles.statCard} padding={spacing.lg}>
              <Text style={styles.statValue}>{insight.optimalDuration} min</Text>
              <Text style={styles.statLabel}>Best session length</Text>
            </Card>
          </View>

          {/* Distraction risk */}
          <SectionLabel>Distraction risk</SectionLabel>
          <Card style={styles.mb14} padding={18}>
            <View style={styles.riskHeader}>
              <PillBadge label={risk!.label} bg={colors.ink} color={colors.white} dot dotColor={risk!.color} caps />
              <Text style={styles.riskScore}>
                {insight.distractionRisk.score}
                <Text style={styles.riskScoreMax}> /100</Text>
              </Text>
            </View>
            <View style={styles.riskTrack}>
              <View
                style={[
                  styles.riskFill,
                  { width: `${Math.min(100, Math.max(0, insight.distractionRisk.score))}%` as any,
                    backgroundColor: risk!.color },
                ]}
              />
            </View>
            {insight.distractionRisk.factors.length > 0 && (
              <View style={styles.factorList}>
                {insight.distractionRisk.factors.map((f, i) => (
                  <View key={i} style={styles.factorRow}>
                    <View style={styles.factorDot} />
                    <Text style={styles.factorText}>{sentenceCase(f)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Suggested schedule */}
          {schedule.length > 0 && (
            <>
              <SectionLabel>Suggested schedule</SectionLabel>
              {schedule.map((slot, i) => {
                const isToday = DAYS.indexOf(slot.day) === todayIdx;
                return (
                  <Card key={i} style={styles.scheduleCard} padding={spacing.lg}>
                    <View style={[styles.dayBadge, isToday && styles.dayBadgeToday]}>
                      <Text style={[styles.dayBadgeText, isToday && styles.dayBadgeTextToday]}>
                        {slot.day.slice(0, 3).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.scheduleInfo}>
                      <Text style={styles.scheduleDay}>{isToday ? 'Today' : slot.day}</Text>
                      <Text style={styles.scheduleTime}>
                        {slot.categoryName ? `${slot.categoryName} · ` : ''}{formatHour(slot.startHour)} · {slot.durationMinutes} min
                      </Text>
                    </View>
                    <Text style={styles.confidenceText}>
                      {confidenceWord(slot.confidence).toUpperCase()}
                    </Text>
                  </Card>
                );
              })}
              <Text style={styles.confidenceHint}>
                Confidence reflects how strongly your past sessions support each slot.
              </Text>
            </>
          )}

          {/* Regenerate */}
          <TouchableOpacity
            style={[styles.inkBtn, styles.regenerateBtn, generating && styles.btnDisabled]}
            onPress={regenerate}
            disabled={generating}
            activeOpacity={0.8}
          >
            {generating ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="refresh" size={17} color={colors.white} />
                <Text style={styles.inkBtnText}>Regenerate insights</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.timestamp}>Updated {timeAgo(insight.generatedAt)}</Text>
        </>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 52 },
  center:    { justifyContent: 'center', alignItems: 'center' },
  loadingFill: { flex: 1 },
  loadingText: { marginTop: spacing.sm, color: colors.muted, fontSize: fontSize.sm },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: spacing.sm, backgroundColor: colors.bg,
  },
  backBtn:     { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  avatar:      { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { color: colors.white, fontWeight: '700', fontSize: fontSize.md },

  mb14: { marginBottom: 14 },

  // Empty / error
  centerCard:      { alignItems: 'center', marginBottom: 14 },
  emptyIconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.ink,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  emptyText:  { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  errorText:  { fontSize: fontSize.sm, color: colors.inkSoft, textAlign: 'center', lineHeight: 20, marginVertical: spacing.lg },

  // Stale banner (matches the amber note style used elsewhere)
  staleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#C3CAD4', borderRadius: radii.md,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, marginBottom: 14,
  },
  staleText: { flex: 1, fontSize: fontSize.xs, color: '#2F2F2F', lineHeight: 16 },

  // Hero
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  heroLabel:  { color: colors.mutedLight, marginBottom: 0 },
  heroText:   { color: colors.white, fontSize: fontSize.md + 1, lineHeight: 24 },

  // Key numbers
  statsRow:  { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard:  { flex: 1 },
  statValue: { fontSize: 22, fontWeight: 'bold', color: colors.ink, marginBottom: 2 },
  statLabel: { fontSize: fontSize.xs, color: colors.muted },

  // Distraction risk
  riskHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  riskScore:    { fontSize: fontSize.xxl, fontWeight: 'bold', color: colors.ink },
  riskScoreMax: { fontSize: fontSize.sm, color: colors.muted, fontWeight: 'normal' },
  riskTrack:    { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  riskFill:     { height: 6, borderRadius: 3 },
  factorList:   { marginTop: spacing.lg, gap: spacing.sm },
  factorRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  factorDot:    { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.mutedLight },
  factorText:   { flex: 1, fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: 19 },

  // Schedule
  scheduleCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md + 2, marginBottom: spacing.sm + 2 },
  dayBadge: {
    width: 46, height: 46, borderRadius: radii.md, backgroundColor: colors.ink,
    justifyContent: 'center', alignItems: 'center',
  },
  dayBadgeToday:     { backgroundColor: colors.yellow },
  dayBadgeText:      { color: colors.white, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  dayBadgeTextToday: { color: colors.ink },
  scheduleInfo: { flex: 1 },
  scheduleDay:  { fontSize: fontSize.md, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  scheduleTime: { fontSize: fontSize.sm, color: colors.muted },
  confidenceText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, letterSpacing: 0.8 },
  confidenceHint: { fontSize: fontSize.xs, color: colors.mutedLight, marginTop: 2, marginBottom: spacing.sm },

  // Buttons
  inkBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.ink, borderRadius: radii.md, paddingVertical: 16, paddingHorizontal: spacing.xxl,
  },
  inkBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  regenerateBtn: { marginTop: spacing.lg },
  outlineBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xxl,
  },
  outlineBtnText: { color: colors.ink, fontWeight: '600', fontSize: fontSize.sm },
  btnDisabled:    { opacity: 0.6 },

  timestamp: { fontSize: fontSize.xs, color: colors.mutedLight, textAlign: 'center', marginTop: spacing.md },
});
