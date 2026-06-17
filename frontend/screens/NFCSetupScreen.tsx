import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, Modal, TextInput, ActivityIndicator, Alert, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps, UserTag } from '../App';
import { apiFetch } from '../api/client';
import { initNFC, readTag, cancelScan, isNFCSupported } from '../utils/nfc';
import { hMedium, hSuccess, hWarning, hError } from '../utils/haptics';
import { colors, spacing, radii, fontSize } from '../constants/theme';

type ScanPhase = 'idle' | 'scanning' | 'naming' | 'saving';

export default function NFCSetupScreen({ nav }: { nav: NavProps }) {
  const [scanPhase, setScanPhase]   = useState<ScanPhase>('idle');
  const [scannedUid, setScannedUid] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [nfcReady,   setNfcReady]   = useState(false);

  // Edit (rename / view id / remove) sheet state.
  const [editTag,   setEditTag]   = useState<UserTag | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editBusy,  setEditBusy]  = useState(false);

  // Where Back returns, by where the screen was opened from:
  //   • New Session ("Add an NFC tag") → New Session (also after a successful save)
  //   • Settings                       → Settings
  //   • the drawer (or anywhere else)  → reopen the drawer menu
  const cameFromNewSession = nav.params.from === 'CreateSession';
  const handleBack = () => {
    if (cameFromNewSession)            nav.navigate('CreateSession');
    else if (nav.params.from === 'Settings') nav.navigate('Settings');
    else                               nav.openDrawer();
  };

  // Pulsing ring animation for the scan modal
  const pulse1  = useRef(new Animated.Value(1)).current;
  const pulse2  = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.45)).current;
  const opacity2 = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    initNFC()
      .then(() => isNFCSupported())
      .then(supported => setNfcReady(supported))
      .catch(() => setNfcReady(false));
  }, []);

  const startPulse = () => {
    const ring = (scale: Animated.Value, op: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1.9, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(op,    { toValue: 0,   duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(op,    { toValue: delay === 0 ? 0.45 : 0.25, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
    ring(pulse1, opacity1, 0).start();
    ring(pulse2, opacity2, 750).start();
  };

  const stopPulse = () => {
    pulse1.stopAnimation(); pulse1.setValue(1); opacity1.setValue(0.45);
    pulse2.stopAnimation(); pulse2.setValue(1); opacity2.setValue(0.25);
  };

  const openScanModal = async () => {
    if (!nfcReady) {
      Alert.alert('NFC Not Available', 'This device does not support NFC.');
      return;
    }
    hMedium();
    setScanPhase('scanning');
    startPulse();
    try {
      const uid = await readTag();
      stopPulse();

      // Check if already registered on this account
      const already = nav.userTags.some(t => t.tagId.uid === uid);
      if (already) {
        hWarning();
        Alert.alert('Already Registered', 'This tag is already linked to your account.');
        setScanPhase('idle');
        return;
      }

      hSuccess();
      setScannedUid(uid);
      setLabelInput('');
      setScanPhase('naming');
    } catch (e: any) {
      stopPulse();
      setScanPhase('idle');
      const msg: string = e?.message ?? String(e) ?? '';
      if (!/cancel/i.test(msg)) {
        hError();
        Alert.alert('Scan Failed', msg || 'NFC scan failed. Try again.');
      }
    }
  };

  const cancelModal = () => {
    cancelScan();
    stopPulse();
    setScanPhase('idle');
    setScannedUid('');
    setLabelInput('');
  };

  const saveTag = async () => {
    const label = labelInput.trim();
    if (!label) return;
    setScanPhase('saving');
    try {
      await apiFetch('/user/nfc-tags', nav.token, {
        method: 'POST',
        body: JSON.stringify({ uid: scannedUid, label }),
      });
      hSuccess();
      nav.refreshTags();
      setScanPhase('idle');
      setScannedUid('');
      setLabelInput('');
      if (cameFromNewSession) nav.navigate('CreateSession');
    } catch (e: any) {
      setScanPhase('naming');
      hError();
      Alert.alert('Error', e?.message ?? 'Failed to save tag. Try again.');
    }
  };

  // ── Edit sheet ──────────────────────────────────────────────────────────────
  const openEdit = (tag: UserTag) => {
    setEditTag(tag);
    setEditLabel(tag.label);
  };

  const closeEdit = () => {
    setEditTag(null);
    setEditLabel('');
    setEditBusy(false);
  };

  const saveRename = async () => {
    if (!editTag) return;
    const label = editLabel.trim();
    if (!label || label === editTag.label) { closeEdit(); return; }
    setEditBusy(true);
    try {
      await apiFetch(`/user/nfc-tags/${editTag._id}`, nav.token, {
        method: 'PATCH',
        body: JSON.stringify({ label }),
      });
      nav.refreshTags();
      closeEdit();
    } catch (e: any) {
      setEditBusy(false);
      Alert.alert('Error', e?.message ?? 'Failed to rename tag.');
    }
  };

  const deleteTag = (tag: UserTag) => {
    Alert.alert(
      'Remove Tag',
      `Remove "${tag.label}" from your account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/user/nfc-tags/${tag._id}`, nav.token, { method: 'DELETE' });
              nav.refreshTags();
              closeEdit();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to remove tag.');
            }
          },
        },
      ],
    );
  };

  const formatUid = (uid: string) =>
    uid.length > 14 ? uid.slice(0, 11) + '…' : uid;

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={handleBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={s.title}>Hardware Setup</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>REGISTERED TAGS</Text>

        {nav.userTags.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="radio-outline" size={36} color={colors.muted} />
            <Text style={s.emptyTitle}>No tags yet</Text>
            <Text style={s.emptyDesc}>
              Register an NFC tag to verify your physical presence at your focus location.
            </Text>
          </View>
        ) : (
          nav.userTags.map(tag => (
            <TouchableOpacity key={tag._id} style={s.tagCard} onPress={() => openEdit(tag)} activeOpacity={0.7}>
              <View style={s.tagIcon}>
                <Ionicons name="radio-outline" size={20} color={colors.ink} />
              </View>
              <View style={s.tagInfo}>
                <Text style={s.tagLabel}>{tag.label}</Text>
                <Text style={s.tagUid}>{formatUid(tag.tagId.uid)}</Text>
              </View>
              <Ionicons name="checkmark" size={18} color={colors.mutedLight} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.registerBtn, !nfcReady && s.registerBtnDisabled]}
          onPress={openScanModal}
          activeOpacity={0.85}
          disabled={!nfcReady}
        >
          <Text style={s.registerBtnText}>
            {nfcReady ? 'Register New Tag' : 'NFC Not Available'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scan / Name modal (register a new tag) */}
      <Modal visible={scanPhase !== 'idle'} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {scanPhase === 'scanning' && (
              <>
                <View style={s.ringContainer}>
                  <Animated.View style={[s.ring, { transform: [{ scale: pulse1 }], opacity: opacity1 }]} />
                  <Animated.View style={[s.ring, { transform: [{ scale: pulse2 }], opacity: opacity2 }]} />
                  <View style={s.centerCircle}>
                    <Ionicons name="radio-outline" size={28} color="#fff" />
                  </View>
                </View>
                <Text style={s.modalTitle}>Hold tag to iPhone</Text>
                <Text style={s.modalSub}>Bring your NFC tag close to the top of your phone.</Text>
                <TouchableOpacity style={s.cancelBtn} onPress={cancelModal}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {scanPhase === 'naming' && (
              <>
                <View style={s.successIcon}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.lime} />
                </View>
                <Text style={s.modalTitle}>Tag Detected</Text>
                <Text style={s.modalSub}>Give this tag a name so you can identify it later.</Text>
                <View style={s.idBox}>
                  <Text style={s.idBoxLabel}>NFC ID</Text>
                  <Text style={s.idBoxValue}>{scannedUid}</Text>
                </View>
                <TextInput
                  style={s.labelInput}
                  placeholder="e.g. Desk Tag, Library"
                  placeholderTextColor={colors.muted}
                  value={labelInput}
                  onChangeText={setLabelInput}
                  maxLength={32}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={saveTag}
                />
                <View style={s.modalActions}>
                  <TouchableOpacity style={s.cancelBtn} onPress={cancelModal}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.saveBtn, !labelInput.trim() && s.saveBtnDisabled]}
                    onPress={saveTag}
                    disabled={!labelInput.trim()}
                  >
                    <Text style={s.saveBtnText}>Save Tag</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {scanPhase === 'saving' && (
              <>
                <ActivityIndicator size="large" color={colors.ink} style={{ marginBottom: 16 }} />
                <Text style={s.modalTitle}>Saving…</Text>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit modal (rename / view id / remove) */}
      <Modal visible={editTag !== null} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Edit Tag</Text>

            <View style={s.idBox}>
              <Text style={s.idBoxLabel}>NFC ID</Text>
              <Text style={s.idBoxValue}>{editTag?.tagId.uid}</Text>
            </View>

            <Text style={s.fieldLabel}>TAG NAME</Text>
            <TextInput
              style={s.labelInput}
              placeholder="Tag name"
              placeholderTextColor={colors.muted}
              value={editLabel}
              onChangeText={setEditLabel}
              maxLength={32}
              returnKeyType="done"
              onSubmitEditing={saveRename}
              editable={!editBusy}
            />

            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={closeEdit} disabled={editBusy}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, (!editLabel.trim() || editBusy) && s.saveBtnDisabled]}
                onPress={saveRename}
                disabled={!editLabel.trim() || editBusy}
              >
                {editBusy
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={s.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={s.removeBtn}
              onPress={() => editTag && deleteTag(editTag)}
              disabled={editBusy}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={s.removeBtnText}>Remove Tag</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  header:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: spacing.sm, backgroundColor: colors.bg,
  },
  backBtn:      { width: 40, height: 40, justifyContent: 'center' },
  title:        { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  headerSpacer: { width: 40 },

  body:         { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1.2, marginBottom: 12 },

  emptyCard: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24,
    backgroundColor: colors.card, borderRadius: radii.lg,
    marginBottom: spacing.lg, gap: 10,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  emptyDesc:  { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', lineHeight: 20 },

  tagCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
    gap: spacing.md,
  },
  tagIcon: {
    width: 38, height: 38, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  tagInfo:  { flex: 1 },
  tagLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  tagUid:   { fontSize: fontSize.xs + 1, color: colors.muted, marginTop: 3, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: spacing.md,
  },
  registerBtn: {
    backgroundColor: colors.ink, borderRadius: radii.lg,
    paddingVertical: 18, alignItems: 'center',
  },
  registerBtnDisabled: { backgroundColor: colors.border },
  registerBtnText:     { fontSize: fontSize.md, fontWeight: '700', color: colors.white },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  modalCard: {
    backgroundColor: colors.white, borderRadius: radii.xl,
    padding: 28, alignItems: 'center', width: '100%', maxWidth: 340,
  },
  ringContainer: {
    width: 140, height: 140,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  ring: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: colors.ink,
  },
  centerCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center',
  },
  successIcon:   { marginBottom: 16 },
  modalTitle:    { fontSize: fontSize.xl - 1, fontWeight: '700', color: colors.ink, marginBottom: 8, textAlign: 'center' },
  modalSub:      { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },

  idBox: {
    width: '100%', backgroundColor: colors.bg, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.lg,
  },
  idBoxLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1 },
  idBoxValue: { fontSize: fontSize.sm, color: colors.ink, marginTop: 3, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  fieldLabel: { alignSelf: 'flex-start', fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1, marginBottom: 6 },
  labelInput: {
    width: '100%', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: fontSize.md, color: colors.ink, marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn:    { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.border },
  cancelBtnText: { fontSize: fontSize.md, fontWeight: '600', color: colors.inkSoft },
  saveBtn:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.ink },
  saveBtnDisabled: { backgroundColor: colors.border },
  saveBtnText:  { fontSize: fontSize.md, fontWeight: '700', color: colors.white },

  removeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.lg, paddingVertical: 6 },
  removeBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.danger },
});
