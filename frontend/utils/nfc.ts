import NfcManager, { NfcTech } from 'react-native-nfc-manager';

export async function initNFC(): Promise<void> {
  await NfcManager.start();
}

export async function isNFCSupported(): Promise<boolean> {
  return NfcManager.isSupported();
}

export async function readTag(): Promise<string> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
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
