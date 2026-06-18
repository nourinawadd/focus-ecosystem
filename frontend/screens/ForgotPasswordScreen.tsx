// frontend/screens/ForgotPasswordScreen.tsx
// Forgot-password flow in one screen, two phases:
//   1. 'email' — enter the account email; we POST /auth/forgot-password.
//   2. 'reset' — enter the emailed 6-digit code + a new password; we POST
//      /auth/reset-password, which (on success) returns the same token pair as
//      /login and flows straight into the Dashboard.
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { NavProps } from '../App';
import { apiFetch, setTokens } from '../api/client';

const RESEND_SECONDS = 60;
const MIN_PASSWORD   = 8;

export default function ForgotPasswordScreen({ nav }: { nav: NavProps }) {
  const [phase,    setPhase]    = useState<'email' | 'reset'>('email');
  const [email,    setEmail]    = useState(nav.params.email ?? '');
  const [code,     setCode]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');

  const [error,    setError]    = useState<string | null>(null);
  const [info,     setInfo]     = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Tick the resend cooldown down once per second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const validEmail = /\S+@\S+\.\S+/.test(email.trim());

  // Phase 1 (and resend): request a reset code. The backend 404s with NO_ACCOUNT
  // when the email isn't registered (we surface that and stay put); a 429 means a
  // code was already sent recently, so we still advance to let them enter it.
  const requestCode = async (isResend = false) => {
    if (loading) return;
    if (!validEmail) { setError('Enter a valid email address'); return; }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await apiFetch('/auth/forgot-password', null, {
        method: 'POST',
        body:   JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setPhase('reset');
      setCooldown(RESEND_SECONDS);
      setInfo(isResend
        ? 'A new code is on its way — check your inbox (and spam).'
        : 'A 6-digit code is on its way — check your inbox (and spam).');
    } catch (e: any) {
      if (e.status === 429) {
        // A code was already sent within the cooldown — let them enter it.
        setPhase('reset');
        setInfo('A code was already sent recently — check your inbox (and spam).');
      } else {
        // NO_ACCOUNT (404) and other errors: surface and stay on the email step.
        setError(e.message ?? 'Could not send the code. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Phase 2: verify the code + set the new password, then auto-login.
  const submitReset = async () => {
    if (loading) return;
    if (code.trim().length !== 6)        { setError('Enter the 6-digit code'); return; }
    if (password.length < MIN_PASSWORD)  { setError(`Password must be at least ${MIN_PASSWORD} characters`); return; }
    if (password !== confirm)            { setError('Passwords do not match'); return; }
    setLoading(true);
    setError(null);
    try {
      const { accessToken, refreshToken, user } = await apiFetch<{
        accessToken: string; refreshToken: string; user: any;
      }>('/auth/reset-password', null, {
        method: 'POST',
        body:   JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim(), newPassword: password }),
      });
      await setTokens({ accessToken, refreshToken });
      nav.setToken(accessToken);
      nav.updateUser({ name: user.name, email: user.email, hasPassword: user.hasPassword });
      nav.replace('Dashboard', { name: user.name, email: user.email });
    } catch (e: any) {
      if (e.code === 'CODE_EXPIRED' || e.code === 'CODE_LOCKED') {
        setCode('');
        setError(`${e.message} — tap "Resend code".`);
      } else {
        setError(e.message ?? 'Reset failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Image source={require('../assets/anchor-logo.png')} style={styles.logoImg} resizeMode="contain" />
          </View>
          <Image source={require('../assets/anchor-wordmark.png')} style={styles.wordmark} resizeMode="contain" />
        </View>

        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          {phase === 'email'
            ? 'Enter your email and we’ll send you a 6-digit reset code.'
            : <>Enter the code we sent to{'\n'}<Text style={styles.emailText}>{email.trim().toLowerCase()}</Text> and choose a new password.</>}
        </Text>

        {error && <Text style={styles.apiError}>{error}</Text>}
        {info  && <Text style={styles.infoBox}>{info}</Text>}

        {phase === 'email' ? (
          <>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={styles.input}
              placeholder="alex@university.edu" placeholderTextColor="#C3CAD4"
              value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
              textContentType="emailAddress" autoComplete="email" autoFocus
            />

            <TouchableOpacity
              style={[styles.button, (loading || !validEmail) && styles.buttonDisabled]}
              onPress={() => requestCode(false)}
              disabled={loading || !validEmail}
            >
              <Text style={styles.buttonText}>{loading ? 'Sending…' : 'Send reset code'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>VERIFICATION CODE</Text>
            <TextInput
              style={styles.codeInput}
              placeholder="••••••" placeholderTextColor="#C3CAD4"
              value={code}
              onChangeText={t => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad" textContentType="oneTimeCode" autoFocus
            />

            <Text style={styles.label}>NEW PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 8 characters" placeholderTextColor="#C3CAD4"
              value={password} onChangeText={setPassword} secureTextEntry
              textContentType="newPassword" autoComplete="new-password" autoCapitalize="none" autoCorrect={false}
            />

            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="Re-enter new password" placeholderTextColor="#C3CAD4"
              value={confirm} onChangeText={setConfirm} secureTextEntry
              textContentType="newPassword" autoComplete="new-password" autoCapitalize="none" autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={submitReset}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Resetting…' : 'Reset password'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => requestCode(true)} disabled={cooldown > 0 || loading}>
              <Text style={[styles.link, (cooldown > 0 || loading) && styles.linkDisabled]}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => nav.navigate('Login')}>
          <Text style={styles.link}>
            Remembered it? <Text style={styles.linkBold}>Back to sign in</Text>
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
  logoBadge:      { width: 38, height: 38, borderRadius: 19, backgroundColor: '#313852', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  logoImg:        { width: 24, height: 24 },
  wordmark:       { width: 104, height: 30 },
  title:          { fontSize: 28, fontWeight: 'bold', color: '#313852', marginBottom: 6 },
  subtitle:       { fontSize: 14, color: '#2F2F2F', marginBottom: 28, lineHeight: 21 },
  emailText:      { color: '#313852', fontWeight: '600' },
  apiError:       { color: '#2F2F2F', fontSize: 13, marginBottom: 16, padding: 10, backgroundColor: '#C3CAD4', borderRadius: 8 },
  infoBox:        { color: '#313852', fontSize: 13, marginBottom: 16, padding: 10, backgroundColor: '#C3CAD4', borderRadius: 8 },
  label:          { fontSize: 11, fontWeight: '600', color: '#2F2F2F', letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  input:          { borderWidth: 1, borderColor: '#C3CAD4', borderRadius: 10, padding: 14, fontSize: 15, color: '#313852', marginBottom: 12 },
  codeInput:      {
    borderWidth: 1, borderColor: '#C3CAD4', borderRadius: 10, padding: 14,
    fontSize: 26, fontWeight: '700', color: '#313852', letterSpacing: 12,
    textAlign: 'center', marginBottom: 16,
  },
  button:         { backgroundColor: '#313852', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 24 },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: '#fff', fontSize: 16, fontWeight: '600' },
  link:           { textAlign: 'center', fontSize: 14, color: '#2F2F2F', marginBottom: 14 },
  linkDisabled:   { color: '#C3CAD4' },
  linkBold:       { fontWeight: '600', color: '#313852' },
});
