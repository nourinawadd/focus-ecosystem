// frontend/screens/SettingsScreen.tsx
// User preferences. Every change is immediately synced to PATCH /user/settings.
import React, { useState, useEffect } from 'react';
import {
  View, Text, Switch, TouchableOpacity, StyleSheet, ScrollView, Platform,
  Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps, UserProfile } from '../App';
import { DAILY_GOAL_OPTIONS, WEEKLY_GOAL_OPTIONS } from '../store/user';
import { colors, fontSize, spacing, radii } from '../constants/theme';
import { apiFetch } from '../api/client';
import {
  isCalendarSupported, isCalendarSyncEnabled, setCalendarSyncEnabled, requestCalendarPermission,
} from '../utils/calendar';
import { hSelection, hLight } from '../utils/haptics';

const DURATION_OPTIONS = [15, 25, 30, 45, 60, 90];

function fmtHour(v: number) {
  const h = v % 12 || 12;
  return `${h} ${v < 12 ? 'AM' : 'PM'}`;
}

function ChipRow<T extends string | number>({
  options, active, onSelect, labelOf,
}: {
  options: T[];
  active: T;
  onSelect: (v: T) => void;
  labelOf?: (v: T) => string;
}) {
  return (
    <View style={s.chipsRow}>
      {options.map(opt => {
        const on = opt === active;
        return (
          <TouchableOpacity
            key={String(opt)}
            style={[s.chip, on && s.chipOn]}
            onPress={() => { hSelection(); onSelect(opt); }}
            activeOpacity={0.75}
          >
            <Text style={[s.chipTxt, on && s.chipTxtOn]}>
              {labelOf ? labelOf(opt) : String(opt)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ToggleRow({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.toggleRow}>
      <View style={s.rowInfo}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowDesc}>{desc}</Text>
      </View>
      <Switch value={value} onValueChange={v => { hLight(); onChange(v); }}
        trackColor={{ false: colors.border, true: colors.ink }} thumbColor={colors.white} />
    </View>
  );
}

export default function SettingsScreen({ nav }: { nav: NavProps }) {
  const { user, token } = nav;
  const initial = user.name.charAt(0).toUpperCase();

  // Account deletion modal: the button stays disabled until "DELETE" is typed.
  const [deleteModal, setDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting,    setDeleting]    = useState(false);
  const deleteArmed = confirmText.trim().toUpperCase() === 'DELETE';

  // Calendar sync — local device preference, gated by iOS Calendar permission.
  const [calendarSyncEnabled, setCalendarSyncEnabledState] = useState(false);

  useEffect(() => {
    isCalendarSyncEnabled().then(setCalendarSyncEnabledState);
  }, []);

  const onToggleCalendarSync = async (next: boolean) => {
    if (next) {
      const granted = await requestCalendarPermission();
      if (!granted) {
        Alert.alert(
          'Calendar access needed',
          'Anchor needs Calendar access to show today\'s schedule and add your completed sessions. You can grant this in iOS Settings.',
        );
        return;
      }
    }
    await setCalendarSyncEnabled(next);
    setCalendarSyncEnabledState(next);
  };

  const deleteAccount = async () => {
    if (!deleteArmed || !token) return;
    setDeleting(true);
    try {
      await apiFetch('/user/me', token, { method: 'DELETE' });
      setDeleteModal(false);
      nav.signOut();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  // Updates local state instantly and fires a background sync to the backend.
  const updateAndSync = async (updates: Partial<UserProfile>) => {
    nav.updateUser(updates);
    if (!token) return;

    const backendUpdates: Record<string, unknown> = {};
    if (updates.dailyGoalMinutes    !== undefined) backendUpdates.dailyGoalMinutes    = updates.dailyGoalMinutes;
    if (updates.weeklyGoalMinutes   !== undefined) backendUpdates.weeklyGoalMinutes   = updates.weeklyGoalMinutes;
    if (updates.preferredDuration   !== undefined) backendUpdates.defaultDuration     = updates.preferredDuration;
    if (updates.pomodoroEnabled     !== undefined) backendUpdates.defaultTimerMode    = updates.pomodoroEnabled ? 'POMODORO' : 'COUNTDOWN';
    if (updates.notificationsEnabled !== undefined) backendUpdates.notificationsEnabled = updates.notificationsEnabled;
    if (updates.reminderHour         !== undefined) backendUpdates.reminderHour         = updates.reminderHour;
    if (updates.nudgeHour            !== undefined) backendUpdates.nudgeHour            = updates.nudgeHour;
    if (updates.notify               !== undefined) backendUpdates.notify               = updates.notify;

    try {
      await apiFetch('/user/settings', token, {
        method: 'PATCH',
        body: JSON.stringify(backendUpdates),
      });
    } catch {
      // Local state is already updated; silently ignore transient network failures.
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={nav.openDrawer}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={s.title}>Settings</Text>
        <View style={s.menuBtn} />
      </View>

      <Text style={s.sectionLabel}>PROFILE</Text>
      <TouchableOpacity style={s.card} activeOpacity={0.7} onPress={() => nav.navigate('Profile')}>
        <View style={s.profileRow}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{initial}</Text></View>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{user.name}</Text>
            {!!user.email && <Text style={s.profileEmail}>{user.email}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={s.rowDesc.color as string} />
        </View>
      </TouchableOpacity>

      <Text style={s.sectionLabel}>FOCUS GOALS</Text>
      <View style={s.selectCard}>
        <Text style={s.rowLabel}>Daily Goal</Text>
        <Text style={s.rowDesc}>Target focus time per day — drives Dashboard progress</Text>
        <ChipRow
          options={DAILY_GOAL_OPTIONS.map(o => o.minutes)}
          active={user.dailyGoalMinutes}
          onSelect={v => updateAndSync({ dailyGoalMinutes: v })}
          labelOf={v => DAILY_GOAL_OPTIONS.find(o => o.minutes === v)?.label ?? `${v}m`}
        />
      </View>
      <View style={s.selectCard}>
        <Text style={s.rowLabel}>Weekly Goal</Text>
        <Text style={s.rowDesc}>Weekly target — used in Analytics health score</Text>
        <ChipRow
          options={WEEKLY_GOAL_OPTIONS.map(o => o.minutes)}
          active={user.weeklyGoalMinutes}
          onSelect={v => updateAndSync({ weeklyGoalMinutes: v })}
          labelOf={v => WEEKLY_GOAL_OPTIONS.find(o => o.minutes === v)?.label ?? `${v}m`}
        />
      </View>

      <Text style={s.sectionLabel}>SESSION DEFAULTS</Text>
      <View style={s.selectCard}>
        <Text style={s.rowLabel}>Preferred Duration</Text>
        <Text style={s.rowDesc}>Pre-selected when you open Create Session</Text>
        <ChipRow
          options={DURATION_OPTIONS}
          active={user.preferredDuration}
          onSelect={v => updateAndSync({ preferredDuration: v })}
          labelOf={v => `${v} min`}
        />
      </View>
      <View style={s.card}>
        <ToggleRow
          label="Pomodoro Mode"
          desc="Enable 25 min focus / 5 min break by default"
          value={user.pomodoroEnabled}
          onChange={v => updateAndSync({ pomodoroEnabled: v })}
        />
      </View>

      {isCalendarSupported() && (
        <>
          <Text style={s.sectionLabel}>INTEGRATIONS</Text>
          <View style={s.card}>
            <ToggleRow
              label="Sync with Calendar"
              desc="Show today's calendar events on your Dashboard and add completed sessions to a dedicated Anchor calendar"
              value={calendarSyncEnabled}
              onChange={onToggleCalendarSync}
            />
          </View>
        </>
      )}

      <Text style={s.sectionLabel}>PREFERENCES</Text>
      <View style={s.card}>
        <ToggleRow
          label="Notifications"
          desc="Master switch — enables all notification types"
          value={user.notificationsEnabled}
          onChange={v => updateAndSync({ notificationsEnabled: v })}
        />
      </View>

      {user.notificationsEnabled && (<>
        <Text style={s.sectionLabel}>NOTIFICATION TYPES</Text>
        <View style={s.card}>
          <ToggleRow
            label="Daily start nudge"
            desc="Morning reminder — skipped if you've already started a session"
            value={user.notify.dailyNudge}
            onChange={v => updateAndSync({ notify: { ...user.notify, dailyNudge: v } })}
          />
          <ToggleRow
            label="In-session phase alerts"
            desc="Pomodoro focus↔break boundaries and session complete"
            value={user.notify.inSessionAlerts}
            onChange={v => updateAndSync({ notify: { ...user.notify, inSessionAlerts: v } })}
          />
          <ToggleRow
            label="Daily summary"
            desc="Your focus minutes, sessions, and score for the day"
            value={user.notify.dailySummary}
            onChange={v => updateAndSync({ notify: { ...user.notify, dailySummary: v } })}
          />
          <ToggleRow
            label="Streak at risk"
            desc="Alert an hour after the report time if you haven't focused yet"
            value={user.notify.streakAlert}
            onChange={v => updateAndSync({ notify: { ...user.notify, streakAlert: v } })}
          />
          <ToggleRow
            label="Goal progress nudge"
            desc="Reminder when you're partway to your daily goal"
            value={user.notify.goalNudge}
            onChange={v => updateAndSync({ notify: { ...user.notify, goalNudge: v } })}
          />
          <ToggleRow
            label="Goal achieved"
            desc="Celebration when you hit your daily focus goal"
            value={user.notify.goalAchieved}
            onChange={v => updateAndSync({ notify: { ...user.notify, goalAchieved: v } })}
          />
        </View>

        {user.notify.dailyNudge && (
          <View style={s.selectCard}>
            <Text style={s.rowLabel}>Start nudge time</Text>
            <Text style={s.rowDesc}>Morning hour for the daily start nudge</Text>
            <ChipRow
              options={[7, 8, 9, 10, 11, 12] as number[]}
              active={user.nudgeHour}
              onSelect={v => updateAndSync({ nudgeHour: v })}
              labelOf={fmtHour}
            />
          </View>
        )}

        {(user.notify.dailySummary || user.notify.goalNudge || user.notify.streakAlert) && (
          <View style={s.selectCard}>
            <Text style={s.rowLabel}>Evening report time</Text>
            <Text style={s.rowDesc}>Hour for the daily summary and goal progress nudge</Text>
            <ChipRow
              options={[17, 18, 19, 20, 21, 22] as number[]}
              active={user.reminderHour}
              onSelect={v => updateAndSync({ reminderHour: v })}
              labelOf={fmtHour}
            />
          </View>
        )}
      </>)}

      <Text style={s.sectionLabel}>CONNECTED HARDWARE</Text>
      <TouchableOpacity style={s.card} onPress={() => nav.navigate('NFCSetup', { from: 'Settings' })} activeOpacity={0.75}>
        <View style={s.linkRow}>
          <View style={s.rowInfo}>
            <Text style={s.rowLabel}>NFC Tags</Text>
            <Text style={s.rowDesc}>
              {nav.userTags.length === 0
                ? 'No tags registered — add one to verify your focus location'
                : `${nav.userTags.length} tag${nav.userTags.length === 1 ? '' : 's'} registered`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={s.rowDesc.color as string} />
        </View>
      </TouchableOpacity>

      <Text style={s.sectionLabel}>ACCOUNT</Text>
      <TouchableOpacity
        style={s.card}
        onPress={() => { setConfirmText(''); setDeleteModal(true); }}
        activeOpacity={0.75}
      >
        <View style={s.linkRow}>
          <View style={s.rowInfo}>
            <Text style={[s.rowLabel, s.dangerLabel]}>Delete Account</Text>
            <Text style={s.rowDesc}>Permanently erase your account and all session data</Text>
          </View>
          <Ionicons name="trash-outline" size={18} color="#ff0000" />
        </View>
      </TouchableOpacity>

      <View style={{ height: 48 }} />

      <Modal
        visible={deleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Delete account?</Text>
            <Text style={s.modalSub}>
              This permanently erases your account, sessions, statistics, and tags.
              It cannot be undone. Type DELETE to confirm.
            </Text>
            <TextInput
              style={s.modalInput}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="DELETE"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setDeleteModal(false)}
                disabled={deleting}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalDeleteBtn, (!deleteArmed || deleting) && { opacity: 0.45 }]}
                onPress={deleteAccount}
                disabled={!deleteArmed || deleting}
              >
                {deleting
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={s.modalDeleteText}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: colors.bg },
  container:    { paddingHorizontal: spacing.xl, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 48 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  menuBtn:      { width: 40, height: 40, justifyContent: 'center' },
  title:        { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1.2, marginBottom: 10, marginTop: 4 },
  card:         { backgroundColor: colors.card, borderRadius: radii.lg, marginBottom: spacing.lg, overflow: 'hidden', shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  selectCard:   { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md, shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  profileRow:   { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  avatar:       { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:    { color: colors.white, fontWeight: '700', fontSize: fontSize.lg },
  profileInfo:  { flex: 1 },
  profileName:  { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  profileEmail: { fontSize: fontSize.sm, color: colors.muted },
  linkRow:      { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  toggleRow:    { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  rowInfo:      { flex: 1, marginRight: spacing.md },
  rowLabel:     { fontSize: fontSize.md, fontWeight: '600', color: colors.ink, marginBottom: 2 },
  rowDesc:      { fontSize: fontSize.xs + 1, color: colors.muted },
  chipsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip:         { paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm, borderRadius: radii.full, borderWidth: 1.5, borderColor: colors.border },
  chipOn:       { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt:      { fontSize: fontSize.sm, color: colors.muted, fontWeight: '500' },
  chipTxtOn:    { color: colors.white, fontWeight: '600' },

  // Account deletion
  dangerLabel:     { color: '#ff0000' },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  modalCard:       { backgroundColor: colors.white, borderRadius: radii.xl, padding: 24, width: '100%', maxWidth: 340 },
  modalTitle:      { fontSize: fontSize.xl - 1, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  modalSub:        { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20, marginBottom: 16 },
  // No letterSpacing: on iOS it spaces out the placeholder ("D E L E T E") and
  // lags typing — a known iOS TextInput rendering/perf bug.
  modalInput:      { borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, fontSize: fontSize.md, color: colors.ink, marginBottom: 16 },
  modalActions:    { flexDirection: 'row', gap: 12 },
  modalCancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.border },
  modalCancelText: { fontSize: fontSize.md, fontWeight: '600', color: colors.inkSoft },
  modalDeleteBtn:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.danger },
  modalDeleteText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
});
