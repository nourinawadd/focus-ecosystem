// frontend/screens/ChangePasswordScreen.tsx
// Authenticated change-password, reached from Profile. POSTs
// /auth/change-password with the current + new password. The backend revokes
// all existing sessions and returns a fresh token pair, which we swap in so
// this device stays signed in while other devices are logged out.
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import { apiFetch, setTokens } from '../api/client';

const MIN_PASSWORD = 8;

export default function ChangePasswordScreen({ nav }: { nav: NavProps }) {
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    if (!current)                    { setError('Enter your current password'); return; }
    if (next.length < MIN_PASSWORD)  { setError(`New password must be at least ${MIN_PASSWORD} characters`); return; }
    if (next === current)            { setError('New password must be different from the current one'); return; }
    if (next !== confirm)            { setError('Passwords do not match'); return; }
    setLoading(true);
    setError(null);
    try {
      const { accessToken, refreshToken } = await apiFetch<{
        accessToken: string; refreshToken: string; user: any;
      }>('/auth/change-password', null, {
        method: 'POST',
        body:   JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      // Swap in the fresh pair so this device isn't logged out by the revocation.
      await setTokens({ accessToken, refreshToken });
      nav.setToken(accessToken);
      Alert.alert('Password changed', 'Your password has been updated. Other devices have been signed out.');
      nav.navigate('Profile');
    } catch (e: any) {
      setError(e.message ?? 'Could not change your password. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => nav.navigate('Profile')}>
            <Ionicons name="chevron-back" size={24} color="#313852" />
          </TouchableOpacity>
          <Text style={styles.title}>Change Password</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.subtitle}>
          Choose a strong new password. Changing it signs you out everywhere else.
        </Text>

        {error && <Text style={styles.apiError}>{error}</Text>}

        <Text style={styles.label}>CURRENT PASSWORD</Text>
        <TextInput
          style={styles.input}
          placeholder="Current password" placeholderTextColor="#C3CAD4"
          value={current} onChangeText={setCurrent} secureTextEntry autoFocus
          textContentType="password" autoComplete="current-password" autoCapitalize="none" autoCorrect={false}
        />

        <Text style={styles.label}>NEW PASSWORD</Text>
        <TextInput
          style={styles.input}
          placeholder="At least 8 characters" placeholderTextColor="#C3CAD4"
          value={next} onChangeText={setNext} secureTextEntry
          textContentType="newPassword" autoComplete="new-password" autoCapitalize="none" autoCorrect={false}
        />

        <Text style={styles.label}>CONFIRM NEW PASSWORD</Text>
        <TextInput
          style={styles.input}
          placeholder="Re-enter new password" placeholderTextColor="#C3CAD4"
          value={confirm} onChangeText={setConfirm} secureTextEntry
          textContentType="newPassword" autoComplete="new-password" autoCapitalize="none" autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={submit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Updating…' : 'Update password'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:           { flex: 1, backgroundColor: '#F6F7F1' },
  container:      { padding: 28, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 40 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backBtn:        { width: 40, height: 40, justifyContent: 'center' },
  title:          { fontSize: 20, fontWeight: '700', color: '#313852' },
  headerSpacer:   { width: 40 },
  subtitle:       { fontSize: 14, color: '#2F2F2F', marginBottom: 24, lineHeight: 21 },
  apiError:       { color: '#2F2F2F', fontSize: 13, marginBottom: 16, padding: 10, backgroundColor: '#C3CAD4', borderRadius: 8 },
  label:          { fontSize: 11, fontWeight: '600', color: '#2F2F2F', letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  input:          { borderWidth: 1, borderColor: '#C3CAD4', borderRadius: 10, padding: 14, fontSize: 15, color: '#313852', marginBottom: 12 },
  button:         { backgroundColor: '#313852', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#fff', fontSize: 16, fontWeight: '600' },
});
