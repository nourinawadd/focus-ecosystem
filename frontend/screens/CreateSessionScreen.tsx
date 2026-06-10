import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Switch, StyleSheet, Platform, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import { colors, spacing, radii, fontSize } from '../constants/theme';
import { apiFetch } from '../api/client';
import { SessionCategory } from '../store/user';
import {
  isSupported as screenTimeSupported,
  isNativeReady as screenTimeNativeReady,
  getLoadError as screenTimeLoadError,
  getAuthorizationStatus,
  requestAuthorization,
  presentPicker,
  getSelectionSummary,
  formatSummary,
  summaryTotal,
  type ScreenTimeSelectionSummary,
  type ScreenTimeAuthStatus,
} from 'anchor-screen-time';

const DURATIONS = [15, 25, 30, 45, 60, 90];
const APPS = ['Instagram', 'Twitter', 'TikTok', 'YouTube', 'Reddit', 'Snapchat', 'Discord', 'Games'];

const POMO_PRESETS = [
  { label: '25 / 5',  work: 25, brk: 5  },
  { label: '50 / 10', work: 50, brk: 10 },
  { label: '30 / 10', work: 30, brk: 10 },
  { label: '15 / 3',  work: 15, brk: 3  },
] as const;

type PomoPreset = typeof POMO_PRESETS[number];
type ScreenState = 'category-select' | 'session-create';

export default function CreateSessionScreen({ nav }: { nav: NavProps }) {
  const [screenState, setScreenState] = useState<ScreenState>('category-select');
  const [categories, setCategories] = useState<SessionCategory[]>(nav.user.categories || []);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SessionCategory | null>(null);
  const [sessionName, setSessionName] = useState('');

  const [duration, setDuration] = useState(() =>
    DURATIONS.includes(nav.user.preferredDuration) ? nav.user.preferredDuration : 25,
  );
  const [pomodoro,   setPomodoro]   = useState(() => nav.user.pomodoroEnabled);
  const [pomoPreset, setPomoPreset] = useState<PomoPreset>(POMO_PRESETS[0]);
  const [pomoRounds, setPomoRounds] = useState(2);
  const [blockedApps, setBlockedApps] = useState<string[]>(['Instagram', 'Twitter', 'TikTok', 'YouTube', 'Reddit']);
  const [showAllApps, setShowAllApps] = useState(false);
  const [stSummary, setStSummary]   = useState<ScreenTimeSelectionSummary | null>(null);
  const [stStatus,  setStStatus]    = useState<ScreenTimeAuthStatus>('notDetermined');
  const [stBusy,    setStBusy]      = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Load categories on mount
  useEffect(() => {
    refreshCategories();
  }, []);

  useEffect(() => {
    if (!screenTimeNativeReady()) return;
    let alive = true;
    (async () => {
      try {
        const [status, summary] = await Promise.all([getAuthorizationStatus(), getSelectionSummary()]);
        if (!alive) return;
        setStStatus(status);
        setStSummary(summary);
      } catch {
        // ignore
      }
    })();
    return () => { alive = false; };
  }, []);

  const refreshCategories = useCallback(async () => {
    try {
      const cats = await apiFetch<SessionCategory[]>('/user/categories', nav.token);
      setCategories(cats);
      nav.updateUser({ categories: cats });
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, [nav.token]);

  const createNewCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }
    if (categories.length >= 3) {
      Alert.alert('Limit reached', 'You can only have up to 3 categories.');
      return;
    }

    setIsCreatingCategory(true);
    try {
      const newCat = await apiFetch<SessionCategory>('/user/categories', nav.token, {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      const updatedCategories = [...categories, newCat];
      setCategories(updatedCategories);
      nav.updateUser({ categories: updatedCategories });
      setNewCategoryName('');
      setSelectedCategory(newCat);
      setScreenState('session-create');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create category');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const selectCategory = (cat: SessionCategory) => {
    setSelectedCategory(cat);
    setScreenState('session-create');
    setSessionName('');
  };

  const configureScreenTime = async () => {
    if (!screenTimeSupported()) return;
    if (!screenTimeNativeReady()) {
      Alert.alert(
        'Screen Time module not loaded',
        `The native module failed to load:\n\n${screenTimeLoadError()?.message ?? 'unknown'}\n\nThis usually means the build didn't include the module. Try rebuilding.`,
      );
      return;
    }
    setStBusy(true);
    try {
      let status = stStatus;
      if (status !== 'approved') {
        status = await requestAuthorization();
        setStStatus(status);
      }
      if (status !== 'approved') {
        Alert.alert(
          'Screen Time access needed',
          'Anchor needs Screen Time access to shield distracting apps during your sessions. You can enable it later in Settings.',
        );
        return;
      }
      const summary = await presentPicker();
      if (summary !== null) setStSummary(summary);
    } catch (err: any) {
      Alert.alert('Screen Time error', err?.message ?? 'Could not open the app picker.');
    } finally {
      setStBusy(false);
    }
  };

  const toggleApp = (app: string) =>
    setBlockedApps(prev => prev.includes(app) ? prev.filter(a => a !== app) : [...prev, app]);

  const visibleApps = showAllApps ? APPS : APPS.slice(0, 5);
  const pomoDuration = pomoPreset.work * pomoRounds;

  const startParams = selectedCategory ? {
    categoryId:    selectedCategory.id,
    customName:    sessionName || 'Untitled',
    timerMode:     'COUNTDOWN',
    plannedDuration: String(pomodoro ? pomoDuration : duration),
    pomodoro:      String(pomodoro),
    pomodoroWork:  String(pomoPreset.work),
    pomodoroBreak: String(pomoPreset.brk),
    blockedApps:   blockedApps.join(','),
  } : null;

  if (screenState === 'category-select') {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => nav.navigate('Dashboard')}>
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Session Categories</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <SectionLabel noTopMargin>Your Categories</SectionLabel>
          
          {categories.length === 0 ? (
            <Text style={styles.emptyText}>No categories yet. Create one to get started!</Text>
          ) : (
            <View style={styles.categoryGrid}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.categoryCard}
                  onPress={() => selectCategory(cat)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="folder" size={32} color={colors.ink} />
                  <Text style={styles.categoryName}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <SectionLabel>Create New Category</SectionLabel>
          {categories.length >= 3 ? (
            <Text style={styles.emptyText}>You've reached the maximum of 3 categories.</Text>
          ) : (
            <Card style={styles.createCard} padding={spacing.md}>
              <TextInput
                style={styles.input}
                placeholder="Category name (e.g., Work, Fitness, Learning)"
                placeholderTextColor={colors.muted}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                editable={!isCreatingCategory}
                maxLength={100}
              />
              <TouchableOpacity
                style={[styles.createBtn, isCreatingCategory && styles.createBtnDisabled]}
                onPress={createNewCategory}
                disabled={isCreatingCategory}
                activeOpacity={0.8}
              >
                <Text style={styles.createBtnText}>
                  {isCreatingCategory ? 'Creating...' : 'Create Category'}
                </Text>
              </TouchableOpacity>
            </Card>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  if (!selectedCategory) return null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreenState('category-select')}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>New Session</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        
        {/* Category badge */}
        <Card style={styles.categoryBadge} padding={spacing.md}>
          <Ionicons name="folder" size={20} color={colors.ink} />
          <Text style={styles.categoryBadgeText}>{selectedCategory.name}</Text>
        </Card>

        {/* Session name input */}
        <SectionLabel>Session Name</SectionLabel>
        <TextInput
          style={styles.sessionNameInput}
          placeholder="e.g., Morning Work Session"
          placeholderTextColor={colors.muted}
          value={sessionName}
          onChangeText={setSessionName}
          maxLength={100}
        />

        {/* Duration (non-Pomodoro) OR Preset + Total Duration (Pomodoro) */}
        {!pomodoro ? (
          <>
            <SectionLabel>Duration</SectionLabel>
            <Text style={styles.durationBig}>
              {duration} <Text style={styles.durationUnit}>min</Text>
            </Text>
            <View style={styles.durationRow}>
              {DURATIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationChip, duration === d && styles.durationChipActive]}
                  onPress={() => setDuration(d)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.durationChipText, duration === d && styles.durationChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <SectionLabel>Pomodoro Preset</SectionLabel>
            <View style={styles.durationRow}>
              {POMO_PRESETS.map(p => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.durationChip, pomoPreset.label === p.label && styles.durationChipActive]}
                  onPress={() => setPomoPreset(p)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.durationChipText, pomoPreset.label === p.label && styles.durationChipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <SectionLabel>Total Duration</SectionLabel>
            <Text style={styles.durationBig}>
              {pomoDuration} <Text style={styles.durationUnit}>min</Text>
            </Text>
            <View style={styles.durationRow}>
              {[1, 2, 3, 4].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.durationChip, pomoRounds === r && styles.durationChipActive]}
                  onPress={() => setPomoRounds(r)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.durationChipText, pomoRounds === r && styles.durationChipTextActive]}>
                    {pomoPreset.work * r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Pomodoro toggle */}
        <Card style={styles.toggleCard} padding={spacing.lg}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Pomodoro Mode</Text>
            <Text style={styles.toggleSub}>
              {pomodoro
                ? `${pomoPreset.work} min focus · ${pomoPreset.brk} min break`
                : '25 min focus · 5 min break'}
            </Text>
          </View>
          <Switch value={pomodoro} onValueChange={setPomodoro} trackColor={{ true: colors.ink }} thumbColor={colors.white} />
        </Card>

        {/* Block Apps */}
        <SectionLabel>Block Apps</SectionLabel>
        <View style={styles.appsWrap}>
          {visibleApps.map(app => (
            <TouchableOpacity
              key={app}
              style={[styles.appChip, blockedApps.includes(app) && styles.appChipActive]}
              onPress={() => toggleApp(app)}
              activeOpacity={0.75}
            >
              <Text style={[styles.appChipText, blockedApps.includes(app) && styles.appChipTextActive]}>{app}</Text>
            </TouchableOpacity>
          ))}
          {!showAllApps && (
            <TouchableOpacity style={styles.appChip} onPress={() => setShowAllApps(true)}>
              <Text style={styles.appChipText}>+{APPS.length - 5} more</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Screen Time real blocking (iOS only) */}
        {screenTimeSupported() && (
          <>
            <SectionLabel>Screen Time Shield</SectionLabel>
            <TouchableOpacity
              style={styles.stCard}
              onPress={configureScreenTime}
              activeOpacity={0.85}
              disabled={stBusy}
            >
              <View style={styles.stIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stTitle}>
                  {summaryTotal(stSummary) > 0 ? 'Apps blocked by iOS' : 'Configure blocked apps'}
                </Text>
                <Text style={styles.stSub} numberOfLines={1}>
                  {stStatus !== 'approved'
                    ? 'Tap to grant Screen Time access'
                    : formatSummary(stSummary)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* Actions */}
        {nav.userTags.length > 0 ? (
          <>
            <TouchableOpacity
              style={styles.nfcBtn}
              onPress={() => startParams && nav.navigate('NFCScan', startParams)}
              activeOpacity={0.8}
            >
              <Text style={styles.nfcBtnText}>Scan NFC Tag to Start</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => startParams && nav.navigate('ActiveSession', startParams)}
              activeOpacity={0.7}
            >
              <Text style={styles.skipBtnText}>Start Without NFC</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.nfcBtn}
              onPress={() => startParams && nav.navigate('ActiveSession', startParams)}
              activeOpacity={0.8}
            >
              <Text style={styles.nfcBtnText}>Start Session</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={() => nav.navigate('NFCSetup')} activeOpacity={0.7}>
              <Text style={styles.skipBtnText}>Set up NFC tags</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  header:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: spacing.md, backgroundColor: colors.bg,
  },
  backBtn:      { width: 40, height: 40, justifyContent: 'center' },
  title:        { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  headerSpacer: { width: 40 },
  body:         { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },

  emptyText: { fontSize: fontSize.md, color: colors.muted, textAlign: 'center', marginTop: spacing.lg },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  categoryCard: {
    flex: 0.45,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    backgroundColor: colors.border,
    borderRadius: radii.lg,
  },
  categoryName: { fontSize: fontSize.md, fontWeight: '600', color: colors.ink, marginTop: spacing.sm },

  createCard: { marginBottom: spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  createBtn: {
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },

  categoryBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  categoryBadgeText: { fontSize: fontSize.lg - 1, fontWeight: '600', color: colors.ink },

  sessionNameInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.ink,
    marginBottom: spacing.md,
  },

  durationBig:  { fontSize: 60, fontWeight: '700', color: colors.ink, textAlign: 'center', marginVertical: 6 },
  durationUnit: { fontSize: 22, fontWeight: '400', color: colors.muted },
  durationRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2, justifyContent: 'center', marginBottom: spacing.xs },
  durationChip:           { paddingVertical: spacing.sm, paddingHorizontal: 18, borderRadius: radii.full, backgroundColor: colors.border },
  durationChipActive:     { backgroundColor: colors.ink },
  durationChipText:       { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.inkSoft },
  durationChipTextActive: { color: colors.white },

  toggleCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  toggleInfo: { flex: 1 },
  toggleTitle: { fontSize: fontSize.lg - 1, fontWeight: '600', color: colors.ink },
  toggleSub:   { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },

  appsWrap:         { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  appChip:          { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.full, backgroundColor: colors.border },
  appChipActive:    { backgroundColor: colors.ink },
  appChipText:      { fontSize: fontSize.sm, fontWeight: '500', color: colors.inkSoft },
  appChipTextActive: { color: colors.white },

  stCard:    {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.border, borderRadius: radii.lg,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  stIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  stTitle:   { fontSize: fontSize.md, fontWeight: '600', color: colors.ink },
  stSub:     { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },

  nfcBtn:      { backgroundColor: colors.ink, borderRadius: radii.lg, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  nfcBtnText:  { color: colors.white, fontSize: fontSize.lg - 1, fontWeight: '700' },
  skipBtn:     { alignItems: 'center', paddingVertical: 14, marginTop: spacing.sm + 2 },
  skipBtnText: { fontSize: fontSize.md, color: colors.muted, fontWeight: '500' },
});
