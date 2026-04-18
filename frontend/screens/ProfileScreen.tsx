import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { NavProps } from '../App';

export default function ProfileScreen({ nav }: { nav: NavProps }) {
  const name = nav.params.name ?? 'User';
  const email = nav.params.email ?? '';
  const initial = name.charAt(0).toUpperCase();

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
        <Text style={styles.name}>{name}</Text>
        {email ? <Text style={styles.email}>{email}</Text> : null}
      </View>

      {/* Info Cards */}
      <Text style={styles.sectionLabel}>ACCOUNT INFO</Text>

      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Full Name</Text>
          <Text style={styles.infoValue}>{name}</Text>
        </View>
        <View style={styles.rowDivider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{email || '—'}</Text>
        </View>
        <View style={styles.rowDivider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Member Since</Text>
          <Text style={styles.infoValue}>April 2025</Text>
        </View>
      </View>

      {/* Stats */}
      <Text style={styles.sectionLabel}>MY STATS</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>24</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>48h</Text>
          <Text style={styles.statLabel}>Total Focus</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>12d</Text>
          <Text style={styles.statLabel}>Best Streak</Text>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={() => nav.replace('Login')}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  menuBtn: { width: 40, height: 40, justifyContent: 'center' },
  menuLine: { width: 22, height: 2.5, backgroundColor: '#111', borderRadius: 2, marginBottom: 5 },
  title: { fontSize: 20, fontWeight: '700', color: '#111' },
  headerSpacer: { width: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatar: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: '#111', justifyContent: 'center',
    alignItems: 'center', marginBottom: 14,
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4 },
  email: { fontSize: 14, color: '#888' },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#888',
    letterSpacing: 1.2, marginBottom: 10, marginTop: 4,
  },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 20, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  rowDivider: { height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 16 },
  infoLabel: { fontSize: 14, color: '#888', fontWeight: '500' },
  infoValue: { fontSize: 14, color: '#111', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },
  logoutBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e53935', backgroundColor: '#fff',
  },
  logoutText: { color: '#e53935', fontSize: 16, fontWeight: '600' },
});
