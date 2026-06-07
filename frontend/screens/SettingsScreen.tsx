// frontend/screens/SettingsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
    View, Text, Switch, TouchableOpacity, StyleSheet,
    ScrollView, Platform, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps, UserProfile } from '../App';
import { DAILY_GOAL_OPTIONS, WEEKLY_GOAL_OPTIONS } from '../store/user';
import { colors, fontSize, spacing, radii } from '../constants/theme';
import { apiFetch } from '../api/client';

const DURATION_OPTIONS = [15, 25, 30, 45, 60, 90];

type Priority = 'high' | 'medium' | 'low';
type Task = { _id: string; name: string; priority: Priority };

const PRIORITY_COLORS: Record<Priority, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981',
};

function ChipRow<T extends string | number>({
    options, active, onSelect, labelOf,
}: {
    options: T[]; active: T; onSelect: (v: T) => void; labelOf?: (v: T) => string;
}) {
    return (
        <View style={s.chipsRow}>
            {options.map(opt => {
                const on = opt === active;
                return (
                    <TouchableOpacity
                        key={String(opt)}
                        style={[s.chip, on && s.chipOn]}
                        onPress={() => onSelect(opt)}
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
            <Switch value={value} onValueChange={onChange}
                trackColor={{ false: colors.border, true: colors.ink }} thumbColor={colors.white} />
        </View>
    );
}

export default function SettingsScreen({ nav }: { nav: NavProps }) {
    const { user, token } = nav;
    const initial = user.name.charAt(0).toUpperCase();

    // ── Tasks state ──────────────────────────────────────────────────────────
    const [tasks, setTasks] = useState<Task[]>([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [newTaskName, setNewTaskName] = useState('');
    const [newPriority, setNewPriority] = useState<Priority>('medium');
    const [addingTask, setAddingTask] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);

    useEffect(() => {
        if (!token) return;
        apiFetch<Task[]>('/tasks', token)
            .then(setTasks)
            .catch(console.error)
            .finally(() => setTasksLoading(false));
    }, [token]);

    const addTask = async () => {
        if (!newTaskName.trim() || !token) return;
        setAddingTask(true);
        try {
            const task = await apiFetch<Task>('/tasks', token, {
                method: 'POST',
                body: JSON.stringify({ name: newTaskName.trim(), priority: newPriority }),
            });
            setTasks(prev => [...prev, task]);
            setNewTaskName('');
            setNewPriority('medium');
            setShowAddForm(false);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to add task');
        } finally {
            setAddingTask(false);
        }
    };

    const deleteTask = (id: string, name: string) => {
        Alert.alert('Delete Task', `Remove "${name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    try {
                        await apiFetch(`/tasks/${id}`, token!, { method: 'DELETE' });
                        setTasks(prev => prev.filter(s => s._id !== id));
                    } catch (e: any) {
                        Alert.alert('Error', e.message || 'Failed to delete task');
                    }
                },
            },
        ]);
    };

    const updateAndSync = async (updates: Partial<UserProfile>) => {
        nav.updateUser(updates);
        if (!token) return;
        const backendUpdates: Record<string, unknown> = {};
        if (updates.dailyGoalMinutes !== undefined) backendUpdates.dailyGoalMinutes = updates.dailyGoalMinutes;
        if (updates.weeklyGoalMinutes !== undefined) backendUpdates.weeklyGoalMinutes = updates.weeklyGoalMinutes;
        if (updates.preferredDuration !== undefined) backendUpdates.defaultDuration = updates.preferredDuration;
        if (updates.pomodoroEnabled !== undefined) backendUpdates.defaultTimerMode = updates.pomodoroEnabled ? 'POMODORO' : 'COUNTDOWN';
        if (updates.notificationsEnabled !== undefined) backendUpdates.notificationsEnabled = updates.notificationsEnabled;
        try {
            await apiFetch('/user/settings', token, { method: 'PATCH', body: JSON.stringify(backendUpdates) });
        } catch { /* ignore */ }
    };

    return (
        <ScrollView style={s.screen} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity style={s.menuBtn} onPress={nav.openDrawer}>
                    <View style={s.menuLine} /><View style={s.menuLine} /><View style={s.menuLine} />
                </TouchableOpacity>
                <Text style={s.title}>Settings</Text>
                <View style={s.menuBtn} />
            </View>

            {/* Profile */}
            <Text style={s.sectionLabel}>PROFILE</Text>
            <View style={s.card}>
                <View style={s.profileRow}>
                    <View style={s.avatar}><Text style={s.avatarTxt}>{initial}</Text></View>
                    <View style={s.profileInfo}>
                        <Text style={s.profileName}>{user.name}</Text>
                        {!!user.email && <Text style={s.profileEmail}>{user.email}</Text>}
                    </View>
                </View>
            </View>

            {/* Tasks */}
            <Text style={s.sectionLabel}>STUDY SUBJECTS</Text>
            <View style={s.selectCard}>
                <Text style={s.rowLabel}>Tasks & Priorities</Text>
                <Text style={s.rowDesc}>AI uses these to build your personalized study schedule</Text>

                {tasksLoading ? (
                    <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.ink} />
                ) : (
                    <>
                        {tasks.length === 0 && !showAddForm && (
                            <Text style={s.emptyTasks}>No tasks yet — add one below</Text>
                        )}

                        {tasks.map(task => (
                            <View key={task._id} style={s.taskRow}>
                                <View style={[s.priorityDot, { backgroundColor: PRIORITY_COLORS[task.priority] }]} />
                                <Text style={s.taskName}>{task.name}</Text>
                                <View style={[s.priorityBadge, { backgroundColor: PRIORITY_COLORS[task.priority] + '20' }]}>
                                    <Text style={[s.priorityBadgeText, { color: PRIORITY_COLORS[task.priority] }]}>
                                        {task.priority.toUpperCase()}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => deleteTask(task._id, task.name)} style={s.deleteBtn}>
                                    <Ionicons name="trash-outline" size={16} color={colors.muted} />
                                </TouchableOpacity>
                            </View>
                        ))}

                        {/* Add form */}
                        {showAddForm && (
                            <View style={s.addForm}>
                                <TextInput
                                    style={s.taskInput}
                                    placeholder="Task name (e.g. Math, Physics)"
                                    placeholderTextColor={colors.muted}
                                    value={newTaskName}
                                    onChangeText={setNewTaskName}
                                    autoFocus
                                />
                                <Text style={s.priorityLabel}>Priority</Text>
                                <View style={s.priorityRow}>
                                    {(['high', 'medium', 'low'] as Priority[]).map(p => (
                                        <TouchableOpacity
                                            key={p}
                                            style={[s.priorityChip, newPriority === p && { backgroundColor: PRIORITY_COLORS[p] }]}
                                            onPress={() => setNewPriority(p)}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={[s.priorityChipText, newPriority === p && { color: colors.white }]}>
                                                {p.charAt(0).toUpperCase() + p.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <View style={s.addFormBtns}>
                                    <TouchableOpacity
                                        style={s.cancelBtn}
                                        onPress={() => { setShowAddForm(false); setNewTaskName(''); }}
                                    >
                                        <Text style={s.cancelBtnText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[s.saveBtn, (!newTaskName.trim() || addingTask) && s.saveBtnDisabled]}
                                        onPress={addTask}
                                        disabled={!newTaskName.trim() || addingTask}
                                    >
                                        {addingTask
                                            ? <ActivityIndicator color={colors.white} size="small" />
                                            : <Text style={s.saveBtnText}>Add Task</Text>}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {!showAddForm && (
                            <TouchableOpacity style={s.addTaskBtn} onPress={() => setShowAddForm(true)} activeOpacity={0.75}>
                                <Ionicons name="add" size={18} color={colors.ink} />
                                <Text style={s.addTaskBtnText}>Add Task</Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}
            </View>

            {/* Focus Goals */}
            <Text style={s.sectionLabel}>FOCUS GOALS</Text>
            <View style={s.selectCard}>
                <Text style={s.rowLabel}>Daily Goal</Text>
                <Text style={s.rowDesc}>Target focus time per day</Text>
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

            {/* Session Defaults */}
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

            {/* Preferences */}
            <Text style={s.sectionLabel}>PREFERENCES</Text>
            <View style={s.card}>
                <ToggleRow
                    label="Notifications"
                    desc="Session reminders and completion alerts"
                    value={user.notificationsEnabled}
                    onChange={v => updateAndSync({ notificationsEnabled: v })}
                />
            </View>

            <View style={{ height: 48 }} />
        </ScrollView>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    container: { paddingHorizontal: spacing.xl, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 48 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
    menuBtn: { width: 40, height: 40, justifyContent: 'center' },
    menuLine: { width: 22, height: 2.5, backgroundColor: colors.ink, borderRadius: 2, marginBottom: 5 },
    title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1.2, marginBottom: 10, marginTop: 4 },
    card: { backgroundColor: colors.card, borderRadius: radii.lg, marginBottom: spacing.lg, overflow: 'hidden', shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    selectCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md, shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    profileRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
    avatarTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.lg },
    profileInfo: { flex: 1 },
    profileName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, marginBottom: 2 },
    profileEmail: { fontSize: fontSize.sm, color: colors.muted },
    toggleRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
    rowInfo: { flex: 1, marginRight: spacing.md },
    rowLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.ink, marginBottom: 2 },
    rowDesc: { fontSize: fontSize.xs + 1, color: colors.muted },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    chip: { paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm, borderRadius: radii.full, borderWidth: 1.5, borderColor: colors.border },
    chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
    chipTxt: { fontSize: fontSize.sm, color: colors.muted, fontWeight: '500' },
    chipTxtOn: { color: colors.white, fontWeight: '600' },

    // Tasks
    emptyTasks: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.md, textAlign: 'center' },
    taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
    priorityDot: { width: 8, height: 8, borderRadius: 4 },
    taskName: { flex: 1, fontSize: fontSize.md, color: colors.ink, fontWeight: '500' },
    priorityBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.full },
    priorityBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },
    deleteBtn: { padding: spacing.xs },
    addTaskBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, gap: spacing.xs },
    addTaskBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
    addForm: { marginTop: spacing.md, gap: spacing.sm },
    taskInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, fontSize: fontSize.md, color: colors.ink },
    priorityLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, letterSpacing: 1, marginTop: spacing.xs },
    priorityRow: { flexDirection: 'row', gap: spacing.sm },
    priorityChip: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border },
    priorityChipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.inkSoft },
    addFormBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    cancelBtn: { flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border },
    cancelBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.muted },
    saveBtn: { flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderRadius: radii.md, backgroundColor: colors.ink },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.white },
});