import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
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
  insight: Insight;
  cached: boolean;
  stale?: boolean;
};

const formatHour = (h: number) => {
  const hour = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour}:00 ${ampm}`;
};

const dayShort = (day: string) => day.slice(0, 3).toUpperCase();

const riskColor = (level: string) => {
  if (level === 'low') return '#10b981';
  if (level === 'medium') return '#f59e0b';
  return '#ef4444';
};

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
      if (!res) {
        setNeedsMoreData(true);
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
        setError('AI service is not configured yet. Please add your Gemini API key.');
      } else if (e?.status === 502) {
        setError('AI returned an unexpected response. Try regenerating.');
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
      } else if (e?.status === 503) {
        setError('AI service is not configured yet.');
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

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
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
          <Ionicons name="menu" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Insights</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Empty state — not enough data */}
      {needsMoreData && (
        <Card style={styles.emptyCard}>
          <Ionicons name="bulb-outline" size={48} color={colors.primary} />
          <Text style={styles.emptyTitle}>Not enough data yet</Text>
          <Text style={styles.emptyText}>
            Complete at least 3 focus sessions and I'll give you personalized insights about
            your productivity patterns.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => nav.navigate('CreateSession')}
          >
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
              <Ionicons name="time-outline" size={22} color={colors.primary} />
              <Text style={styles.statValue}>{formatHour(insight.bestProductiveHour)}</Text>
              <Text style={styles.statLabel}>Peak hour</Text>
            </Card>
            <Card style={styles.statCard}>
              <Ionicons name="hourglass-outline" size={22} color={colors.primary} />
              <Text style={styles.statValue}>{insight.optimalDuration} min</Text>
              <Text style={styles.statLabel}>Optimal length</Text>
            </Card>
          </View>

          {/* Distraction risk */}
          <SectionLabel>Distraction risk</SectionLabel>
          <Card style={styles.riskCard}>
            <View style={styles.riskHeader}>
              <View
                style={[
                  styles.riskBadge,
                  { backgroundColor: riskColor(insight.distractionRisk.level) },
                ]}
              >
                <Text style={styles.riskBadgeText}>
                  {insight.distractionRisk.level.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.riskScore}>{insight.distractionRisk.score}/100</Text>
            </View>
            {insight.distractionRisk.factors.length > 0 && (
              <View style={styles.factorList}>
                {insight.distractionRisk.factors.map((f, i) => (
                  <View key={i} style={styles.factorRow}>
                    <Ionicons name="ellipse" size={6} color={colors.textSecondary} />
                    <Text style={styles.factorText}>{f}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Suggested schedule */}
          <SectionLabel>Suggested schedule</SectionLabel>
          {insight.suggestedSchedule.map((slot, i) => (
            <Card key={i} style={styles.scheduleCard}>
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>{dayShort(slot.day)}</Text>
              </View>
              <View style={styles.scheduleInfo}>
                <Text style={styles.scheduleTime}>
                  {formatHour(slot.startHour)} · {slot.durationMinutes} min
                </Text>
                <View style={styles.confidenceBar}>
                  <View
                    style={[
                      styles.confidenceFill,
                      { width: `${Math.round(slot.confidence * 100)}%` },
                    ]}
                  />
                </View>
              </View>
              <Text style={styles.confidenceText}>
                {Math.round(slot.confidence * 100)}%
              </Text>
            </Card>
          ))}

          {/* Regenerate button */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  menuBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  errorCard: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  staleText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: '#92400e',
  },
  heroCard: {
    backgroundColor: '#1f2937',
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  heroLabel: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroText: {
    color: '#fff',
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  riskCard: {
    padding: spacing.md,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  riskBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  riskBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  riskScore: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  factorList: {
    gap: spacing.xs,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  factorText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.md,
  },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleTime: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  confidenceBar: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  confidenceText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  regenerateBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  timestamp: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});