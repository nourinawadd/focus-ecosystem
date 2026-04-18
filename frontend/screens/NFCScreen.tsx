import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Easing, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';

type Phase = 'scanning' | 'success' | 'error';

export default function NFCScreen({ nav }: { nav: NavProps }) {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [tagId, setTagId] = useState('');

  // Pulsing ring animations (scanning phase)
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.45)).current;
  const opacity2 = useRef(new Animated.Value(0.25)).current;
  const scanLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Success animations
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  // ── Scanning pulse loop ──────────────────────────────────────────────────
  const startPulse = () => {
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
    const a1 = ring(pulse1, opacity1, 0);
    const a2 = ring(pulse2, opacity2, 750);
    scanLoop.current = Animated.parallel([a1 as any, a2 as any]);
    a1.start();
    a2.start();
  };

  const stopPulse = () => {
    pulse1.stopAnimation();
    pulse2.stopAnimation();
  };

  useEffect(() => {
    startPulse();
    return () => stopPulse();
  }, []);

  // ── Success animation sequence ───────────────────────────────────────────
  const playSuccess = (id: string) => {
    stopPulse();
    setTagId(id);
    setPhase('success');
    Animated.sequence([
      Animated.parallel([
        Animated.spring(successScale,  { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
      Animated.delay(300),
      Animated.spring(checkScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
    ]).start(() => {
      // Navigate after a short pause so user can see the confirmation
      setTimeout(() => nav.navigate('ActiveSession', { ...nav.params, nfcTag: id }), 900);
    });
  };

  // ── Simulate a successful NFC scan (used by the tap-target button) ───────
  const simulateScan = () => {
    if (phase !== 'scanning') return;
    const fakeId = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()
    ).join(':');
    playSuccess(fakeId);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        {phase === 'scanning' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => nav.navigate('CreateSession')}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        {phase === 'scanning' ? (
          <>
            {/* Tap-target: pulsing rings + center disc */}
            <TouchableOpacity activeOpacity={0.85} onPress={simulateScan} style={styles.ringContainer}>
              <Animated.View style={[styles.ring, { transform: [{ scale: pulse1 }], opacity: opacity1 }]} />
              <Animated.View style={[styles.ring, { transform: [{ scale: pulse2 }], opacity: opacity2 }]} />
              <View style={styles.centerCircle}>
                <Ionicons name="radio-outline" size={34} color="#fff" />
                <Text style={styles.tapHint}>TAP</Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.heading}>Hold NFC tag to phone</Text>
            <Text style={styles.subtext}>
              Bring your NFC card or tag close to the{'\n'}
              top of your iPhone to link it to this session.
            </Text>

            <View style={styles.statusRow}>
              <Animated.View style={[styles.statusDot, styles.dotScanning]} />
              <Text style={styles.statusText}>Scanning for NFC tag…</Text>
            </View>
          </>
        ) : (
          <>
            {/* Success state */}
            <Animated.View style={[styles.successCircle, { transform: [{ scale: successScale }], opacity: successOpacity }]}>
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <Ionicons name="checkmark" size={60} color="#fff" />
              </Animated.View>
            </Animated.View>

            <Text style={styles.heading}>Tag Connected!</Text>
            <Text style={styles.subtext}>
              NFC tag detected successfully.{'\n'}Starting your session…
            </Text>
            <View style={styles.tagIdRow}>
              <Text style={styles.tagIdLabel}>Tag ID</Text>
              <Text style={styles.tagIdValue}>{tagId}</Text>
            </View>
          </>
        )}
      </View>

      {/* Skip — only shown while scanning */}
      {phase === 'scanning' && (
        <TouchableOpacity style={styles.skipBtn} onPress={() => nav.navigate('ActiveSession', nav.params)}>
          <Text style={styles.skipText}>Start without NFC</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5', alignItems: 'center' },
  header: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 20, paddingBottom: 8, minHeight: 90,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },

  // ── Scanning ──
  ringContainer: {
    width: 220, height: 220,
    alignItems: 'center', justifyContent: 'center', marginBottom: 44,
  },
  ring: {
    position: 'absolute',
    width: 170, height: 170, borderRadius: 85,
    backgroundColor: '#111',
  },
  centerCircle: {
    width: 108, height: 108, borderRadius: 54,
    backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 2,
  },

  tapHint: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 12 },
  subtext: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotScanning: { backgroundColor: '#F5A623' },
  statusText: { fontSize: 14, color: '#555', fontWeight: '500' },

  // ── Success ──
  successCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center', marginBottom: 36,
  },

  tagIdRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#e8e8e8', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 16, marginTop: 6,
  },
  tagIdLabel: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8 },
  tagIdValue: { fontSize: 13, fontWeight: '700', color: '#111', fontVariant: ['tabular-nums'] },

  // ── Skip ──
  skipBtn: { paddingBottom: 52, paddingTop: 16 },
  skipText: { fontSize: 15, color: '#999', fontWeight: '500', textDecorationLine: 'underline' },
});
