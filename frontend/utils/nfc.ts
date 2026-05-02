import NfcManager, { NfcTech } from 'react-native-nfc-manager';

let started = false;

export async function initNFC(): Promise<void> {
  if (started) return;
  await NfcManager.start();
  started = true;
}

export async function isNFCSupported(): Promise<boolean> {
  return NfcManager.isSupported();
}

// Starts a foreground NFC scan session. On iOS this shows the system NFC sheet.
// Resolves with the tag UID as an uppercase colon-separated hex string (e.g. "04:AB:CD:EF").
// Rejects if the user cancels, the scan times out, or no UID is found.
export async function readTag(): Promise<string> {
  await NfcManager.requestTechnology(NfcTech.Ndef);
  try {
    const tag = await NfcManager.getTag();
    const id = (tag as any)?.id as number[] | undefined;
    if (!id || id.length === 0) throw new Error('Tag has no UID');
    return id.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export function cancelScan(): void {
  NfcManager.cancelTechnologyRequest().catch(() => {});
}
