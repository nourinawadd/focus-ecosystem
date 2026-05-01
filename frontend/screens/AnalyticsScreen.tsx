import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Animated } from 'react-native';
import { NavProps } from '../App';
import { colors, fontSize, spacing, radii } from '../constants/theme';
import { apiFetch } from '../api/client';

type FilterType = 'Day' | 'Week' | 'Month';
type BarItem    = { label: string; minutes: number };

type SummaryResponse = {
  period:            string;
  totalFocusMinutes: number;
  sessionsCount:     number;
  completedCount:    number;
  abandonedCount:    number;
  completionRate:    number;
  averageFocusScore: number;
  bestHour:          number | null;
  healthScore:       number;
  healthBreakdown:   { consistency: number; completion: number; volume: number };
  currentStreak:     number;
  longestStreak:     number;
  barData:           BarItem[];
};

const FILTERS: FilterType[] = ['Day', 'Week', 'Month'];
const MAX_BAR_H = 80;

function fmtHours(mins: number): string {
  if (mins === 0) return '0 min';
  if (mins < 60)  return `${mins} min`;
  return `${(mins / 60).toFixed(1)} hrs`;
}

function fmtHour(h: number | null): string {
  if (h === null) return '—';
  if (h === 0)    return '12 AM';
  if (h === 12)   return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function BarChart({ data, maxMins, progress }: {
  data: BarItem[]; maxMins: number; progress: Animated.Value;
}) {
  return (
    <View style={bc.wrap}>
      {data.map((item, i) => {
        const targetH = maxMins > 0 ? (item.minutes / maxMins) * MAX_BAR_H : 0;
        const animH   = progress.interpolate({ inputRange: [0, 1], outputRange: [0, targetH] });
        return (
          <View key={i} style={bc.col}>
            <View style={bc.track}>
              <Animated.View style={[bc.bar, { height: animH }]} />
            </View>
            <Text style={bc.lbl}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function AnalyticsScreen({ nav }: { nav: NavProps }) {
  const initial = nav.user.name.charAt(0).toUpperCase();

  const [filter,  setFilter]  = useState<FilterType>('Week');
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!nav.token) return;
    setSummary(null);
    apiFetch<SummaryResponse>(`/analytics/summary?period=${filter.toLowerCase()}`, nav.token)
      .then(data => {
        setSummary(data);
        progressAnim.setValue(0);
        Animated.spring(progressAnim, {
          toValue: 1, friction: 6, tension: 55, useNativeDriver: false,
        }).start();
      })
      .catch(console.error);
  }, [filter, nav.token]);

  const barData    = summary?.barData ?? [];
  const maxMins    = Math.max(...barData.map(b => b.minutes), 1);
  const hasData    = (summary?.sessionsCount ?? 0) > 0;
  const focusMins  = summary?.totalFocusMinutes ?? 0;
  const compRate   = summary?.completionRate    ?? 0;
  const bestTime   = fmtHour(summary?.bestHour ?? null);
  const health     = summary?.healthScore       ?? 0;
  const breakdown  = summary?.healthBreakdown   ?? { consistency: 0, completion: 0, volume: 0 };

  const periodLabel = filter === 'Day' ? 'today' : filter === 'Week' ? 'this week' : 'this month';
  const chartTitle  = filter === 'Day' ? 'Daily'  : filter === 'Week' ? 'Weekly'    : 'Monthly';

  return (
    <View style={s.screen}>

      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={nav.openDrawer} activeOpacity={0.7}>
          <View style={s.menuLine} />
          <View style={s.menuLine} />
          <View style={s.menuLine} />
        </TouchableOpacity>
        <Text style={s.title}>Analytics</Text>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initial}</Text>
        </View>
      </View>

      <View style={s.filterWrap}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterBtn, filter === f && s.filterBtnOn]}
            onPress={() => setFilter(f)}
            activeOpacity={0.75}
          >
            <Text style={[s.filterTxt, filter === f && s.filterTxtOn]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

        {/* Focus card + bar chart */}
        <View style={s.card}>
          <View style={s.cardTop}>
            <View>
              <Text style={s.cardLabel}>{chartTitle} Focus</Text>
              {hasData
                ? <Text style={s.bigNum}>{fmtHours(focusMins)}</Text>
                : <Text style={s.emptyVal}>{summary === null ? 'Loading…' : 'No sessions yet'}</Text>}
              <Text style={s.sub}>{periodLabel}</Text>
            </View>
            {hasData && (
              <View style={s.totalBadge}>
                <Text style={s.totalBadgeTxt}>{summary!.sessionsCount} sessions</Text>
              </View>
            )}
          </View>
          <BarChart data={barData} maxMins={maxMins} progress={progressAnim} />
        </View>

        {/* Stat pair */}
        <View style={s.row}>

          <View style={[s.card, s.half]}>
            <Text style={s.cardLabel}>Completion</Text>
            {hasData ? (
              <Text style={s.bigNum}>{compRate}%</Text>
            ) : (
              <>
                <Text style={s.emptyVal}>—</Text>
                <Text style={s.sub}>no data</Text>
              </>
            )}
          </View>

          <View style={[s.card, s.half]}>
            <Text style={s.cardLabel}>Best Time</Text>
            <Text style={[s.bigNum, bestTime === '—' && { color: colors.mutedLight }]}>{bestTime}</Text>
            <Text style={s.sub}>
              {bestTime === '—' ? 'complete sessions' : 'most productive'}
            </Text>
          </View>

        </View>

        {/* Focus Health */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Focus Health</Text>
          {hasData ? (
            <>
              <View style={s.healthRow}>
                <Text style={s.healthNum}>{health}</Text>
                <Text style={s.healthMax}>/100</Text>
              </View>
              <View style={s.track}>
                <Animated.View
                  style={[s.fill, {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', `${health}%`],
                    }),
                  }]}
                />
              </View>
              <View style={s.breakRow}>
                <Text style={s.breakItem}>Consistency · {breakdown.consistency}/40</Text>
                <Text style={s.breakItem}>Completion · {breakdown.completion}/30</Text>
                <Text style={s.breakItem}>Volume · {breakdown.volume}/30</Text>
              </View>
            </>
          ) : (
            <Text style={s.emptyMsg}>Complete sessions to build your health score</Text>
          )}
        </View>

        <View style={{ height: 44 }} />
      </ScrollView>
    </View>
  );
}

const bc = StyleSheet.create({
  wrap:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: MAX_BAR_H + 28, marginTop: spacing.lg },
  col:   { alignItems: 'center', flex: 1 },
  track: { width: 18, height: MAX_BAR_H, justifyContent: 'flex-end', backgroundColor: colors.border, borderRadius: 6, overflow: 'hidden' },
  bar:   { width: 18, backgroundColor: colors.ink, borderRadius: 6 },
  lbl:   { fontSize: 10, color: colors.muted, marginTop: 6, fontWeight: '600' },
});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: spacing.sm,
  },
  menuBtn:    { width: 40, height: 40, justifyContent: 'center' },
  menuLine:   { width: 22, height: 2.5, backgroundColor: colors.ink, borderRadius: 2, marginBottom: 5 },
  title:      { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  avatar:     { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },

  filterWrap: {
    flexDirection: 'row', marginHorizontal: spacing.xl, marginBottom: spacing.md,
    backgroundColor: colors.border, borderRadius: radii.full, padding: 3,
  },
  filterBtn:    { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radii.full },
  filterBtnOn:  { backgroundColor: colors.ink },
  filterTxt:    { fontSize: fontSize.sm, fontWeight: '600', color: colors.muted },
  filterTxtOn:  { color: colors.white },

  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs },

  card: {
    backgroundColor: colors.card, borderRadius: radii.xl,
    padding: spacing.xl, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel:  { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.xs },
  bigNum:     { fontSize: 30, fontWeight: '800', color: colors.ink, marginBottom: 2 },
  emptyVal:   { fontSize: fontSize.lg, color: colors.mutedLight, fontWeight: '600', marginBottom: 2 },
  emptyMsg:   { fontSize: fontSize.sm, color: colors.mutedLight, marginTop: spacing.sm, lineHeight: 20 },
  sub:        { fontSize: fontSize.xs, color: colors.muted },

  totalBadge:    { backgroundColor: colors.border, borderRadius: radii.full, paddingVertical: 5, paddingHorizontal: spacing.md },
  totalBadgeTxt: { fontSize: fontSize.xs, fontWeight: '600', color: colors.inkSoft },

  row:  { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1, marginBottom: spacing.md },

  healthRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.md },
  healthNum: { fontSize: 48, fontWeight: '800', color: colors.ink, lineHeight: 52 },
  healthMax: { fontSize: fontSize.xl, color: colors.muted, paddingBottom: 7, marginLeft: 4 },
  track:     { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginBottom: spacing.lg },
  fill:      { height: 8, backgroundColor: colors.ink, borderRadius: 4 },

  breakRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  breakItem: { fontSize: fontSize.xs, color: colors.muted, fontWeight: '500' },
});
