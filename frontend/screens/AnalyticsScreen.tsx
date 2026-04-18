import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Animated } from 'react-native';
import { NavProps, SessionRecord, UserProfile } from '../App';
import { daysAgo } from '../store/sessions';
import { colors, fontSize, spacing, radii } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────
type FilterType = 'Day' | 'Week' | 'Month';
type BarItem    = { label: string; minutes: number };

const FILTERS: FilterType[] = ['Day', 'Week', 'Month'];
const MAX_BAR_H = 80; // px — track height for chart bars

// ─── Period helpers ───────────────────────────────────────────────────────────
/** YYYY-MM-DD string comparison works for date ordering — no UTC shift issues */
function filterByPeriod(
  sessions: SessionRecord[],
  filter: FilterType,
  offset: 0 | 1 = 0,
): SessionRecord[] {
  const days    = filter === 'Day' ? 1 : filter === 'Week' ? 7 : 30;
  const endStr   = daysAgo(days * offset);
  const startStr = daysAgo(days * (offset + 1) - 1);
  return sessions.filter(s => s.dateStr >= startStr && s.dateStr <= endStr);
}

function totalMinutes(sessions: SessionRecord[]): number {
  return sessions.filter(s => s.completed).reduce((acc, s) => acc + s.duration, 0);
}

function completionRate(sessions: SessionRecord[]): number {
  if (sessions.length === 0) return 0;
  return Math.round((sessions.filter(s => s.completed).length / sessions.length) * 100);
}

// ─── Bar data builders ────────────────────────────────────────────────────────
function getDayBars(sessions: SessionRecord[], numDays: number): BarItem[] {
  const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return Array.from({ length: numDays }, (_, i) => {
    const ds   = daysAgo(numDays - 1 - i);
    const dow  = new Date(ds + 'T12:00:00').getDay(); // noon avoids DST issues
    const mins = sessions.filter(s => s.dateStr === ds).reduce((a, s) => a + s.duration, 0);
    return { label: DAY[dow], minutes: mins };
  });
}

function getDayTimeBars(sessions: SessionRecord[]): BarItem[] {
  const today  = daysAgo(0);
  const labels = ['12a', '4a', '8a', '12p', '4p', '8p'];
  return labels.map((label, i) => {
    const startH = i * 4;
    const mins   = sessions
      .filter(s => s.dateStr === today)
      .filter(s => {
        const h = parseInt(s.startTime.split(':')[0], 10);
        return h >= startH && h < startH + 4;
      })
      .reduce((a, s) => a + s.duration, 0);
    return { label, minutes: mins };
  });
}

function getBarData(sessions: SessionRecord[], filter: FilterType): BarItem[] {
  if (filter === 'Day')  return getDayTimeBars(sessions);
  if (filter === 'Week') return getDayBars(sessions, 7);
  // Month → 4 weekly buckets, oldest left
  return Array.from({ length: 4 }, (_, i) => {
    const hi = (3 - i) * 7;
    const lo = hi + 7;
    const wk = sessions.filter(s => {
      const dAgo = Math.floor(
        (Date.now() - new Date(s.dateStr + 'T12:00:00').getTime()) / 86_400_000,
      );
      return dAgo >= hi && dAgo < lo;
    });
    return { label: `W${i + 1}`, minutes: wk.reduce((a, s) => a + s.duration, 0) };
  });
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────
function computeBestTime(sessions: SessionRecord[]): string {
  const done = sessions.filter(s => s.completed && s.startTime);
  if (done.length === 0) return '—';
  const counts: Record<number, number> = {};
  for (const s of done) {
    const h = parseInt(s.startTime.split(':')[0], 10);
    counts[h] = (counts[h] || 0) + 1;
  }
  const best = Number(Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0]);
  if (best === 0)  return '12 AM';
  if (best === 12) return '12 PM';
  return best < 12 ? `${best} AM` : `${best - 12} PM`;
}

function computeHealthScore(sessions: SessionRecord[], filter: FilterType, user: UserProfile): number {
  if (sessions.length === 0) return 0;
  const days   = filter === 'Day' ? 1 : filter === 'Week' ? 7 : 30;
  // Volume target derives from user's own goals, not a fixed 1h/day assumption
  const target = filter === 'Day'
    ? user.dailyGoalMinutes
    : filter === 'Week'
      ? user.weeklyGoalMinutes
      : user.weeklyGoalMinutes * 4; // ~4 weeks per month
  const activeDays  = new Set(sessions.map(s => s.dateStr)).size;
  const consistency = Math.min(activeDays / days, 1) * 40;
  const rate        = (completionRate(sessions) / 100) * 30;
  const volume      = Math.min(totalMinutes(sessions) / Math.max(target, 1), 1) * 30;
  return Math.round(consistency + rate + volume);
}

/** Expose breakdown values for the UI detail row */
function healthBreakdown(sessions: SessionRecord[], filter: FilterType, user: UserProfile) {
  const days    = filter === 'Day' ? 1 : filter === 'Week' ? 7 : 30;
  const target  = filter === 'Day' ? user.dailyGoalMinutes
                : filter === 'Week' ? user.weeklyGoalMinutes
                : user.weeklyGoalMinutes * 4;
  const actives = new Set(sessions.map(s => s.dateStr)).size;
  return {
    consistency: Math.round(Math.min(actives / days, 1) * 40),
    completion:  Math.round((completionRate(sessions) / 100) * 30),
    volume:      Math.round(Math.min(totalMinutes(sessions) / Math.max(target, 1), 1) * 30),
  };
}

function fmtHours(mins: number): string {
  if (mins === 0) return '0 min';
  if (mins < 60)  return `${mins} min`;
  return `${(mins / 60).toFixed(1)} hrs`;
}

// ─── Animated bar chart ───────────────────────────────────────────────────────
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
const bc = StyleSheet.create({
  wrap:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: MAX_BAR_H + 28, marginTop: spacing.lg },
  col:   { alignItems: 'center', flex: 1 },
  track: { width: 18, height: MAX_BAR_H, justifyContent: 'flex-end', backgroundColor: colors.border, borderRadius: 6, overflow: 'hidden' },
  bar:   { width: 18, backgroundColor: colors.ink, borderRadius: 6 },
  lbl:   { fontSize: 10, color: colors.muted, marginTop: 6, fontWeight: '600' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function AnalyticsScreen({ nav }: { nav: NavProps }) {
  const { sessions } = nav;
  const name    = nav.params.name ?? 'User';
  const initial = name.charAt(0).toUpperCase();

  const [filter, setFilter] = useState<FilterType>('Week');
  const progressAnim = useRef(new Animated.Value(1)).current;

  // Re-animate bars every time the filter changes or new sessions arrive
  useEffect(() => {
    progressAnim.setValue(0);
    Animated.spring(progressAnim, {
      toValue: 1, friction: 6, tension: 55, useNativeDriver: false,
    }).start();
  }, [filter, sessions]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const current = useMemo(() => filterByPeriod(sessions, filter, 0), [sessions, filter]);
  const prev    = useMemo(() => filterByPeriod(sessions, filter, 1), [sessions, filter]);
  const barData = useMemo(() => getBarData(sessions, filter),        [sessions, filter]);

  const focusMins = totalMinutes(current);
  const compRate  = completionRate(current);
  const prevRate  = completionRate(prev);
  const rateDelta = compRate - prevRate;
  const bestTime  = computeBestTime(sessions);
  const health    = computeHealthScore(current, filter, nav.user);
  const breakdown = healthBreakdown(current, filter, nav.user);
  const maxMins   = Math.max(...barData.map(b => b.minutes), 1);
  const hasData   = current.length > 0;

  const periodLabel = filter === 'Day' ? 'today' : filter === 'Week' ? 'this week' : 'this month';
  const chartTitle  = filter === 'Day' ? 'Daily'  : filter === 'Week' ? 'Weekly'    : 'Monthly';

  return (
    <View style={s.screen}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
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

      {/* ── Filter toggle ─────────────────────────────────────────────────────── */}
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

        {/* ── Focus card + animated bar chart ──────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardTop}>
            <View>
              <Text style={s.cardLabel}>{chartTitle} Focus</Text>
              {hasData
                ? <Text style={s.bigNum}>{fmtHours(focusMins)}</Text>
                : <Text style={s.emptyVal}>No sessions yet</Text>}
              <Text style={s.sub}>{periodLabel}</Text>
            </View>
            {hasData && (
              <View style={s.totalBadge}>
                <Text style={s.totalBadgeTxt}>{current.length} sessions</Text>
              </View>
            )}
          </View>
          <BarChart data={barData} maxMins={maxMins} progress={progressAnim} />
        </View>

        {/* ── Stat pair ─────────────────────────────────────────────────────────── */}
        <View style={s.row}>

          {/* Completion Rate */}
          <View style={[s.card, s.half]}>
            <Text style={s.cardLabel}>Completion</Text>
            {hasData ? (
              <>
                <Text style={s.bigNum}>{compRate}%</Text>
                <View style={s.deltaRow}>
                  <Text style={[s.deltaTxt, { color: rateDelta >= 0 ? colors.success : colors.danger }]}>
                    {rateDelta >= 0 ? '↑' : '↓'} {Math.abs(rateDelta)}%
                  </Text>
                  <Text style={s.deltaCtx}> vs prev</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={s.emptyVal}>—</Text>
                <Text style={s.sub}>no data</Text>
              </>
            )}
          </View>

          {/* Best Time */}
          <View style={[s.card, s.half]}>
            <Text style={s.cardLabel}>Best Time</Text>
            <Text style={[s.bigNum, bestTime === '—' && { color: colors.mutedLight }]}>{bestTime}</Text>
            <Text style={s.sub}>
              {bestTime === '—' ? 'complete sessions' : 'most productive'}
            </Text>
          </View>

        </View>

        {/* ── Focus Health score ─────────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Focus Health</Text>
          {hasData ? (
            <>
              <View style={s.healthRow}>
                <Text style={s.healthNum}>{health}</Text>
                <Text style={s.healthMax}>/100</Text>
              </View>
              {/* Animated fill bar */}
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
              {/* Score breakdown labels */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────
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

  deltaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  deltaTxt: { fontSize: fontSize.xs, fontWeight: '700' },
  deltaCtx: { fontSize: fontSize.xs, color: colors.muted },

  healthRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.md },
  healthNum: { fontSize: 48, fontWeight: '800', color: colors.ink, lineHeight: 52 },
  healthMax: { fontSize: fontSize.xl, color: colors.muted, paddingBottom: 7, marginLeft: 4 },
  track:     { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginBottom: spacing.lg },
  fill:      { height: 8, backgroundColor: colors.ink, borderRadius: 4 },

  breakRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  breakItem: { fontSize: fontSize.xs, color: colors.muted, fontWeight: '500' },
});
