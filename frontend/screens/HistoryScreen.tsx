import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps, SessionRecord } from '../App';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import { colors, fontSize, spacing, radii } from '../constants/theme';
import { toDateStr, daysAgo, computeStreak, computeFocusHours } from '../store/sessions';
import { apiFetch } from '../api/client';

// ─── Filter type ──────────────────────────────────────────────────────────────
type HistoryFilter = 'Today' | 'Week' | 'Month';
const HISTORY_FILTERS: HistoryFilter[] = ['Today', 'Week', 'Month'];

// ─── Period helpers ───────────────────────────────────────────────────────────
function periodDays(f: HistoryFilter) { return f === 'Today' ? 2 : f === 'Week' ? 7 : 30; }

function filterPeriod(sessions: SessionRecord[], f: HistoryFilter): SessionRecord[] {
  const start = daysAgo(periodDays(f) - 1);
  const end   = daysAgo(0);
  return sessions.filter(s => s.dateStr >= start && s.dateStr <= end);
}

function groupByDate(sessions: SessionRecord[]): { dateStr: string; label: string; items: SessionRecord[] }[] {
  const today     = daysAgo(0);
  const yesterday = daysAgo(1);
  const map: Record<string, SessionRecord[]> = {};
  for (const s of sessions) { if (!map[s.dateStr]) map[s.dateStr] = []; map[s.dateStr].push(s); }
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0]))           // newest first
    .map(([dateStr, items]) => ({
      dateStr,
      label: dateStr === today     ? 'Today'
           : dateStr === yesterday ? 'Yesterday'
           : new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      items,
    }));
}

// ─── Week-strip helper (local — only needed here) ─────────────────────────────
function getWeekDays(anchor: Date): Date[] {
  const d = new Date(anchor);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); // rewind to Monday
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}

// ─── Week strip ───────────────────────────────────────────────────────────────
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekStrip({ sessions }: { sessions: SessionRecord[] }) {
  const todayStr = toDateStr(new Date());
  const weekDays = getWeekDays(new Date());
  const activeDays = useMemo(
    () => new Set(sessions.filter(s => s.completed).map(s => s.dateStr)),
    [sessions],
  );
  return (
    <View style={ws.row}>
      {weekDays.map((day, i) => {
        const ds = toDateStr(day);
        const isActive = activeDays.has(ds);
        const isToday  = ds === todayStr;
        return (
          <View key={i} style={ws.col}>
            <View style={[ws.circle, isActive && ws.circleActive, !isActive && isToday && ws.circleToday]}>
              <Text style={[ws.letter, isActive && ws.letterActive, !isActive && isToday && ws.letterToday]}>
                {DAY_LETTERS[i]}
              </Text>
            </View>
            {isToday && <View style={ws.todayDot} />}
          </View>
        );
      })}
    </View>
  );
}

// ─── Session card ─────────────────────────────────────────────────────────────
function SessionItem({ s, onDelete }: { s: SessionRecord; onDelete: () => void }) {
  const confirmDelete = () =>
    Alert.alert('Delete Session', 'Remove this session from history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);

  return (
    <Card style={sc.card} padding={spacing.lg}>
      <View style={sc.row}>
        <View style={sc.left}>
          <Text style={sc.title} numberOfLines={1}>{s.title}</Text>
          <Text style={sc.sub}>{s.type} · {s.duration} min · {s.startTime}–{s.endTime}</Text>
        </View>
        <View style={sc.rightCol}>
          {s.completed && s.focusScore !== null ? (
            <View style={sc.scoreBadge}><Text style={sc.scoreText}>{s.focusScore}</Text></View>
          ) : (
            <View style={sc.incompleteBadge}><Text style={sc.incompleteText}>Incomplete</Text></View>
          )}
          <TouchableOpacity style={sc.deleteBtn} onPress={confirmDelete} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={13} color={colors.mutedLight} />
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyGroup() {
  return (
    <View style={sc.empty}>
      <Ionicons name="calendar-outline" size={22} color={colors.mutedLight} />
      <Text style={sc.emptyText}>No sessions recorded</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HistoryScreen({ nav }: { nav: NavProps }) {
  const { sessions } = nav;
  const [histFilter, setHistFilter] = useState<HistoryFilter>('Today');

  // Streak always computed from ALL sessions (overall consecutive streak)
  const streak = computeStreak(sessions);

  // Stats + list based on the selected filter period
  const periodSessions = useMemo(() => filterPeriod(sessions, histFilter), [sessions, histFilter]);
  const sessionGroups  = useMemo(() => groupByDate(periodSessions),         [periodSessions]);

  const totalCount = periodSessions.length;
  const doneCount  = periodSessions.filter(s => s.completed).length;
  const focusHours = computeFocusHours(periodSessions);

  const statCards = [
    { value: String(totalCount), label: 'Sessions'  },
    { value: String(doneCount),  label: 'Completed' },
    { value: focusHours,         label: 'Focus hrs' },
  ];

  return (
    <View style={main.screen}>

      {/* ── Fixed header ──────────────────────────────────────────────────── */}
      <View style={main.header}>
        <TouchableOpacity style={main.backBtn} onPress={() => nav.navigate('Dashboard')} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={main.headerTitle}>Session History</Text>
        <View style={main.headerSpacer} />
      </View>

      {/* ── Filter tabs ───────────────────────────────────────────────────── */}
      <View style={main.filterWrap}>
        {HISTORY_FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[main.filterBtn, histFilter === f && main.filterBtnOn]}
            onPress={() => setHistFilter(f)}
            activeOpacity={0.75}
          >
            <Text style={[main.filterTxt, histFilter === f && main.filterTxtOn]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={main.container} showsVerticalScrollIndicator={false}>

        {/* Streak + week strip */}
        <Card style={main.weekCard} padding={spacing.lg}>
          <View style={main.weekHeader}>
            <View>
              <Text style={main.streakNum}>{streak}</Text>
              <Text style={main.streakLabel}>day streak</Text>
            </View>
            <View style={main.weekRight}>
              <Ionicons name="flame" size={32} color={colors.amber} />
            </View>
          </View>
          <WeekStrip sessions={sessions} />
        </Card>

        {/* Stats row */}
        <View style={main.statsRow}>
          {statCards.map(({ value, label }) => (
            <Card key={label} style={main.statCard} padding={spacing.lg}>
              <Text style={main.statValue}>{value}</Text>
              <Text style={main.statLabel}>{label}</Text>
            </Card>
          ))}
        </View>

        {/* Dynamic date groups driven by filter */}
        {sessionGroups.length > 0
          ? sessionGroups.map(group => (
              <View key={group.dateStr}>
                <SectionLabel>{group.label}</SectionLabel>
                {group.items.map(s => (
                  <SessionItem
                    key={s.id}
                    s={s}
                    onDelete={() => {
                      nav.deleteSession(s.id);
                      apiFetch(`/sessions/${s.id}`, nav.token, { method: 'DELETE' })
                        .catch(() => nav.addSession(s));
                    }}
                  />
                ))}
              </View>
            ))
          : <EmptyGroup />}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

/** Week strip */
const ws = StyleSheet.create({
  row:          { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  col:          { alignItems: 'center', gap: spacing.xxs + 1 },
  circle:       { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  circleActive: { backgroundColor: colors.ink },
  circleToday:  { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.ink },
  letter:       { fontSize: fontSize.sm - 1, fontWeight: '600', color: colors.muted },
  letterActive: { color: colors.white },
  letterToday:  { color: colors.ink },
  todayDot:     { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.ink },
});

/** Session item */
const sc = StyleSheet.create({
  card:            { marginBottom: spacing.sm + 2 },
  row:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left:            { flex: 1, marginRight: spacing.sm },
  title:           { fontSize: fontSize.md, fontWeight: '600', color: colors.ink, marginBottom: 3 },
  sub:             { fontSize: fontSize.xs + 1, color: colors.muted },
  rightCol:        { alignItems: 'flex-end', gap: spacing.sm },
  scoreBadge:      { backgroundColor: colors.ink, borderRadius: radii.full, paddingVertical: 5, paddingHorizontal: spacing.md },
  scoreText:       { color: colors.white, fontSize: fontSize.sm, fontWeight: '700' },
  incompleteBadge: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.full, paddingVertical: 5, paddingHorizontal: spacing.md },
  incompleteText:  { color: colors.mutedLight, fontSize: fontSize.xs, fontWeight: '500' },
  deleteBtn:       { padding: 2 },
  empty:           { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, opacity: 0.6 },
  emptyText:       { fontSize: fontSize.sm, color: colors.mutedLight },
});

/** Screen layout */
const main = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: colors.bg },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: spacing.sm, backgroundColor: colors.bg },
  backBtn:      { width: 40, height: 40, justifyContent: 'center' },
  headerTitle:  { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  headerSpacer: { width: 40 },
  filterWrap:   { flexDirection: 'row', marginHorizontal: spacing.xl, marginBottom: spacing.md, backgroundColor: colors.border, borderRadius: radii.full, padding: 3 },
  filterBtn:    { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radii.full },
  filterBtnOn:  { backgroundColor: colors.ink },
  filterTxt:    { fontSize: fontSize.sm, fontWeight: '600', color: colors.muted },
  filterTxtOn:  { color: colors.white },
  container:    { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },

  weekCard:    { marginBottom: spacing.md },
  weekHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  weekRight:   { justifyContent: 'center', alignItems: 'center' },
  streakNum:   { fontSize: 40, fontWeight: '800', color: colors.ink, lineHeight: 44 },
  streakLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.muted, letterSpacing: 0.5, marginTop: 1 },

  statsRow:  { flexDirection: 'row', gap: spacing.sm + 2, marginBottom: spacing.xs },
  statCard:  { flex: 1 },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  statLabel: { fontSize: fontSize.xs, color: colors.muted },
});
