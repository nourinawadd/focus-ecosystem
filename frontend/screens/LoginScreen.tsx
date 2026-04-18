import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';

type Errors = { email?: string; password?: string };

export default function LoginScreen({ nav }: { nav: NavProps }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const validate = (): boolean => {
    const e: Errors = {};
    if (!email) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = () => {
    if (validate()) {
      const name = email.split('@')[0];
      const formatted = name.charAt(0).toUpperCase() + name.slice(1);
      // Sync name + email into the centralised UserProfile before navigating
      nav.updateUser({ name: formatted, email });
      nav.replace('Dashboard', { name: formatted, email });
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.logoRow}>
          <View style={styles.logoCircle} />
          <Text style={styles.logoText}>FocusLock</Text>
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue your focus journey</Text>

        <Text style={styles.label}>EMAIL</Text>
        <TextInput
          style={[styles.input, errors.email && styles.inputError]}
          placeholder="alex@university.edu" placeholderTextColor="#bbb"
          value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none"
        />
        {errors.email && <Text style={styles.error}>{errors.email}</Text>}

        <Text style={styles.label}>PASSWORD</Text>
        <TextInput
          style={[styles.input, errors.password && styles.inputError]}
          placeholder="••••••" placeholderTextColor="#bbb"
          value={password} onChangeText={setPassword}
          secureTextEntry
        />
        {errors.password && <Text style={styles.error}>{errors.password}</Text>}

        <TouchableOpacity style={styles.forgotRow} onPress={() => {}}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.socialBtn}>
            <View style={styles.socialContent}>
              <Ionicons name="logo-google" size={17} color="#111" />
              <Text style={styles.socialText}>Google</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.socialBtn}>
            <View style={styles.socialContent}>
              <Ionicons name="logo-apple" size={18} color="#111" />
              <Text style={styles.socialText}>Apple</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => nav.navigate('SignUp')}>
          <Text style={styles.link}>
            Don't have an account? <Text style={styles.linkBold}>Sign up</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 28, paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingBottom: 40 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 36 },
  logoCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#111', marginRight: 8 },
  logoText: { fontSize: 18, fontWeight: '700', color: '#111' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 32 },
  label: { fontSize: 11, fontWeight: '600', color: '#888', letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, padding: 14, fontSize: 15, color: '#111', marginBottom: 4 },
  inputError: { borderColor: '#e53935' },
  error: { color: '#e53935', fontSize: 12, marginBottom: 6 },
  forgotRow: { alignItems: 'flex-end', marginBottom: 8 },
  forgotText: { fontSize: 13, color: '#555', fontWeight: '500' },
  button: { backgroundColor: '#111', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 24 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e0e0e0' },
  dividerText: { fontSize: 11, color: '#aaa', marginHorizontal: 10, letterSpacing: 0.5 },
  socialRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  socialBtn: { flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  socialContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  socialText: { fontSize: 14, fontWeight: '500', color: '#111' },
  link: { textAlign: 'center', fontSize: 14, color: '#888' },
  linkBold: { fontWeight: '600', color: '#111' },
});
