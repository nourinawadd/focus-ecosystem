import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Alert } from 'react-native';
import { NavProps } from '../App';
import { apiFetch } from '../api/client';
import { computeFocusHours, computeLongestStreak } from '../store/sessions';

export default function ProfileScreen({ nav }: { nav: NavProps }) {
  const { user, sessions } = nav;
  const initial = user.name.charAt(0).toUpperCase();

  const deleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch('/user/me', nav.token, { method: 'DELETE' });
              nav.signOut();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to delete account. Please try again.');
            }
          },
        },
      ],
    );
  };

  const totalSessions  = sessions.length;
  const focusHours     = computeFocusHours(sessions);
  const longestStreak  = computeLongestStreak(sessions);

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={nav.openDrawer}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        {user.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </View>

      {/* Info Cards */}
      <Text style={styles.sectionLabel}>ACCOUNT INFO</Text>

      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Full Name</Text>
          <Text style={styles.infoValue}>{user.name}</Text>
        </View>
        <View style={styles.rowDivider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user.email || '—'}</Text>
        </View>
        <View style={styles.rowDivider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Member Since</Text>
          <Text style={styles.infoValue}>{memberSince}</Text>
        </View>
      </View>

      {/* Stats */}
      <Text style={styles.sectionLabel}>MY STATS</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalSessions}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{focusHours}h</Text>
          <Text style={styles.statLabel}>Total Focus</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{longestStreak}d</Text>
          <Text style={styles.statLabel}>Best Streak</Text>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={nav.signOut}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      {/* Delete account */}
      <TouchableOpacity style={styles.deleteBtn} onPress={deleteAccount}>
        <Text style={styles.deleteText}>Delete Account</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4f4f4' },
  container: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  menuBtn: { width: 40, height: 40, justifyContent: 'center' },
  menuLine: { width: 22, height: 2.5, backgroundColor: '#313852', borderRadius: 2, marginBottom: 5 },
  title: { fontSize: 20, fontWeight: '700', color: '#313852' },
  headerSpacer: { width: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatar: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: '#313852', justifyContent: 'center',
    alignItems: 'center', marginBottom: 14,
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: '#313852', marginBottom: 4 },
  email: { fontSize: 14, color: '#2F2F2F' },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#2F2F2F',
    letterSpacing: 1.2, marginBottom: 10, marginTop: 4,
  },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 20, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  rowDivider: { height: 1, backgroundColor: '#C3CAD4', marginHorizontal: 16 },
  infoLabel: { fontSize: 14, color: '#2F2F2F', fontWeight: '500' },
  infoValue: { fontSize: 14, color: '#313852', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#313852', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#2F2F2F', textAlign: 'center' },
  logoutBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#ff0000', backgroundColor: '#fff',
  },
  logoutText: { color: '#ff0000', fontSize: 16, fontWeight: '600' },
  deleteBtn: { alignItems: 'center', paddingVertical: 16, marginTop: 6 },
  deleteText: { color: '#ff0000', fontSize: 14, fontWeight: '600' },
});
