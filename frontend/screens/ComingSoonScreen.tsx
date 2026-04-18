import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps, ScreenName } from '../App';

const SCREEN_LABELS: Record<string, string> = {
  CreateSession: 'Create Session',
  History:       'History',
  Analytics:     'Analytics',
  AIInsights:    'AI Insights',
  NFCSetup:      'NFC Setup',
};

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const SCREEN_ICONS: Record<string, IoniconsName> = {
  CreateSession: 'timer-outline',
  History:       'document-text-outline',
  Analytics:     'stats-chart-outline',
  AIInsights:    'hardware-chip-outline',
  NFCSetup:      'radio-outline',
};

export default function ComingSoonScreen({ nav, screen }: { nav: NavProps; screen: ScreenName }) {
  const label = SCREEN_LABELS[screen] ?? screen;
  const icon  = SCREEN_ICONS[screen] ?? 'construct-outline';

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={nav.openDrawer}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </TouchableOpacity>
        <Text style={styles.title}>{label}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Coming soon content */}
      <View style={styles.body}>
        <Ionicons name={icon} size={56} color="#111" style={styles.iconWrap} />
        <Text style={styles.heading}>{label}</Text>
        <Text style={styles.subtext}>This feature is coming soon.{'\n'}We're working hard to build it for you.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => nav.navigate('Dashboard')}>
          <Text style={styles.backBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 16,
    backgroundColor: '#f5f5f5',
  },
  menuBtn: { width: 40, height: 40, justifyContent: 'center' },
  menuLine: { width: 22, height: 2.5, backgroundColor: '#111', borderRadius: 2, marginBottom: 5 },
  title: { fontSize: 20, fontWeight: '700', color: '#111' },
  headerSpacer: { width: 40 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  iconWrap: { marginBottom: 20 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 12, textAlign: 'center' },
  subtext: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22, marginBottom: 36 },
  backBtn: {
    backgroundColor: '#111', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32,
  },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
