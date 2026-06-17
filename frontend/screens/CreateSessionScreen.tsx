import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Switch, StyleSheet, Platform, Alert, TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import WheelPicker from '../components/WheelPicker';
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
const HOURS   = Array.from({ length: 9 },  (_, i) => i);   // 0–8 hours
const MINUTES = Array.from({ length: 60 }, (_, i) => i);   // 0–59 min

// Remember the last duration dialed on the wheels (like the iOS Clock timer).
const LAST_DURATION_KEY = '@anchor:lastDuration';

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
  // Disables the page scroll while a duration wheel is being dragged, so the
  // gesture stays in the wheel instead of moving the whole screen.
  const [wheelActive, setWheelActive] = useState(false);
  const durationHydrated = useRef(false);
  const [pomodoro,   setPomodoro]   = useState(() => nav.user.pomodoroEnabled);
  const [pomoPreset, setPomoPreset] = useState<PomoPreset>(POMO_PRESETS[0]);
  const [pomoRounds, setPomoRounds] = useState(2);
  const [stSummary, setStSummary]   = useState<ScreenTimeSelectionSummary | null>(null);
  const [stStatus,  setStStatus]    = useState<ScreenTimeAuthStatus>('notDetermined');
  const [stBusy,    setStBusy]      = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  // Load categories on mount
  useEffect(() => {
    refreshCategories();
  }, []);

  // Restore the last duration dialed on the wheels, then persist any change.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LAST_DURATION_KEY);
        const n = saved ? parseInt(saved, 10) : NaN;
        if (Number.isFinite(n) && n > 0) setDuration(n);
      } catch {
        // ignore — fall back to the default duration
      }
      durationHydrated.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!durationHydrated.current) return;
    AsyncStorage.setItem(LAST_DURATION_KEY, String(duration)).catch(() => {});
  }, [duration]);

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

  const startEditCategory = (cat: SessionCategory) => {
    setEditingCategoryId(cat.id);
    setEditCategoryName(cat.name);
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditCategoryName('');
  };

  const saveEditCategory = async (cat: SessionCategory) => {
    const trimmed = editCategoryName.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }
    if (trimmed === cat.name) {
      cancelEditCategory();
      return;
    }

    setIsSavingCategory(true);
    try {
      const updated = await apiFetch<SessionCategory>(`/user/categories/${cat.id}`, nav.token, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });
      const updatedCategories = categories.map(c => c.id === cat.id ? updated : c);
      setCategories(updatedCategories);
      nav.updateUser({ categories: updatedCategories });
      if (selectedCategory?.id === cat.id) setSelectedCategory(updated);
      cancelEditCategory();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to rename category');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const deleteCategory = (cat: SessionCategory) => {
    Alert.alert(
      'Delete category',
      `Delete "${cat.name}"? Past sessions will keep this category.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingCategoryId(cat.id);
            try {
              await apiFetch(`/user/categories/${cat.id}`, nav.token, { method: 'DELETE' });
              const updatedCategories = categories.filter(c => c.id !== cat.id);
              setCategories(updatedCategories);
              nav.updateUser({ categories: updatedCategories });
              if (selectedCategory?.id === cat.id) {
                setSelectedCategory(null);
                setScreenState('category-select');
              }
              if (editingCategoryId === cat.id) cancelEditCategory();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete category');
            } finally {
              setDeletingCategoryId(null);
            }
          },
        },
      ],
    );
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

  const pomoDuration = pomoPreset.work * pomoRounds;

  const startParams = selectedCategory ? {
    categoryId:    selectedCategory.id,
    customName:    sessionName || 'Untitled',
    timerMode:     'COUNTDOWN',
    plannedDuration: String(pomodoro ? pomoDuration : duration),
    pomodoro:      String(pomodoro),
    pomodoroWork:  String(pomoPreset.work),
    pomodoroBreak: String(pomoPreset.brk),
    blockedApps:   '',
  } : null;

  if (screenState === 'category-select') {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={nav.openDrawer}>
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
                <View key={cat.id} style={styles.categoryCard}>
                  {editingCategoryId === cat.id ? (
                    <View style={styles.categoryEditWrap}>
                      <TextInput
                        style={styles.categoryEditInput}
                        value={editCategoryName}
                        onChangeText={setEditCategoryName}
                        autoFocus
                        maxLength={100}
                        editable={!isSavingCategory}
                      />
                      <View style={styles.categoryEditActions}>
                        <TouchableOpacity
                          style={styles.categoryEditBtn}
                          onPress={() => saveEditCategory(cat)}
                          disabled={isSavingCategory}
                          hitSlop={8}
                        >
                          <Ionicons name="checkmark" size={20} color={colors.success} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.categoryEditBtn}
                          onPress={cancelEditCategory}
                          disabled={isSavingCategory}
                          hitSlop={8}
                        >
                          <Ionicons name="close" size={20} color={colors.muted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.categoryCardBody}
                        onPress={() => selectCategory(cat)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="folder" size={32} color={colors.ink} />
                        <Text style={styles.categoryName}>{cat.name}</Text>
                      </TouchableOpacity>
                      <View style={styles.categoryCardActions}>
                        <TouchableOpacity
                          style={styles.categoryActionBtn}
                          onPress={() => startEditCategory(cat)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.categoryActionBtnText}>Rename</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.categoryActionBtn}
                          onPress={() => deleteCategory(cat)}
                          disabled={deletingCategoryId === cat.id}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.categoryActionBtnText, styles.categoryActionBtnTextDanger]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
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

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!wheelActive}
      >

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
            <View style={styles.wheelRow}>
              <WheelPicker
                values={HOURS}
                selectedValue={Math.floor(duration / 60)}
                unit="hours"
                width={150}
                onChange={h => setDuration(h * 60 + (duration % 60))}
                onInteractionStart={() => setWheelActive(true)}
                onInteractionEnd={() => setWheelActive(false)}
              />
              <WheelPicker
                values={MINUTES}
                selectedValue={duration % 60}
                unit="min"
                width={150}
                onChange={m => setDuration(Math.floor(duration / 60) * 60 + m)}
                onInteractionStart={() => setWheelActive(true)}
                onInteractionEnd={() => setWheelActive(false)}
              />
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

        {/* Actions — with a registered tag, NFC is required to start (and end);
            without one, the session starts and ends with no taps. */}
        {nav.userTags.length > 0 ? (
          <TouchableOpacity
            style={styles.nfcBtn}
            onPress={() => startParams && nav.navigate('NFCScan', startParams)}
            activeOpacity={0.8}
          >
            <Text style={styles.nfcBtnText}>Start with NFC</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.nfcBtn}
              onPress={() => startParams && nav.navigate('ActiveSession', startParams)}
              activeOpacity={0.8}
            >
              <Text style={styles.nfcBtnText}>Start</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={() => nav.navigate('NFCSetup', { from: 'CreateSession' })} activeOpacity={0.7}>
              <Text style={styles.skipBtnText}>Add an NFC tag</Text>
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
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.border,
    borderRadius: radii.lg,
  },
  categoryCardActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  categoryActionBtn: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.card,
  },
  categoryActionBtnText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.inkSoft },
  categoryActionBtnTextDanger: { color: colors.danger },
  categoryCardBody: { alignItems: 'center', justifyContent: 'center' },
  categoryName: { fontSize: fontSize.md, fontWeight: '600', color: colors.ink, marginTop: spacing.sm },

  categoryEditWrap: { alignItems: 'center' },
  categoryEditInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.md,
    color: colors.ink,
    backgroundColor: colors.card,
    textAlign: 'center',
  },
  categoryEditActions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  categoryEditBtn: { padding: spacing.xs },

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
  wheelRow:     { flexDirection: 'row', justifyContent: 'center', marginVertical: spacing.sm },
  durationRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2, justifyContent: 'center', marginBottom: spacing.xs },
  durationChip:           { paddingVertical: spacing.sm, paddingHorizontal: 18, borderRadius: radii.full, backgroundColor: colors.border },
  durationChipActive:     { backgroundColor: colors.ink },
  durationChipText:       { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.inkSoft },
  durationChipTextActive: { color: colors.white },

  toggleCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  toggleInfo: { flex: 1 },
  toggleTitle: { fontSize: fontSize.lg - 1, fontWeight: '600', color: colors.ink },
  toggleSub:   { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },

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
