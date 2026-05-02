import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Switch, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import { colors, spacing, radii, fontSize } from '../constants/theme';

const SESSION_TYPES = ['Study', 'Work', 'Custom'] as const;
const DURATIONS = [15, 25, 30, 45, 60, 90];
const APPS = ['Instagram', 'Twitter', 'TikTok', 'YouTube', 'Reddit', 'Snapchat', 'Discord', 'Games'];

const POMO_PRESETS = [
  { label: '25 / 5',  work: 25, brk: 5  },
  { label: '50 / 10', work: 50, brk: 10 },
  { label: '30 / 10', work: 30, brk: 10 },
  { label: '15 / 3',  work: 15, brk: 3  },
] as const;

type PomoPreset = typeof POMO_PRESETS[number];

export default function CreateSessionScreen({ nav }: { nav: NavProps }) {
  const [sessionType, setSessionType] = useState<string>('Study');
  const [duration, setDuration] = useState(() =>
    DURATIONS.includes(nav.user.preferredDuration) ? nav.user.preferredDuration : 25,
  );
  const [pomodoro,   setPomodoro]   = useState(() => nav.user.pomodoroEnabled);
  const [pomoPreset, setPomoPreset] = useState<PomoPreset>(POMO_PRESETS[0]);
  const [pomoRounds, setPomoRounds] = useState(2);
  const [blockedApps, setBlockedApps] = useState<string[]>(['Instagram', 'Twitter', 'TikTok', 'YouTube', 'Reddit']);
  const [showAllApps, setShowAllApps] = useState(false);

  const pomoDuration = pomoPreset.work * pomoRounds;

  const toggleApp = (app: string) =>
    setBlockedApps(prev => prev.includes(app) ? prev.filter(a => a !== app) : [...prev, app]);

  const visibleApps = showAllApps ? APPS : APPS.slice(0, 5);

  const startParams = {
    type:          sessionType,
    duration:      String(pomodoro ? pomoDuration : duration),
    pomodoro:      String(pomodoro),
    pomodoroWork:  String(pomoPreset.work),
    pomodoroBreak: String(pomoPreset.brk),
    blockedApps:   blockedApps.join(','),
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => nav.navigate('Dashboard')}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>New Session</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Session Type */}
        <SectionLabel noTopMargin>Session Type</SectionLabel>
        <View style={styles.typeRow}>
          {SESSION_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.typePill, sessionType === t && styles.typePillActive]}
              onPress={() => setSessionType(t)}
              activeOpacity={0.75}
            >
              <Text style={[styles.typePillText, sessionType === t && styles.typePillTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Duration (non-Pomodoro) OR Preset + Total Duration (Pomodoro) */}
        {!pomodoro ? (
          <>
            <SectionLabel>Duration</SectionLabel>
            <Text style={styles.durationBig}>
              {duration} <Text style={styles.durationUnit}>min</Text>
            </Text>
            <View style={styles.durationRow}>
              {DURATIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationChip, duration === d && styles.durationChipActive]}
                  onPress={() => setDuration(d)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.durationChipText, duration === d && styles.durationChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <SectionLabel>Pomodoro Preset</SectionLabel>
            <View style={styles.durationRow}>
              {POMO_PRESETS.map(p => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.durationChip, pomoPreset.label === p.label && styles.durationChipActive]}
                  onPress={() => setPomoPreset(p)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.durationChipText, pomoPreset.label === p.label && styles.durationChipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <SectionLabel>Total Duration</SectionLabel>
            <Text style={styles.durationBig}>
              {pomoDuration} <Text style={styles.durationUnit}>min</Text>
            </Text>
            <View style={styles.durationRow}>
              {[1, 2, 3, 4].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.durationChip, pomoRounds === r && styles.durationChipActive]}
                  onPress={() => setPomoRounds(r)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.durationChipText, pomoRounds === r && styles.durationChipTextActive]}>
                    {pomoPreset.work * r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Pomodoro toggle */}
        <Card style={styles.toggleCard} padding={spacing.lg}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Pomodoro Mode</Text>
            <Text style={styles.toggleSub}>
              {pomodoro
                ? `${pomoPreset.work} min focus · ${pomoPreset.brk} min break`
                : '25 min focus · 5 min break'}
            </Text>
          </View>
          <Switch value={pomodoro} onValueChange={setPomodoro} trackColor={{ true: colors.ink }} thumbColor={colors.white} />
        </Card>

        {/* Block Apps */}
        <SectionLabel>Block Apps</SectionLabel>
        <View style={styles.appsWrap}>
          {visibleApps.map(app => (
            <TouchableOpacity
              key={app}
              style={[styles.appChip, blockedApps.includes(app) && styles.appChipActive]}
              onPress={() => toggleApp(app)}
              activeOpacity={0.75}
            >
              <Text style={[styles.appChipText, blockedApps.includes(app) && styles.appChipTextActive]}>{app}</Text>
            </TouchableOpacity>
          ))}
          {!showAllApps && (
            <TouchableOpacity style={styles.appChip} onPress={() => setShowAllApps(true)}>
              <Text style={styles.appChipText}>+{APPS.length - 5} more</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <TouchableOpacity style={styles.nfcBtn} onPress={() => nav.navigate('NFCScan', startParams)} activeOpacity={0.8}>
          <Text style={styles.nfcBtnText}>Tap NFC Tag to Start</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={() => nav.navigate('ActiveSession', startParams)} activeOpacity={0.7}>
          <Text style={styles.skipBtnText}>Start Without NFC</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  header:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: spacing.md, backgroundColor: colors.bg,
  },
  backBtn:      { width: 40, height: 40, justifyContent: 'center' },
  title:        { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  headerSpacer: { width: 40 },
  body:         { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },

  typeRow:            { flexDirection: 'row', gap: spacing.sm + 2 },
  typePill:           { paddingVertical: 10, paddingHorizontal: 22, borderRadius: radii.full, backgroundColor: colors.border },
  typePillActive:     { backgroundColor: colors.ink },
  typePillText:       { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.inkSoft },
  typePillTextActive: { color: colors.white },

  durationBig:  { fontSize: 60, fontWeight: '700', color: colors.ink, textAlign: 'center', marginVertical: 6 },
  durationUnit: { fontSize: 22, fontWeight: '400', color: colors.muted },
  durationRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2, justifyContent: 'center', marginBottom: spacing.xs },
  durationChip:           { paddingVertical: spacing.sm, paddingHorizontal: 18, borderRadius: radii.full, backgroundColor: colors.border },
  durationChipActive:     { backgroundColor: colors.ink },
  durationChipText:       { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.inkSoft },
  durationChipTextActive: { color: colors.white },

  toggleCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  toggleInfo: { flex: 1 },
  toggleTitle: { fontSize: fontSize.lg - 1, fontWeight: '600', color: colors.ink },
  toggleSub:   { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },

  appsWrap:         { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  appChip:          { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.full, backgroundColor: colors.border },
  appChipActive:    { backgroundColor: colors.ink },
  appChipText:      { fontSize: fontSize.sm, fontWeight: '500', color: colors.inkSoft },
  appChipTextActive: { color: colors.white },

  nfcBtn:      { backgroundColor: colors.ink, borderRadius: radii.lg, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  nfcBtnText:  { color: colors.white, fontSize: fontSize.lg - 1, fontWeight: '700' },
  skipBtn:     { alignItems: 'center', paddingVertical: 14, marginTop: spacing.sm + 2 },
  skipBtnText: { fontSize: fontSize.md, color: colors.muted, fontWeight: '500' },
});
