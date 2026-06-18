import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  Alert, Animated, Modal, Easing, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import { toDateStr, fmtHHMM } from '../store/sessions';
import CircularProgress from '../components/CircularProgress';
import { colors, spacing, radii, fontSize } from '../constants/theme';
import { apiFetch } from '../api/client';
import { hLight, hMedium, hSuccess } from '../utils/haptics';
import { initNFC, readTag, cancelScan, isNFCSupported } from '../utils/nfc';
import { addSessionEvent } from '../utils/calendar';
import { scheduleSessionAlert, cancelSessionAlert } from '../notifications';
import {
  isSupported as screenTimeSupported,
  hasSelection as screenTimeHasSelection,
  applyShield as applyScreenTimeShield,
  clearShield as clearScreenTimeShield,
  getSelectionSummary,
  summaryTotal,
} from 'anchor-screen-time';
import {
  isSupported as liveActivitySupported,
  startActivity as startLiveActivity,
  updateActivity as updateLiveActivity,
  endActivity as endLiveActivity,
} from 'anchor-live-activity';

// Slate background of the focus screen (matches the dark blue-grey mockup).
const SLATE      = '#313852';
const RING_TRACK = 'rgba(255,255,255,0.12)';
const RING_ARC   = 'rgba(255,255,255,0.92)';

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
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
  const [stCount,      setStCount]      = useState(0);   // # apps shielded by Screen Time

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

  // How many apps the user has shielded (for the "N apps blocked" card).
  useEffect(() => {
    if (!screenTimeSupported()) return;
    getSelectionSummary().then(s => setStCount(summaryTotal(s))).catch(() => {});
  }, []);

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
  // A live run never counts past its phase deadline: if the timer expired while
  // the app was backgrounded/locked, the overshoot until the user comes back is
  // idle time, not focus — without the cap a 45-min session left to ring would
  // be recorded with however long it took to return to the app.
  const liveRunSecs = () => {
    if (focusRunStartRef.current == null) return 0;
    const end = Math.min(Date.now(), deadlineRef.current);
    return Math.max(0, (end - focusRunStartRef.current) / 1000);
  };
  const commitFocus = () => {
    focusAccumRef.current += liveRunSecs();
    focusRunStartRef.current = null;
  };
  const focusElapsedSecs = () => Math.round(focusAccumRef.current + liveRunSecs());

  // Catch up the Pomodoro state when one or more phase deadlines passed while
  // backgrounded — a long absence can skip a whole focus+break (or more), not
  // just one phase. Walks forward through phases consuming the overflow, banking
  // focus time for the ended/skipped focus phases, and lands on the right
  // phase/round/remaining (or finishes). Returns true if it advanced the state.
  const reconcilePomodoro = () => {
    let over = (Date.now() - deadlineRef.current) / 1000;
    if (over <= 0) return false;                 // current phase still running

    // The current phase fully elapsed. If it was focus, bank it up to its end
    // (commitFocus caps the run at the deadline — the overflow belongs to later
    // phases) and close the run.
    if (phaseRef.current === 'focus') commitFocus();

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

    if (finalStatus === 'COMPLETED') {
      addSessionEvent({
        title:     sessionName,
        startDate: new Date(endedAt.getTime() - actualMinutes * 60_000),
        endDate:   endedAt,
        notes:     `Focus score: ${finalScore}/100`,
      }).catch(() => {});
    }

    finalStatus === 'COMPLETED' ? hSuccess() : hMedium();
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

  const dismissNfcModal = () => {
    cancelScan();
    stopNfcPulse();
    setNfcModal(false);
  };

  const phaseDuration = phase === 'focus' ? FOCUS_SECS : BREAK_SECS;
  const progress      = phaseDuration > 0 ? remaining / phaseDuration : 0;

  // Top-right lock indicator: green while focus apps are shielded, otherwise
  // reflects the paused / break state.
  const locked    = running && phase === 'focus';
  const lockLabel = locked ? 'Locked' : !running ? 'Paused' : 'Break';
  const lockColor = locked ? colors.success : !running ? colors.mutedLight : colors.amber;

  // Meta line under the session name, e.g. "Study · 45 min · Pomodoro 2/3".
  const categoryName = nav.user.categories?.find(c => c.id === nav.params.categoryId)?.name || 'Focus';
  const plannedMin   = parseInt(nav.params.plannedDuration ?? '45');
  const metaLine     = [
    categoryName,
    `${plannedMin} min`,
    isPomo ? `Pomodoro ${round}/${maxRounds}` : 'Countdown',
  ].join('  ·  ');

  const blockedCount = stCount > 0 ? stCount : blockedApps.length;
  const hasNfc       = nav.userTags.length > 0;

  // Live distraction-risk read-out — grows with elapsed focus time, like the
  // server-side scoring heuristic.
  const riskLevel = !running
    ? 'PAUSED'
    : (() => {
        const d = Math.floor(focusElapsedSecs() / 60 / 20);
        return d <= 0 ? 'LOW' : d === 1 ? 'MEDIUM' : 'HIGH';
      })();

  return (
    <View style={styles.screen}>

      <View style={styles.topBar}>
        <Text style={styles.modeLabel}>FOCUS MODE</Text>
        <View style={styles.lockWrap}>
          <View style={[styles.lockDot, { backgroundColor: lockColor }]} />
          <Text style={[styles.lockLabel, { color: lockColor }]}>{lockLabel}</Text>
        </View>
      </View>

      <View style={styles.center}>
        <CircularProgress
          progress={progress}
          size={250}
          strokeWidth={4}
          color={RING_ARC}
          trackColor={RING_TRACK}
          style={styles.ring}
        >
          <Animated.Text style={[styles.timerText, { transform: [{ scale: tickAnim }] }]}>
            {fmt(remaining)}
          </Animated.Text>
          <Text style={styles.timerSub}>
            {remaining === 0 ? 'COMPLETE' : phase === 'break' ? 'BREAK' : 'REMAINING'}
          </Text>
        </CircularProgress>

        <Text style={styles.sessionName}>{sessionName}</Text>
        <Text style={styles.metaLine}>{metaLine}</Text>

        {isPomo && maxRounds > 1 && (
          <View style={styles.dotsRow}>
            {Array.from({ length: maxRounds }).map((_, i) => (
              <View key={i} style={[styles.dot, i < round ? styles.dotFilled : styles.dotEmpty]} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.bottom}>
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={styles.pausePill}
            onPress={() => { hLight(); setRunning(r => !r); }}
            activeOpacity={0.8}
            disabled={remaining === 0}
          >
            <Ionicons name={running ? 'pause' : 'play'} size={13} color={colors.white} />
            <Text style={styles.pausePillText}>{running ? 'Pause' : 'Resume'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.stopPill}
            onPress={() => { hMedium(); hasNfc ? openNfcEndModal() : confirmEnd(); }}
            activeOpacity={0.8}
          >
            <Ionicons name="stop" size={13} color={colors.danger} />
            <Text style={styles.stopPillText}>Stop</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.blockedCard}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.mutedLight} style={styles.blockedIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.blockedTitle}>
              {blockedCount > 0 ? `${blockedCount} apps blocked` : 'Screen Time shield'}
            </Text>
            <Text style={styles.blockedSub}>
              {hasNfc ? 'NFC tag required to stop' : 'Shielded during focus'}
            </Text>
          </View>
        </View>

        <View style={styles.riskRow}>
          <Text style={styles.riskLabel}>DISTRACTION RISK</Text>
          <Text style={styles.riskValue}>{riskLevel}</Text>
        </View>
      </View>

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
                <Text style={styles.modalSub}>Scan your registered NFC tag to end this session.</Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={dismissNfcModal}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {nfcPhase === 'unregistered' && (
              <>
                <View style={styles.modalWarnIcon}>
                  <Ionicons name="alert-circle" size={48} color="#313852" />
                </View>
                <Text style={styles.modalTitle}>Unknown Tag</Text>
                <Text style={styles.modalSub}>
                  This tag isn't registered to your account.
                </Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={dismissNfcModal}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSkipBtn} onPress={() => { setNfcPhase('scanning'); openNfcEndModal(); }}>
                    <Text style={styles.modalSkipText}>Try Again</Text>
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
    flex: 1, backgroundColor: SLATE,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    paddingHorizontal: spacing.xl,
  },

  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeLabel:  { fontSize: fontSize.xs, fontWeight: '600', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.5 },
  lockWrap:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockDot:    { width: 7, height: 7, borderRadius: 4 },
  lockLabel:  { fontSize: fontSize.sm, fontWeight: '500' },

  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring:       { marginBottom: spacing.xxxl },
  timerText:  { fontSize: 52, fontWeight: '700', color: colors.white, letterSpacing: 1 },
  timerSub:   { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginTop: 6 },

  sessionName:{ fontSize: fontSize.xxl, fontWeight: '700', color: colors.white, marginTop: spacing.xs },
  metaLine:   { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.55)', marginTop: spacing.sm },

  dotsRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  dot:        { width: 9, height: 9, borderRadius: 5 },
  dotFilled:  { backgroundColor: colors.white },
  dotEmpty:   { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },

  bottom:     { alignSelf: 'stretch' },
  controlRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.xl },
  pausePill:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: spacing.xl,
    borderRadius: radii.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  pausePillText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600' },
  stopPill:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: spacing.xl,
    borderRadius: radii.full, borderWidth: 1, borderColor: '#ff0000',
  },
  stopPillText: { color: "#ff0000", fontSize: fontSize.sm, fontWeight: '600' },

  blockedCard: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: radii.lg,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
  },
  blockedIcon:  { marginRight: spacing.md },
  blockedTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.white },
  blockedSub:   { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.5)', marginTop: 3 },

  riskRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl },
  riskLabel: { fontSize: fontSize.xs, fontWeight: '600', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.2 },
  riskValue: { fontSize: fontSize.xs, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.2 },

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
