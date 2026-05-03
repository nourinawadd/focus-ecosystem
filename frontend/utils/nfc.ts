// Stub for Expo Go — react-native-nfc-manager requires a custom dev build.
// isNFCSupported returns false so all NFC UI degrades gracefully (skip buttons stay visible).

export async function initNFC(): Promise<void> {}

export async function isNFCSupported(): Promise<boolean> {
  return false;
}

export async function readTag(): Promise<string> {
  throw new Error('NFC not supported in Expo Go');
}

export function cancelScan(): void {}
