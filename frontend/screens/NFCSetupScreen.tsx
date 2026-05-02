import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, Modal, TextInput, ActivityIndicator, Alert, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavProps, UserTag } from '../App';
import { apiFetch } from '../api/client';
import { initNFC, readTag, cancelScan, isNFCSupported } from '../utils/nfc';
import { colors, spacing, radii, fontSize } from '../constants/theme';

type ScanPhase = 'idle' | 'scanning' | 'naming' | 'saving';

export default function NFCSetupScreen({ nav }: { nav: NavProps }) {
  const [scanPhase, setScanPhase]   = useState<ScanPhase>('idle');
  const [scannedUid, setScannedUid] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [nfcReady,   setNfcReady]   = useState(false);

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
    setScanPhase('scanning');
    startPulse();
    try {
      const uid = await readTag();
      stopPulse();

      // Check if already registered on this account
      const already = nav.userTags.some(t => t.tagId.uid === uid);
      if (already) {
        Alert.alert('Already Registered', 'This tag is already linked to your account.');
        setScanPhase('idle');
        return;
      }

      setScannedUid(uid);
      setLabelInput('');
      setScanPhase('naming');
    } catch {
      stopPulse();
      setScanPhase('idle');
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
      nav.refreshTags();
      setScanPhase('idle');
      setScannedUid('');
      setLabelInput('');
    } catch (e: any) {
      setScanPhase('naming');
      Alert.alert('Error', e?.message ?? 'Failed to save tag. Try again.');
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
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to remove tag.');
            }
          },
        },
      ],
    );
  };

  const formatUid = (uid: string) =>
    uid.length > 17 ? uid.slice(0, 14) + '…' : uid;

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.navigate('Settings')}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={s.title}>NFC Tags</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>YOUR TAGS</Text>

        {nav.userTags.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="radio-outline" size={36} color={colors.muted} />
            <Text style={s.emptyTitle}>No tags yet</Text>
            <Text style={s.emptyDesc}>
              Add an NFC tag to verify your physical presence at your focus location.
            </Text>
          </View>
        ) : (
          nav.userTags.map(tag => (
            <View key={tag._id} style={s.tagCard}>
              <View style={s.tagIcon}>
                <Ionicons name="radio-outline" size={22} color={colors.ink} />
              </View>
              <View style={s.tagInfo}>
                <Text style={s.tagLabel}>{tag.label}</Text>
                <Text style={s.tagUid}>{formatUid(tag.tagId.uid)}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteTag(tag)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity
          style={[s.addBtn, !nfcReady && s.addBtnDisabled]}
          onPress={openScanModal}
          activeOpacity={0.8}
          disabled={!nfcReady}
        >
          <Ionicons name="add-circle-outline" size={20} color={nfcReady ? colors.white : colors.muted} />
          <Text style={[s.addBtnText, !nfcReady && s.addBtnTextDisabled]}>
            {nfcReady ? 'Add NFC Tag' : 'NFC Not Available'}
          </Text>
        </TouchableOpacity>

        <Text style={s.hint}>
          Hold your NFC tag or card near the top of your iPhone to scan it.
        </Text>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* Scan / Name modal */}
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
    </View>
  );
}

const s = StyleSheet.create({
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
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1.2, marginBottom: 12, marginTop: 4 },

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
    padding: spacing.lg, marginBottom: spacing.md,
    gap: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  tagIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  tagInfo:  { flex: 1 },
  tagLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.ink },
  tagUid:   { fontSize: fontSize.xs + 1, color: colors.muted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.ink, borderRadius: radii.lg,
    paddingVertical: 16, gap: 8, marginTop: spacing.md,
  },
  addBtnDisabled:     { backgroundColor: colors.border },
  addBtnText:         { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
  addBtnTextDisabled: { color: colors.muted },
  hint: { fontSize: fontSize.xs + 1, color: colors.muted, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },

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
  labelInput: {
    width: '100%', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: fontSize.md, color: colors.ink, marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn:    { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.border },
  cancelBtnText: { fontSize: fontSize.md, fontWeight: '600', color: colors.inkSoft },
  saveBtn:      { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.ink },
  saveBtnDisabled: { backgroundColor: colors.border },
  saveBtnText:  { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
});
