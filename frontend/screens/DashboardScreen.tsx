import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import PillBadge from '../components/PillBadge';
import { colors, spacing, fontSize, radii } from '../constants/theme';
import { computeStreak, computeFocusHours, computeTodayScore, computeDailyProgress, toDateStr } from '../store/sessions';
import type { SessionRecord } from '../App';

const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

// Determine best productive time from all sessions (same logic as Analytics)
// TODO: replace with ai logic
function bestTimeLabel(sessions: SessionRecord[]): string | null {
  const done = sessions.filter(s => s.completed && s.startTime);
  if (done.length === 0) return null;
  const counts: Record<number, number> = {};
  for (const s of done) { const h = parseInt(s.startTime.split(':')[0], 10); counts[h] = (counts[h] || 0) + 1; }
  const best = Number(Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0]);
  if (best === 0)  return '12 AM';
  if (best === 12) return '12 PM';
  return best < 12 ? `${best} AM` : `${best - 12} PM`;
}

export default function DashboardScreen({ nav }: { nav: NavProps }) {
  const { sessions, user } = nav;
  const name     = user.name !== 'User' ? user.name : (nav.params.name ?? 'User');
  const initial  = name.charAt(0).toUpperCase();
  const focusDay = `FOCUS ${DAYS[new Date().getDay()]}`;

  // ── Live stats from shared session store ────────────────────────────────────
  const SCORE         = computeTodayScore(sessions);
  const totalSessions = sessions.length;
  const focusHours    = computeFocusHours(sessions);
  const streak        = computeStreak(sessions);
  const dailyPct  = computeDailyProgress(sessions, user.dailyGoalMinutes);
  const today     = toDateStr(new Date());
  const todayMins = sessions.filter(s => s.completed && s.dateStr === today).reduce((a, s) => a + s.duration, 0);
  const bestTime  = bestTimeLabel(sessions);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.focusDay}>{focusDay}</Text>
          <Text style={styles.dashTitle}>Dashboard</Text>
        </View>
        <TouchableOpacity style={styles.avatar} onPress={nav.openDrawer}>
          <Text style={styles.avatarText}>{initial}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Focus Score Card (dark) ────────────────────────────────────────── */}
      <Card dark style={styles.scoreCard} padding={22}>
        <SectionLabel noTopMargin style={styles.scoreLabelOverride}>Today's Focus Score</SectionLabel>
        <Text style={styles.scoreValue}>
          {SCORE}<Text style={styles.scoreMax}> /100</Text>
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${SCORE}%` as any }]} />
        </View>
      </Card>

      {/* ── Stats Row ─────────────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        {[
          [String(totalSessions), 'Sessions'],
          [focusHours,            'Hours'   ],
          [`${streak}d`,          'Streak'  ],
        ].map(([val, label]) => (
          <Card key={label} style={styles.statCard} padding={spacing.lg}>
            <Text style={styles.statValue}>{val}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </Card>
        ))}
      </View>

      {/* ── Daily Goal Progress ───────────────────────────────────────────── */}
      <Card style={styles.mb14} padding={18}>
        <View style={styles.goalHeader}>
          <SectionLabel noTopMargin>Today's Goal</SectionLabel>
          <Text style={styles.goalPct}>{dailyPct}%</Text>
        </View>
        <Text style={styles.goalSub}>
          {todayMins} / {user.dailyGoalMinutes} min focused today
        </Text>
        <View style={styles.goalTrack}>
          <View style={[styles.goalFill, { width: `${dailyPct}%` as any }]} />
        </View>
      </Card>

      {/* ── Next Session (uses user preferred settings) ───────────────────── */}
      <Card style={styles.mb14} padding={18}>
        <SectionLabel noTopMargin>Next Session</SectionLabel>
        <View style={styles.sessionRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.sessionTitle}>Focus Session</Text>
            <Text style={styles.sessionSub}>
              {user.preferredDuration} min{user.pomodoroEnabled ? ' · Pomodoro' : ''}
            </Text>
          </View>
          <PillBadge label="Study" bg={colors.ink} color={colors.white} />
        </View>
      </Card>

      {/* ── Smart Suggestion (driven by real session data) ────────────────── */}
      <Card style={styles.mb14} padding={18}>
        <View style={styles.suggestionHeader}>
          <Ionicons name="bulb-outline" size={13} color={colors.muted} />
          <SectionLabel noTopMargin style={styles.suggestionLabelOverride}>Smart Suggestion</SectionLabel>
        </View>
        {bestTime ? (
          <Text style={styles.suggestionText}>
            You're most productive around {bestTime}.{'\n'}
            {dailyPct < 100
              ? `${user.dailyGoalMinutes - todayMins} min left to hit today's goal.`
              : "You've hit today's focus goal — great work!"}
          </Text>
        ) : (
          <Text style={styles.suggestionText}>
            Complete your first session to unlock personalised insights.
          </Text>
        )}
      </Card>

      {/* ── Start CTA ─────────────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.startBtn} activeOpacity={0.8} onPress={() => nav.navigate('CreateSession')}>
        <Text style={styles.startBtnText}>Start Focus Session</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: colors.bg },
  container:  { padding: spacing.xl, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 52 },

  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  focusDay:  { fontSize: fontSize.xs, fontWeight: '600', color: colors.muted, letterSpacing: 1.5, marginBottom: 2 },
  dashTitle: { fontSize: fontSize.xxxl, fontWeight: 'bold', color: colors.ink },
  avatar:    { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: fontSize.lg },

  scoreCard:          { marginBottom: 14 },
  scoreLabelOverride: { color: colors.mutedLight, marginBottom: spacing.sm },
  scoreValue: { color: colors.white, fontSize: fontSize.display, fontWeight: 'bold', marginBottom: 18 },
  scoreMax:   { fontSize: fontSize.xl, color: '#666', fontWeight: 'normal' },
  progressTrack: { height: 6, backgroundColor: colors.darkBorder, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 6, backgroundColor: colors.yellow, borderRadius: 3 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1 },
  statValue: { fontSize: 22, fontWeight: 'bold', color: colors.ink, marginBottom: 2 },
  statLabel: { fontSize: fontSize.xs, color: colors.muted },

  mb14: { marginBottom: 14 },

  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalPct:    { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  goalSub:    { fontSize: fontSize.sm, color: colors.muted, marginBottom: spacing.sm },
  goalTrack:  { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  goalFill:   { height: 6, backgroundColor: colors.ink, borderRadius: 3 },
  sessionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  sessionSub:   { fontSize: fontSize.sm, color: colors.muted },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  suggestionLabelOverride: { marginTop: 0, marginBottom: 0 },
  suggestionText: { fontSize: fontSize.sm + 1, color: colors.inkSoft, lineHeight: 22 },

  startBtn: { backgroundColor: colors.ink, borderRadius: radii.md, paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  startBtnText: { color: colors.white, fontSize: fontSize.lg - 1, fontWeight: '600' },
});
