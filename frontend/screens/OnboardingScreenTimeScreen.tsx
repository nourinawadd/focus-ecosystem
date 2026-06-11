// frontend/screens/OnboardingScreenTimeScreen.tsx
// Permission-priming step, shown once per device after sign-in (iOS only,
// while Screen Time authorization is still notDetermined): explains WHY
// Anchor wants the access *before* triggering Apple's Family Controls dialog,
// which is intimidating without context. Designed as a standalone onboarding
// step so it can slot into the future post-install onboarding carousel.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import { requestAuthorization } from 'anchor-screen-time';

// Set on grant, deny, or skip — the screen appears at most once per device.
// (Reinstalling the app clears it, matching a fresh onboarding run.)
export const SCREEN_TIME_ONBOARDING_KEY = 'onboarding.screenTime.seen';

export default function OnboardingScreenTimeScreen({ nav }: { nav: NavProps }) {
  const [busy,   setBusy]   = useState(false);
  const [denied, setDenied] = useState(false);

  const markSeen = () => AsyncStorage.setItem(SCREEN_TIME_ONBOARDING_KEY, 'seen').catch(() => {});

  const finish = async () => {
    await markSeen();
    nav.replace('Dashboard');
  };

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const status = await requestAuthorization();
      if (status === 'approved') {
        await finish();
        return;
      }
      // Denied (or iCloud not signed in). Denial is sticky at the OS level —
      // re-asking won't re-prompt — so show the Settings hint and let them
      // continue; CreateSession remains the late-grant fallback.
      await markSeen();
      setDenied(true);
    } catch {
      await markSeen();
      setDenied(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="shield-half-outline" size={44} color="#fff" />
        </View>

        <Text style={styles.title}>Block distractions{'\n'}automatically</Text>
        <Text style={styles.body}>
          During focus sessions, Anchor shields the apps you choose — opening
          them shows a block screen until your session ends.
        </Text>
        <Text style={styles.body}>
          To do this, iOS will ask you to allow <Text style={styles.bold}>Screen Time
          access</Text>. The system dialog mentions “Family Controls” — that's
          just Apple's name for the underlying feature.
        </Text>

        {denied && (
          <Text style={styles.deniedNote}>
            No problem — you can enable it anytime in iOS Settings, or when you
            set up app blocking in your first session.
          </Text>
        )}
      </View>

      <View style={styles.footer}>
        {denied ? (
          <TouchableOpacity style={styles.button} onPress={finish}>
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={handleEnable}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{busy ? 'Waiting for iOS…' : 'Enable App Blocking'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={finish} disabled={busy}>
              <Text style={styles.skipText}>Maybe later</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#fff', padding: 28, paddingTop: Platform.OS === 'ios' ? 70 : 50 },
  content:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  iconCircle:     {
    width: 96, height: 96, borderRadius: 48, backgroundColor: '#111',
    alignItems: 'center', justifyContent: 'center', marginBottom: 32,
  },
  title:          { fontSize: 28, fontWeight: 'bold', color: '#111', textAlign: 'center', marginBottom: 16, lineHeight: 34 },
  body:           { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 14, maxWidth: 320 },
  bold:           { fontWeight: '600', color: '#111' },
  deniedNote:     {
    fontSize: 13, color: '#8a6d00', textAlign: 'center', lineHeight: 19,
    backgroundColor: '#fff8e1', borderRadius: 10, padding: 12, marginTop: 6, maxWidth: 320,
  },
  footer:         { paddingBottom: 24 },
  button:         { backgroundColor: '#111', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 14 },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#fff', fontSize: 16, fontWeight: '600' },
  skipText:       { textAlign: 'center', fontSize: 14, color: '#888', paddingVertical: 6 },
});
