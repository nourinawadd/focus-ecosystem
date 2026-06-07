import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import { colors, fontSize, spacing, radii } from '../constants/theme';

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatDuration(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins} min`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SessionCompleteScreen({ nav }: { nav: NavProps }) {
  // ── Derive all values from session params ────────────────────────────────────
  const actualMins   = parseInt(nav.params.actualMinutes ?? nav.params.duration ?? '45');
  const focusScore   = nav.params.focusScore   ?? '—';
  const blockedCount = nav.params.blockedCount  ?? '0';
  const distractions = nav.params.distractions  ?? '0';
  const streak       = parseInt(nav.params.streak ?? '1');

  const stats: { value: string; label: string }[] = [
    { value: formatDuration(actualMins), label: 'Duration'     },
    { value: focusScore,                 label: 'Focus Score'  },
    { value: blockedCount,               label: 'Apps Blocked' },
    { value: distractions,               label: 'Distractions' },
  ];

  // ── Entrance animations ──────────────────────────────────────────────────────
  const iconScale     = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY      = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(iconScale, {
        toValue: 1, friction: 4, tension: 90, useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(contentY,       { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Completion icon ─────────────────────────────────────────────────── */}
      <Animated.View style={[styles.iconCircle, { transform: [{ scale: iconScale }] }]}>
        <Ionicons name="checkmark-done" size={30} color={colors.white} />
      </Animated.View>

      {/* ── Heading ─────────────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.content, { opacity: contentOpacity, transform: [{ translateY: contentY }] }]}
      >
        <Text style={styles.title}>Session Complete</Text>
        <Text style={styles.subtitle}>Great work! Here's your summary.</Text>

        {/* ── 2×2 Stats Grid ────────────────────────────────────────────────── */}
        <View style={styles.grid}>
          {stats.map(({ value, label }) => (
            <View key={label} style={styles.statCard}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {value}
              </Text>
              <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        {/* ── Streak box ────────────────────────────────────────────────────── */}
        <View style={styles.streakBox}>
          <Text style={styles.streakLabel}>CURRENT STREAK</Text>
          <View style={styles.streakRow}>
            <Text style={styles.streakValue}>{streak} days</Text>
            <Ionicons name="flame" size={24} color={colors.amber} style={styles.flameIcon} />
          </View>
        </View>

        {/* ── Primary button ────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => nav.navigate('Dashboard')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>

        {/* ── Secondary button ──────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => nav.navigate('CreateSession')}
          activeOpacity={0.6}
        >
          <Text style={styles.secondaryBtnText}>Start Another</Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: colors.bg },
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 52,
  },

  // Completion icon circle
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.ink,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xl,
    // Soft shadow so it lifts off the page
    shadowColor: colors.black, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 14, elevation: 8,
  },

  // Animated content wrapper
  content: { alignSelf: 'stretch', alignItems: 'center' },

  // Heading
  title: {
    fontSize: fontSize.xxl + 4, fontWeight: '700', color: colors.ink,
    textAlign: 'center', marginBottom: spacing.xs + 2,
  },
  subtitle: {
    fontSize: fontSize.sm + 1, color: colors.muted,
    textAlign: 'center', marginBottom: spacing.xxxl,
  },

  // 2×2 Stats grid
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.sm + 2, alignSelf: 'stretch', marginBottom: spacing.md + 2,
  },
  statCard: {
    // Each card takes exactly half the row minus the gap
    flexBasis: '47%', flexGrow: 1,
    backgroundColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: {
    fontSize: fontSize.xxl + 4, fontWeight: '700', color: colors.ink,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs, fontWeight: '600',
    color: colors.muted, letterSpacing: 0.8,
  },

  // Streak container
  streakBox: {
    alignSelf: 'stretch',
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.xl,
    marginBottom: spacing.xxl,
    backgroundColor: colors.white,
  },
  streakLabel: {
    fontSize: fontSize.xs, fontWeight: '600',
    color: colors.muted, letterSpacing: 0.8,
    marginBottom: spacing.xs + 2,
  },
  streakRow:  { flexDirection: 'row', alignItems: 'center' },
  streakValue: {
    fontSize: fontSize.xxl + 4, fontWeight: '700', color: colors.ink,
  },
  flameIcon: { marginLeft: spacing.sm, marginTop: 2 },

  // Buttons
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.ink, borderRadius: radii.lg,
    paddingVertical: 18, alignItems: 'center', marginBottom: spacing.lg,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 10, elevation: 5,
  },
  primaryBtnText: { color: colors.white, fontSize: fontSize.lg - 1, fontWeight: '700' },
  secondaryBtn:   { paddingVertical: spacing.md },
  secondaryBtnText: { color: colors.muted, fontSize: fontSize.md, fontWeight: '500' },
});
