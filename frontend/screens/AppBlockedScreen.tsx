import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  ImageBackground, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps, ScreenName } from '../App';
import { initNFC, readTag, cancelScan, isNFCSupported } from '../utils/nfc';

const BG = require('../assets/stay focused.png');

function fmtClock(secs: number) {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

export default function AppBlockedScreen({ nav }: { nav: NavProps }) {
  const appName     = nav.params.appName     ?? 'Instagram';
  const sessionName = nav.params.sessionName ?? 'Deep Work';
  const elapsedMins = parseInt(nav.params.elapsedMinutes ?? '23', 10);
  const unlockTo    = (nav.params.unlockTo as ScreenName) ?? 'Dashboard';

  const [remaining, setRemaining] = useState(
    parseInt(nav.params.remainingSeconds ?? String(23 * 60 + 47), 10),
  );
  const [scanning, setScanning] = useState(false);

  // Live countdown.
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining]);

  useEffect(() => () => cancelScan(), []);

  const unlock = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const supported = await isNFCSupported();
      if (!supported) {
        Alert.alert('NFC unavailable', 'NFC is not supported on this device.');
        return;
      }
      await initNFC();
      const uid = await readTag();
      const match = nav.userTags.find(t => t.tagId.uid === uid);
      if (!match) {
        Alert.alert('Unknown tag', "This tag isn't registered to your account.");
        return;
      }
      nav.navigate(unlockTo, nav.params);
    } catch (e: any) {
      const msg: string = e?.message ?? String(e) ?? '';
      if (!/cancel/i.test(msg)) {
        Alert.alert('Scan failed', msg || 'Something went wrong. Try again.');
      }
    } finally {
      cancelScan();
      setScanning(false);
    }
  };

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.scrim} />

      <View style={styles.body}>
        <View style={styles.lockCircle}>
          <Ionicons name="lock-closed-outline" size={50} color="#fff" />
        </View>

        <Text style={styles.title}>{appName} is blocked</Text>
        <Text style={styles.subtitle}>
          Stay focused. You're {elapsedMins} minute{elapsedMins === 1 ? '' : 's'}{'\n'}
          into your {sessionName} session.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>TIME REMAINING</Text>
          <Text style={styles.cardTime}>{fmtClock(remaining)}</Text>
        </View>

        <Text style={styles.hint}>Tap your NFC tag to unlock</Text>
      </View>

      <TouchableOpacity
        style={styles.unlockBar}
        onPress={unlock}
        activeOpacity={0.85}
        disabled={scanning}
      >
        {scanning ? (
          <ActivityIndicator color="#313852" />
        ) : (
          <View style={styles.unlockInner}>
            <Ionicons name="radio-outline" size={20} color="#313852" />
            <Text style={styles.unlockText}>Tap to scan</Text>
          </View>
        )}
      </TouchableOpacity>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg:    { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,18,28,0.18)' },

  body: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36,
    // nudge content up to leave room for the bottom unlock bar
    paddingBottom: 120,
  },

  lockCircle: {
    width: 132, height: 132, borderRadius: 66,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 34,
  },

  title: {
    fontSize: 26, fontWeight: '700', color: '#fff',
    textAlign: 'center', marginBottom: 14,
  },
  subtitle: {
    fontSize: 15, color: 'rgba(255,255,255,0.78)',
    textAlign: 'center', lineHeight: 22, marginBottom: 34,
  },

  card: {
    alignSelf: 'stretch',
    borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 22, paddingHorizontal: 20,
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.6, marginBottom: 8,
  },
  cardTime: {
    fontSize: 40, fontWeight: '700', color: '#fff',
    letterSpacing: -0.5, fontVariant: ['tabular-nums'],
  },

  hint: {
    fontSize: 14, color: 'rgba(255,255,255,0.72)',
    textAlign: 'center', marginTop: 30,
  },

  unlockBar: {
    position: 'absolute',
    left: 28, right: 28,
    bottom: Platform.OS === 'ios' ? 44 : 28,
    height: 58, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  unlockInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unlockText:  { fontSize: 15, fontWeight: '600', color: '#313852' },
});
