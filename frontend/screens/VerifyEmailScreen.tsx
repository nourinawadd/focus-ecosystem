// frontend/screens/VerifyEmailScreen.tsx
// Entered after sign-up (or a login that returns EMAIL_UNVERIFIED): the user
// types the 6-digit code from their inbox; success returns the same token pair
// as /login and flows straight into the Dashboard.
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { NavProps } from '../App';
import { apiFetch, setTokens } from '../api/client';

const RESEND_SECONDS = 60;

export default function VerifyEmailScreen({ nav }: { nav: NavProps }) {
  const email = nav.params.email ?? '';

  const [code,     setCode]     = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [info,     setInfo]     = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);   // a code was just sent

  // Tick the resend cooldown down once per second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async () => {
    if (loading || code.trim().length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const { accessToken, refreshToken, user } = await apiFetch<{
        accessToken: string; refreshToken: string; user: any;
      }>('/auth/verify-email', null, {
        method: 'POST',
        body:   JSON.stringify({ email, code: code.trim() }),
      });
      await setTokens({ accessToken, refreshToken });
      nav.setToken(accessToken);
      nav.updateUser({ name: user.name, email: user.email });
      nav.replace('Dashboard', { name: user.name, email: user.email });
    } catch (e: any) {
      setError(e.message ?? 'Verification failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setError(null);
    setInfo(null);
    try {
      await apiFetch('/auth/resend-code', null, {
        method: 'POST',
        body:   JSON.stringify({ email }),
      });
      setInfo('A new code is on its way — check your inbox (and spam).');
      setCooldown(RESEND_SECONDS);
      setCode('');
    } catch (e: any) {
      setError(e.message ?? 'Could not resend the code.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.logoRow}>
          <View style={styles.logoCircle} />
          <Text style={styles.logoText}>FocusLock</Text>
        </View>

        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.emailText}>{email}</Text>
        </Text>

        {error && <Text style={styles.apiError}>{error}</Text>}
        {info  && <Text style={styles.infoBox}>{info}</Text>}

        <Text style={styles.label}>VERIFICATION CODE</Text>
        <TextInput
          style={styles.codeInput}
          placeholder="••••••" placeholderTextColor="#C3CAD4"
          value={code}
          onChangeText={t => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, (loading || code.length !== 6) && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading || code.length !== 6}
        >
          <Text style={styles.buttonText}>{loading ? 'Verifying…' : 'Verify'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleResend} disabled={cooldown > 0}>
          <Text style={[styles.link, cooldown > 0 && styles.linkDisabled]}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => nav.navigate('Login')}>
          <Text style={styles.link}>
            Wrong email? <Text style={styles.linkBold}>Back to sign in</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:           { flex: 1, backgroundColor: '#F6F7F1' },
  container:      { padding: 28, paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingBottom: 40 },
  logoRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 36 },
  logoCircle:     { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#313852', marginRight: 8 },
  logoText:       { fontSize: 18, fontWeight: '700', color: '#313852' },
  title:          { fontSize: 28, fontWeight: 'bold', color: '#313852', marginBottom: 6 },
  subtitle:       { fontSize: 14, color: '#2F2F2F', marginBottom: 28, lineHeight: 21 },
  emailText:      { color: '#313852', fontWeight: '600' },
  apiError:       { color: '#2F2F2F', fontSize: 13, marginBottom: 16, padding: 10, backgroundColor: '#C3CAD4', borderRadius: 8 },
  infoBox:        { color: '#313852', fontSize: 13, marginBottom: 16, padding: 10, backgroundColor: '#C3CAD4', borderRadius: 8 },
  label:          { fontSize: 11, fontWeight: '600', color: '#2F2F2F', letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  codeInput:      {
    borderWidth: 1, borderColor: '#C3CAD4', borderRadius: 10, padding: 14,
    fontSize: 26, fontWeight: '700', color: '#313852', letterSpacing: 12,
    textAlign: 'center', marginBottom: 16,
  },
  button:         { backgroundColor: '#313852', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 24 },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: '#fff', fontSize: 16, fontWeight: '600' },
  link:           { textAlign: 'center', fontSize: 14, color: '#2F2F2F', marginBottom: 14 },
  linkDisabled:   { color: '#C3CAD4' },
  linkBold:       { fontWeight: '600', color: '#313852' },
});
