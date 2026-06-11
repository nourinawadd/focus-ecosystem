import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  Alert, Animated, Modal, Easing, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import { toDateStr, fmtHHMM } from '../store/sessions';
import CircularProgress from '../components/CircularProgress';
import Card from '../components/Card';
import PillBadge from '../components/PillBadge';
import { colors, spacing, radii, fontSize } from '../constants/theme';
import { apiFetch } from '../api/client';
import { initNFC, readTag, cancelScan, isNFCSupported } from '../utils/nfc';
import { scheduleSessionAlert, cancelSessionAlert } from '../notifications';
import {
  isSupported as screenTimeSupported,
  hasSelection as screenTimeHasSelection,
  applyShield as applyScreenTimeShield,
  clearShield as clearScreenTimeShield,
} from 'anchor-screen-time';
import {
  isSupported as liveActivitySupported,
  startActivity as startLiveActivity,
  updateActivity as updateLiveActivity,
  endActivity as endLiveActivity,
} from 'anchor-live-activity';

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

type NfcModalPhase = 'scanning' | 'unregistered';

export default function ActiveSessionScreen({ nav }: { nav: NavProps }) {
  const totalSecs   = parseInt(nav.params.plannedDuration ?? '45') * 60;
  const isPomo      = nav.params.pomodoro === 'true';
  const pomoWork    = parseInt(nav.params.pomodoroWork  ?? '25');
  const pomoBreak   = parseInt(nav.params.pomodoroBreak ?? '5');
  const blockedApps = (nav.params.blockedApps ?? '').split(',').filter(Boolean);
  const sessionName = nav.params.customName || 'Untitled';

  const FOCUS_SECS = isPomo ? pomoWork  * 60 : totalSecs;
  const BREAK_SECS = isPomo ? pomoBreak * 60 : 0;
  const maxRounds  = isPomo ? Math.max(Math.ceil(totalSecs / (pomoWork * 60)), 1) : 1;

  // Resuming a session that survived an app kill: App passes the existing
  // session id + original start so we adopt it instead of creating a new one.
  const resumeId        = nav.params.resumeId || null;
  const resumeStartedAt = resumeId && nav.params.resumeStartedAt
    ? new Date(nav.params.resumeStartedAt)
    : null;

  // Fast-forward the timer to where it would be had the app stayed alive:
  // walk the elapsed wall-clock time through the phase sequence (same scheme
  // as reconcilePomodoro below), banking focus time for finished phases.
  const initialState = (() => {
    if (!resumeStartedAt) {
      return { phase: 'focus' as const, round: 1, remaining: FOCUS_SECS, banked: 0 };
    }
    let over = (Date.now() - resumeStartedAt.getTime()) / 1000;
    if (!isPomo) {
      return {
        phase:     'focus' as const,
        round:     1,
        remaining: Math.max(0, Math.round(totalSecs - over)),
        banked:    Math.min(totalSecs, over),
      };
    }
    let p: 'focus' | 'break' = 'focus';
    let r = 1;
    let banked = 0;
    for (;;) {
      const dur = p === 'focus' ? FOCUS_SECS : BREAK_SECS;
      if (over < dur) {
        if (p === 'focus') banked += over;
        return { phase: p, round: r, remaining: Math.max(1, Math.round(dur - over)), banked };
      }
      over -= dur;
      if (p === 'focus') {
        banked += FOCUS_SECS;
        p = 'break';
      } else {
        if (r + 1 > maxRounds) return { phase: p, round: r, remaining: 0, banked };
        r += 1;
        p = 'focus';
      }
    }
  })();

  const [phase,        setPhase]        = useState<'focus' | 'break'>(initialState.phase);
  const [round,        setRound]        = useState(initialState.round);
  const [remaining,    setRemaining]    = useState(initialState.remaining);
  const [running,      setRunning]      = useState(initialState.remaining > 0);
  const [nfcModal,     setNfcModal]     = useState(false);
  const [nfcPhase,     setNfcPhase]     = useState<NfcModalPhase>('scanning');

  const startedAt      = useRef(resumeStartedAt ?? new Date());
  const sessionIdRef   = useRef<string | null>(null);
  const shieldAppliedRef = useRef(false);

  // Wall-clock timer anchoring — so backgrounding can't freeze the countdown.
  const deadlineRef      = useRef(0);                   // ms timestamp the phase ends
  const focusAccumRef    = useRef(initialState.banked); // committed focus seconds
  const focusRunStartRef = useRef<number | null>(null); // start of the live focus run

  const phaseRef = useRef(phase);
  const roundRef = useRef(round);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { roundRef.current = round; }, [round]);

  // NFC pulse refs for the end-session modal
  const nfcPulse1   = useRef(new Animated.Value(1)).current;
  const nfcPulse2   = useRef(new Animated.Value(1)).current;
  const nfcOpacity1 = useRef(new Animated.Value(0.45)).current;
  const nfcOpacity2 = useRef(new Animated.Value(0.25)).current;

  const startNfcPulse = () => {
    const ring = (scale: Animated.Value, op: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1.9, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(op,    { toValue: 0,   duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(op,    { toValue: delay === 0 ? 0.45 : 0.25, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
    ring(nfcPulse1, nfcOpacity1, 0).start();
    ring(nfcPulse2, nfcOpacity2, 750).start();
  };

  const stopNfcPulse = () => {
    nfcPulse1.stopAnimation(); nfcPulse1.setValue(1); nfcOpacity1.setValue(0.45);
    nfcPulse2.stopAnimation(); nfcPulse2.setValue(1); nfcOpacity2.setValue(0.25);
  };

  useEffect(() => {
    // Resumed sessions already exist server-side — adopt the id, don't re-create.
    if (resumeId) {
      sessionIdRef.current = resumeId;
      return;
    }
    if (!nav.token) return;
    const now = startedAt.current;
    const nfcTag = nav.params.nfcTag || null;
    apiFetch<{ id: string }>('/sessions', nav.token, {
      method: 'POST',
      body: JSON.stringify({
        categoryId:   nav.params.categoryId || 'uncategorized',
        customName:   nav.params.customName || 'Untitled',
        timerMode:   isPomo ? 'POMODORO' : 'COUNTDOWN',
        timerConfig: {
          plannedDuration: parseInt(nav.params.plannedDuration ?? '45'),
          pomodoroWork:    pomoWork,
          pomodoroBreak:   pomoBreak,
        },
        blockedApps,
        dateStr:     toDateStr(now),
        startedAt:   now.toISOString(),
        nfcTagUid:   nfcTag,
      }),
    })
      .then(data => { sessionIdRef.current = data.id; })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The shield follows the phase: apps blocked during focus, unblocked during
  // breaks. Pausing mid-focus keeps the block (a pause is not a break). Round
  // is a dep so a background catch-up that lands on the same phase value (e.g.
  // focus→break→focus) still re-asserts the shield on foreground.
  useEffect(() => {
    if (!screenTimeSupported()) return;
    (async () => {
      try {
        if (phase === 'focus') {
          if (!shieldAppliedRef.current && await screenTimeHasSelection()) {
            await applyScreenTimeShield();
            shieldAppliedRef.current = true;
          }
        } else {
          // Unconditional: a resumed session runs in a fresh process whose ref
          // is false, but the previous process's shield persists system-wide.
          await clearScreenTimeShield();
          shieldAppliedRef.current = false;
        }
      } catch {
        // Authorization revoked or no selection — silently skip, session continues
      }
    })();
  }, [phase, round]);

  // Always lift the shield when the screen unmounts (session ended).
  useEffect(() => () => {
    if (shieldAppliedRef.current) {
      clearScreenTimeShield().catch(() => {});
      shieldAppliedRef.current = false;
    }
  }, []);

  // Live Activity (Lock Screen / Dynamic Island timer): started once per mount
  // — which covers resumes too, since a resumed session re-mounts this screen —
  // and ended on unmount. The countdown ticks natively off endDateMs; the sync
  // effect below only sends updates at phase/round/pause transitions.
  useEffect(() => {
    if (!liveActivitySupported() || initialState.remaining <= 0) return;
    startLiveActivity({
      sessionName,
      isPomo,
      maxRounds,
      phase:         initialState.phase,
      round:         initialState.round,
      endDateMs:     Date.now() + initialState.remaining * 1000,
      paused:        false,
      remainingSecs: initialState.remaining,
    }).catch(() => {});
    return () => { endLiveActivity().catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tickAnim = useRef(new Animated.Value(1)).current;
  const pulseTick = () =>
    Animated.sequence([
      Animated.timing(tickAnim, { toValue: 1.024, duration: 70,  useNativeDriver: true }),
      Animated.timing(tickAnim, { toValue: 1,     duration: 180, useNativeDriver: true }),
    ]).start();

  // Total focus seconds = banked runs + the in-flight run (if currently focusing).
  const commitFocus = () => {
    if (focusRunStartRef.current != null) {
      focusAccumRef.current += (Date.now() - focusRunStartRef.current) / 1000;
      focusRunStartRef.current = null;
    }
  };
  const focusElapsedSecs = () => {
    const live = focusRunStartRef.current != null ? (Date.now() - focusRunStartRef.current) / 1000 : 0;
    return Math.round(focusAccumRef.current + live);
  };

  // Catch up the Pomodoro state when one or more phase deadlines passed while
  // backgrounded — a long absence can skip a whole focus+break (or more), not
  // just one phase. Walks forward through phases consuming the overflow, banking
  // focus time for the ended/skipped focus phases, and lands on the right
  // phase/round/remaining (or finishes). Returns true if it advanced the state.
  const reconcilePomodoro = () => {
    let over = (Date.now() - deadlineRef.current) / 1000;
    if (over <= 0) return false;                 // current phase still running

    // The current phase fully elapsed. If it was focus, bank it up to its end
    // (not up to now — the overflow belongs to later phases) and close the run.
    if (phaseRef.current === 'focus' && focusRunStartRef.current != null) {
      focusAccumRef.current += Math.min(FOCUS_SECS, (deadlineRef.current - focusRunStartRef.current) / 1000);
      focusRunStartRef.current = null;
    }

    let p = phaseRef.current;
    let r = roundRef.current;
    for (;;) {
      if (p === 'focus') {
        p = 'break';                             // focus → break
        if (over < BREAK_SECS) break;
        over -= BREAK_SECS;                      // break fully skipped (not focus, not banked)
      } else {
        if (r + 1 > maxRounds) {                 // break → done
          setRunning(false);
          setRemaining(0);
          return true;
        }
        r += 1;
        p = 'focus';                             // break → next round's focus
        if (over < FOCUS_SECS) {
          focusAccumRef.current += over;         // landed mid-focus: bank elapsed part
          break;                                 // the live run (set by the timer effect) covers the rest
        }
        focusAccumRef.current += FOCUS_SECS;     // focus phase fully skipped → counts in full
        over -= FOCUS_SECS;
      }
    }

    const landedDur = p === 'focus' ? FOCUS_SECS : BREAK_SECS;
    setPhase(p);
    setRound(r);
    setRemaining(Math.max(1, Math.round(landedDur - over)));
    return true;
  };

  // Drive the countdown from a wall-clock deadline rather than counting ticks.
  // setInterval is suspended while the app is backgrounded, so tick-counting
  // would freeze and undercount. Anchoring to Date.now() means the timer
  // reflects real elapsed time the moment we recompute (next tick / foreground).
  useEffect(() => {
    if (!running) return;
    deadlineRef.current = Date.now() + remaining * 1000;
    if (phase === 'focus') focusRunStartRef.current = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemaining(prev => {
        if (left < prev) pulseTick();
        return left;
      });
      if (left <= 0) clearInterval(id);
    }, 250);
    // Cleanup ends the active segment (pause / phase change / unmount): stop the
    // ticker and bank the focus time accrued during it.
    return () => { clearInterval(id); commitFocus(); };
  // `round` is included so a catch-up that lands on the same phase value (e.g.
  // focus→break→focus) still re-anchors the deadline for the new phase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase, round]);

  // What the user should be told when the current phase's deadline arrives.
  const nextPhaseAlert = (): { title: string; body: string } | null => {
    if (!isPomo) {
      return phase === 'focus'
        ? { title: 'Session complete! 🎯', body: 'Great work — tap to see your results.' }
        : null;
    }
    if (phase === 'focus') {
      return { title: 'Time for a break 🌿', body: `Round ${round} done. Step away for ${pomoBreak} min.` };
    }
    return round < maxRounds
      ? { title: 'Break over — back to focus 💪', body: `Starting round ${round + 1} of ${maxRounds}.` }
      : { title: 'Session complete! 🎯', body: 'You finished all your rounds — tap to see your results.' };
  };

  // Schedule a local notification at the phase deadline so a break / resume /
  // completion still alerts the user while the app is backgrounded. Re-runs per
  // phase; the timer effect above re-anchors deadlineRef first (same deps).
  useEffect(() => {
    if (running && nav.user.notificationsEnabled) {
      const msg = nextPhaseAlert();
      if (msg) scheduleSessionAlert(new Date(deadlineRef.current), msg.title, msg.body);
      else cancelSessionAlert();
    } else {
      cancelSessionAlert();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase, round, nav.user.notificationsEnabled]);

  // Cancel any pending phase alert when leaving the screen (session ended/unmounted).
  useEffect(() => () => { cancelSessionAlert(); }, []);

  // Keep the Live Activity in sync at every phase/round/pause transition — the
  // same triggers that reschedule the local notification above. The timer
  // effect re-anchors deadlineRef first (declared earlier with the same deps),
  // so a running update always carries a fresh deadline. Pausing — and
  // completion, which lands here as running=false with remaining 0 — freezes
  // the widget on remainingSecs.
  useEffect(() => {
    if (!liveActivitySupported()) return;
    updateLiveActivity({
      phase,
      round,
      endDateMs:     running ? deadlineRef.current : Date.now() + remaining * 1000,
      paused:        !running,
      remainingSecs: remaining,
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase, round]);

  // Snap the timer to real elapsed time the instant we return to foreground
  // (don't wait for the next tick). For Pomodoro, reconcile any phases that
  // elapsed while away; otherwise just recompute remaining (0 → complete).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !running) return;
      if (isPomo && reconcilePomodoro()) return;
      setRemaining(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

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

  // Core end logic — called after NFC scan (with uid) or directly (without).
  const doEnd = async (nfcTagUid: string | null) => {
    endLiveActivity().catch(() => {});
    if (shieldAppliedRef.current) {
      clearScreenTimeShield().catch(() => {});
      shieldAppliedRef.current = false;
    }
    const elapsed         = focusElapsedSecs();
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
    const finalStatus = remaining === 0 ? 'COMPLETED' : 'ABANDONED';

    let finalScore = score;
    let streak     = '0';

    if (nav.token && sessionIdRef.current) {
      try {
        const res = await apiFetch<{ session: { focusScore: number | null }; streak: number }>(
          `/sessions/${sessionIdRef.current}/end`, nav.token, {
            method: 'PATCH',
            body: JSON.stringify({
              status:           finalStatus,
              timerState:       { actualDuration: actualMinutes },
              focusScore:       score,
              distractionCount: distractionsVal,
              endedAt:          endedAt.toISOString(),
              nfcTagUid,
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
  };

  // End button: shows Alert, then ends without NFC.
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
          onPress: () => doEnd(null),
        },
      ],
      { cancelable: true },
    );
  };

  // NFC row: scans first, then ends with the verified UID.
  const openNfcEndModal = async () => {
    setNfcModal(true);
    setNfcPhase('scanning');
    startNfcPulse();
    try {
      await initNFC();
      const uid = await readTag();
      stopNfcPulse();

      const match = nav.userTags.find(t => t.tagId.uid === uid);
      if (!match) {
        setNfcPhase('unregistered');
        return;
      }

      setNfcModal(false);
      doEnd(uid);
    } catch {
      // User cancelled the iOS sheet — dismiss modal silently
      stopNfcPulse();
      setNfcModal(false);
    }
  };

  const skipNfcEnd = () => {
    cancelScan();
    stopNfcPulse();
    setNfcModal(false);
    doEnd(null);
  };

  const dismissNfcModal = () => {
    cancelScan();
    stopNfcPulse();
    setNfcModal(false);
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

      <Text style={styles.sessionName}>{sessionName}</Text>

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
        {nav.userTags.length > 0 && (
          <TouchableOpacity style={styles.nfcRow} onPress={openNfcEndModal} activeOpacity={0.7}>
            <Ionicons name="radio-outline" size={20} color={colors.muted} />
            <Text style={styles.nfcText}>Tap NFC tag to end session</Text>
          </TouchableOpacity>
        )}
      </Card>

      {/* NFC end-session modal */}
      <Modal visible={nfcModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {nfcPhase === 'scanning' && (
              <>
                <View style={styles.nfcRingContainer}>
                  <Animated.View style={[styles.nfcRing, { transform: [{ scale: nfcPulse1 }], opacity: nfcOpacity1 }]} />
                  <Animated.View style={[styles.nfcRing, { transform: [{ scale: nfcPulse2 }], opacity: nfcOpacity2 }]} />
                  <View style={styles.nfcCenter}>
                    <Ionicons name="radio-outline" size={28} color="#fff" />
                  </View>
                </View>
                <Text style={styles.modalTitle}>Hold tag to end session</Text>
                <Text style={styles.modalSub}>Bring your NFC tag near the top of your iPhone.</Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={dismissNfcModal}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSkipBtn} onPress={skipNfcEnd}>
                    <Text style={styles.modalSkipText}>Skip & End</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {nfcPhase === 'unregistered' && (
              <>
                <View style={styles.modalWarnIcon}>
                  <Ionicons name="alert-circle" size={48} color="#F5A623" />
                </View>
                <Text style={styles.modalTitle}>Unknown Tag</Text>
                <Text style={styles.modalSub}>
                  This tag isn't registered to your account.
                </Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setNfcPhase('scanning'); openNfcEndModal(); }}>
                    <Text style={styles.modalCancelText}>Try Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSkipBtn} onPress={skipNfcEnd}>
                    <Text style={styles.modalSkipText}>Skip & End</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

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

  // NFC end modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  modalCard: {
    backgroundColor: colors.white, borderRadius: radii.xl,
    padding: 28, alignItems: 'center', width: '100%', maxWidth: 340,
  },
  nfcRingContainer: {
    width: 130, height: 130,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  nfcRing: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.ink,
  },
  nfcCenter: {
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center',
  },
  modalWarnIcon: { marginBottom: 12 },
  modalTitle:    { fontSize: fontSize.xl - 1, fontWeight: '700', color: colors.ink, marginBottom: 8, textAlign: 'center' },
  modalSub:      { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  modalActions:  { flexDirection: 'row', gap: 12, width: '100%' },
  modalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.border },
  modalCancelText: { fontSize: fontSize.md, fontWeight: '600', color: colors.inkSoft },
  modalSkipBtn:   { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.ink },
  modalSkipText:  { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
});
