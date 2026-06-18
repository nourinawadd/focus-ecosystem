import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Easing, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import { initNFC, readTag, cancelScan, isNFCSupported } from '../utils/nfc';
import { hSuccess, hWarning, hError } from '../utils/haptics';

type Phase = 'scanning' | 'success' | 'error' | 'unregistered';

export default function NFCScreen({ nav }: { nav: NavProps }) {
  const [phase,   setPhase]   = useState<Phase>('scanning');
  const [tagId,   setTagId]   = useState('');
  const [errMsg,  setErrMsg]  = useState('');

  const pulse1   = useRef(new Animated.Value(1)).current;
  const pulse2   = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.45)).current;
  const opacity2 = useRef(new Animated.Value(0.25)).current;

  const successScale   = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const checkScale     = useRef(new Animated.Value(0)).current;

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
    ring(pulse1, opacity1, 0).start();
    ring(pulse2, opacity2, 750).start();
  };

  const stopPulse = () => {
    pulse1.stopAnimation(); pulse2.stopAnimation();
  };

  const playSuccess = (id: string) => {
    stopPulse();
    hSuccess();
    setTagId(id);
    setPhase('success');
    Animated.sequence([
      Animated.parallel([
        Animated.spring(successScale,   { toValue: 1, friction: 5, tension: 80,  useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
      Animated.delay(300),
      Animated.spring(checkScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => nav.navigate('ActiveSession', { ...nav.params, nfcTag: id }), 900);
    });
  };

  const startScan = async () => {
    setPhase('scanning');
    setErrMsg('');
    startPulse();

    try {
      const supported = await isNFCSupported();
      if (!supported) {
        stopPulse();
        setErrMsg('NFC is not supported on this device.');
        setPhase('error');
        return;
      }

      await initNFC();
      const uid = await readTag();
      stopPulse();

      // Validate against the user's registered tags
      const match = nav.userTags.find(t => t.tagId.uid === uid);
      if (!match) {
        hWarning();
        setTagId(uid);
        setPhase('unregistered');
        return;
      }

      playSuccess(uid);
    } catch (e: any) {
      stopPulse();
      const msg: string = e?.message ?? String(e) ?? '';
      // Treat "user cancelled" as a silent retry; surface everything else.
      if (/cancel/i.test(msg)) {
        setPhase('scanning');
        startPulse();
        return;
      }
      hError();
      setErrMsg(msg || 'NFC scan failed.');
      setPhase('error');
    }
  };

  useEffect(() => {
    startScan();
    return () => cancelScan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {(phase === 'scanning' || phase === 'unregistered' || phase === 'error') && (
          <TouchableOpacity style={styles.backBtn} onPress={() => { cancelScan(); nav.navigate('CreateSession'); }}>
            <Ionicons name="arrow-back" size={24} color="#313852" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        {phase === 'scanning' && (
          <>
            <View style={styles.ringContainer}>
              <Animated.View style={[styles.ring, { transform: [{ scale: pulse1 }], opacity: opacity1 }]} />
              <Animated.View style={[styles.ring, { transform: [{ scale: pulse2 }], opacity: opacity2 }]} />
              <View style={styles.centerCircle}>
                <Ionicons name="radio-outline" size={34} color="#fff" />
                <Text style={styles.tapHint}>SCAN</Text>
              </View>
            </View>
            <Text style={styles.heading}>Hold NFC tag to phone</Text>
            <Text style={styles.subtext}>
              Bring your NFC tag close to the{'\n'}top of your iPhone to link it to this session.
            </Text>
            <View style={styles.statusRow}>
              <Animated.View style={[styles.statusDot, styles.dotScanning]} />
              <Text style={styles.statusText}>Scanning for NFC tag…</Text>
            </View>
          </>
        )}

        {phase === 'success' && (
          <>
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

        {phase === 'unregistered' && (
          <>
            <View style={[styles.successCircle, { backgroundColor: '#313852' }]}>
              <Ionicons name="alert" size={54} color="#fff" />
            </View>
            <Text style={styles.heading}>Unknown Tag</Text>
            <Text style={styles.subtext}>
              This tag isn't registered to your account.{'\n'}
              Register it in Settings → NFC Tags first.
            </Text>
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.retryBtn} onPress={startScan}>
                <Text style={styles.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.setupBtn} onPress={() => { cancelScan(); nav.navigate('NFCSetup', { from: 'CreateSession' }); }}>
                <Text style={styles.setupBtnText}>Set Up Tags</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {phase === 'error' && (
          <>
            <View style={[styles.successCircle, { backgroundColor: '#2F2F2F' }]}>
              <Ionicons name="close" size={54} color="#fff" />
            </View>
            <Text style={styles.heading}>Scan Failed</Text>
            <Text style={styles.subtext}>{errMsg || 'Something went wrong. Try again.'}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={startScan}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F7F1', alignItems: 'center' },
  header: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 20, paddingBottom: 8, minHeight: 90,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },

  ringContainer: {
    width: 220, height: 220,
    alignItems: 'center', justifyContent: 'center', marginBottom: 44,
  },
  ring: {
    position: 'absolute',
    width: 170, height: 170, borderRadius: 85,
    backgroundColor: '#313852',
  },
  centerCircle: {
    width: 108, height: 108, borderRadius: 54,
    backgroundColor: '#313852', alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  tapHint:    { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5 },
  heading:    { fontSize: 24, fontWeight: '700', color: '#313852', textAlign: 'center', marginBottom: 12 },
  subtext:    { fontSize: 15, color: '#2F2F2F', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot:  { width: 8, height: 8, borderRadius: 4 },
  dotScanning:{ backgroundColor: '#313852' },
  statusText: { fontSize: 14, color: '#2F2F2F', fontWeight: '500' },

  successCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#313852',
    alignItems: 'center', justifyContent: 'center', marginBottom: 36,
  },
  tagIdRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#313852', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 16, marginTop: 6,
  },
  tagIdLabel: { fontSize: 12, fontWeight: '600', color: '#2F2F2F', textTransform: 'uppercase', letterSpacing: 0.8 },
  tagIdValue: { fontSize: 13, fontWeight: '700', color: '#313852', fontVariant: ['tabular-nums'] },

  errorActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  retryBtn:     { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#313852' },
  retryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  setupBtn:     { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#313852' },
  setupBtnText: { fontSize: 15, fontWeight: '600', color: '#313852' },

  skipBtn:  { paddingBottom: 52, paddingTop: 16 },
  skipText: { fontSize: 15, color: '#2F2F2F', fontWeight: '500', textDecorationLine: 'underline' },
});
