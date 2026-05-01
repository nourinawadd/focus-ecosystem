// frontend/screens/ActiveSessionScreen.tsx
// Runs the focus timer. Creates a session record in the DB on mount via POST /sessions,
// then closes it with PATCH /sessions/:id/end when the user ends or completes the session.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import { toDateStr, fmtHHMM } from '../store/sessions';
import CircularProgress from '../components/CircularProgress';
import Card from '../components/Card';
import PillBadge from '../components/PillBadge';
import { colors, spacing, radii, fontSize } from '../constants/theme';
import { apiFetch } from '../api/client';

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function arcColor(p: number) {
  if (p > 0.5)  return colors.lime;
  if (p > 0.25) return colors.amber;
  return colors.danger;
}

export default function ActiveSessionScreen({ nav }: { nav: NavProps }) {
  const totalSecs   = parseInt(nav.params.duration      ?? '45') * 60;
  const isPomo      = nav.params.pomodoro === 'true';
  const pomoWork    = parseInt(nav.params.pomodoroWork  ?? '25');
  const pomoBreak   = parseInt(nav.params.pomodoroBreak ?? '5');
  const sessionType = nav.params.type ?? 'Study';
  const blockedApps = (nav.params.blockedApps ?? '').split(',').filter(Boolean);

  const FOCUS_SECS = isPomo ? pomoWork  * 60 : totalSecs;
  const BREAK_SECS = isPomo ? pomoBreak * 60 : 0;
  const maxRounds  = isPomo ? Math.max(Math.ceil(totalSecs / (pomoWork * 60)), 1) : 1;

  const [phase,     setPhase]     = useState<'focus' | 'break'>('focus');
  const [round,     setRound]     = useState(1);
  const [remaining, setRemaining] = useState(FOCUS_SECS);
  const [running,   setRunning]   = useState(true);

  const startedAt      = useRef(new Date());
  const sessionIdRef   = useRef<string | null>(null);
  const focusSecsRef   = useRef(0);   // counts only focus-phase seconds (not break time)

  const phaseRef = useRef(phase);
  const roundRef = useRef(round);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { roundRef.current = round; }, [round]);

  // Create the session in the DB as soon as the screen mounts.
  useEffect(() => {
    if (!nav.token) return;
    const now = startedAt.current;
    apiFetch<{ id: string }>('/sessions', nav.token, {
      method: 'POST',
      body: JSON.stringify({
        type:        sessionType.toUpperCase(),
        timerMode:   isPomo ? 'POMODORO' : 'COUNTDOWN',
        timerConfig: {
          plannedDuration: parseInt(nav.params.duration ?? '45'),
          pomodoroWork:    pomoWork,
          pomodoroBreak:   pomoBreak,
        },
        blockedApps,
        dateStr:     toDateStr(now),
        startedAt:   now.toISOString(),
      }),
    })
      .then(data => { sessionIdRef.current = data.id; })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tickAnim = useRef(new Animated.Value(1)).current;
  const pulseTick = () =>
    Animated.sequence([
      Animated.timing(tickAnim, { toValue: 1.024, duration: 70,  useNativeDriver: true }),
      Animated.timing(tickAnim, { toValue: 1,     duration: 180, useNativeDriver: true }),
    ]).start();

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (phaseRef.current === 'focus') focusSecsRef.current += 1;
      setRemaining(prev => {
        if (prev <= 1) { clearInterval(id); return 0; }
        pulseTick();
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, phase]);

  useEffect(() => {
    if (remaining !== 0) return;
    if (!isPomo) { setRunning(false); return; }
    const t = setTimeout(() => {
      if (phaseRef.current === 'focus') {
        setPhase('break');
        setRemaining(BREAK_SECS);
      } else {
        const next = roundRef.current + 1;
        if (next > maxRounds) { setRunning(false); return; }
        setPhase('focus');
        setRound(next);
        setRemaining(FOCUS_SECS);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [remaining]);

  const confirmEnd = () => {
    const isComplete = remaining === 0;
    Alert.alert(
      isComplete ? 'Session Complete!' : 'End Session?',
      isComplete ? 'Ready to see your results?' : 'Your progress will be saved.',
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text:  isComplete ? 'View Summary' : 'End Session',
          style: isComplete ? 'default'      : 'destructive',
          onPress: async () => {
            const elapsed         = focusSecsRef.current;
            const actualMinutes   = Math.max(1, Math.round(elapsed / 60));
            const completionRatio = Math.min(1, elapsed / Math.max(1, totalSecs));
            const distractionsVal = Math.max(
              0,
              Math.floor(actualMinutes / 20) + (completionRatio < 0.9 ? 1 : 0),
            );
            const pomoBon = isPomo ? 8 : 0;
            const penalty = Math.min(24, distractionsVal * 4);
            const score   = Math.min(
              99,
              Math.max(20, Math.round(completionRatio * 80) + pomoBon - penalty + 12),
            );

            const endedAt = new Date();

            let finalScore = score;
            let streak     = '0';

            if (nav.token && sessionIdRef.current) {
              try {
                const res = await apiFetch<{ session: { focusScore: number | null }; streak: number }>(
                  `/sessions/${sessionIdRef.current}/end`, nav.token, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      status:           'COMPLETED',
                      timerState:       { actualDuration: actualMinutes },
                      focusScore:       score,
                      distractionCount: distractionsVal,
                      endedAt:          endedAt.toISOString(),
                    }),
                  },
                );
                finalScore = res.session.focusScore ?? score;
                streak     = String(res.streak);
                nav.refreshSessions();
              } catch {
                // Network failure — continue with local values
              }
            }

            nav.navigate('SessionComplete', {
              ...nav.params,
              actualMinutes: String(actualMinutes),
              focusScore:    String(finalScore),
              blockedCount:  String(blockedApps.length),
              distractions:  String(distractionsVal),
              streak,
            });
          },
        },
      ],
      { cancelable: true },
    );
  };

  const phaseDuration = phase === 'focus' ? FOCUS_SECS : BREAK_SECS;
  const progress      = remaining / phaseDuration;
  const ringColor     = arcColor(progress);
  const statusLabel   = !running ? 'Paused' : phase === 'break' ? 'Break' : 'Active';
  const statusColor   = !running ? colors.mutedLight : phase === 'break' ? colors.amber : colors.lime;

  return (
    <View style={styles.screen}>

      <View style={styles.topBar}>
        <PillBadge label="FOCUS MODE" bg={colors.darkCard} color={colors.white} caps />
        <PillBadge label={statusLabel} bg={colors.darkCard} color={statusColor} dot dotColor={statusColor} />
      </View>

      <Text style={styles.sessionName}>{sessionType} Session</Text>

      {isPomo && (
        <View style={styles.pomoRow}>
          {Array.from({ length: maxRounds }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.pomoDot,
                i < round - 1   && styles.pomoDotDone,
                i === round - 1 && styles.pomoDotActive,
              ]}
            />
          ))}
          <Text style={styles.pomoLabel}>
            {phase === 'focus' ? 'Focus' : 'Break'} {round}/{maxRounds}
          </Text>
        </View>
      )}

      <CircularProgress progress={progress} size={224} strokeWidth={11} color={ringColor} style={styles.ring}>
        <Animated.Text style={[styles.timerText, { transform: [{ scale: tickAnim }] }]}>
          {fmt(remaining)}
        </Animated.Text>
        <Text style={styles.timerSub}>
          {remaining === 0 ? 'complete' : phase === 'break' ? 'break' : 'remaining'}
        </Text>
      </CircularProgress>

      <View style={styles.controlRow}>
        <TouchableOpacity
          style={[styles.ctrlBtn, styles.pauseBtn]}
          onPress={() => setRunning(r => !r)}
          activeOpacity={0.75}
          disabled={remaining === 0}
        >
          <View style={styles.btnContent}>
            <Ionicons name={running ? 'pause' : 'play'} size={15} color={colors.white} />
            <Text style={styles.pauseText}>{running ? 'Pause' : 'Resume'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ctrlBtn, styles.endBtn]}
          onPress={confirmEnd}
          activeOpacity={0.75}
        >
          <View style={styles.btnContent}>
            <Ionicons name="stop-circle-outline" size={15} color={colors.danger} />
            <Text style={styles.endText}>End Session</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Card dark style={styles.bottomCard} padding={spacing.lg}>
        {blockedApps.length > 0 && (
          <>
            <View style={styles.cardRow}>
              <Ionicons name="ban-outline" size={26} color={colors.danger} style={styles.cardIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{blockedApps.length} apps blocked</Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {blockedApps.slice(0, 3).join(', ')}
                  {blockedApps.length > 3 ? ` +${blockedApps.length - 3}` : ''}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
          </>
        )}
        <TouchableOpacity style={styles.nfcRow} onPress={confirmEnd} activeOpacity={0.7}>
          <Ionicons name="radio-outline" size={20} color={colors.muted} />
          <Text style={styles.nfcText}>Tap NFC tag to end session</Text>
        </TouchableOpacity>
      </Card>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: colors.darkBg, alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
  },
  topBar:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xxl },
  sessionName:   { fontSize: fontSize.xxl, fontWeight: '700', color: colors.white, marginBottom: spacing.sm },
  pomoRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  pomoDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.darkBorder },
  pomoDotDone:   { backgroundColor: colors.mutedLight },
  pomoDotActive: { backgroundColor: colors.lime, width: 10, height: 10, borderRadius: 5 },
  pomoLabel:     { fontSize: fontSize.xs, fontWeight: '600', color: colors.muted, marginLeft: spacing.xs },
  ring:          { marginBottom: spacing.xxxl },
  timerText:     { fontSize: 50, fontWeight: '700', color: colors.white, letterSpacing: -1 },
  timerSub:      { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  controlRow:    { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xxl },
  ctrlBtn:       { borderRadius: radii.md, paddingVertical: 13, paddingHorizontal: spacing.xxl },
  btnContent:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pauseBtn:      { backgroundColor: colors.darkCardAlt },
  pauseText:     { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  endBtn:        { backgroundColor: '#2e1111' },
  endText:       { color: colors.danger, fontSize: fontSize.md, fontWeight: '600' },
  bottomCard:    { marginHorizontal: spacing.xl, alignSelf: 'stretch' },
  cardRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  cardIcon:      { marginRight: 2 },
  cardTitle:     { fontSize: fontSize.md, fontWeight: '600', color: colors.white },
  cardSub:       { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  divider:       { height: 1, backgroundColor: colors.darkBorder, marginVertical: spacing.md },
  nfcRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nfcText:       { fontSize: fontSize.sm, color: colors.muted },
});