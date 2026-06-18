import { Platform } from 'react-native';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

// We only read the tag's UID. On iOS the NDEF reader session requires the NDEF
// entitlement, which the App Store now rejects on the iOS 26 SDK (ITMS-90778),
// so we use the tag reader session (TAG entitlement) via the MIFARE/NTAG tech —
// the family our presence tags belong to. Android has no such restriction and
// reads the UID fine over NDEF.
const READ_TECH = Platform.OS === 'ios' ? NfcTech.MifareIOS : NfcTech.Ndef;

export async function initNFC(): Promise<void> {
  await NfcManager.start();
}

export async function isNFCSupported(): Promise<boolean> {
  return NfcManager.isSupported();
}

export async function readTag(): Promise<string> {
  try {
    await NfcManager.requestTechnology(READ_TECH);
    const tag = await NfcManager.getTag();
    if (!tag?.id) throw new Error('No tag ID found');
    return tag.id.toUpperCase();
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export function cancelScan(): void {
  NfcManager.cancelTechnologyRequest().catch(() => {});
}
