import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type ScreenTimeAuthStatus =
  | 'notDetermined'
  | 'denied'
  | 'approved'
  | 'unknown'
  | 'unsupported';

export interface ScreenTimeSelectionSummary {
  applicationCount: number;
  categoryCount:    number;
  webDomainCount:   number;
}

interface AnchorScreenTimeNativeModule {
  getAuthorizationStatus(): Promise<ScreenTimeAuthStatus>;
  requestAuthorization():   Promise<ScreenTimeAuthStatus>;
  presentPicker():          Promise<ScreenTimeSelectionSummary | null>;
  getSelectionSummary():    Promise<ScreenTimeSelectionSummary | null>;
  hasSelection():           Promise<boolean>;
  clearSelection():         Promise<void>;
  applyShield():            Promise<void>;
  clearShield():            Promise<void>;
}

const noopModule: AnchorScreenTimeNativeModule = {
  getAuthorizationStatus: async () => 'unsupported',
  requestAuthorization:   async () => 'unsupported',
  presentPicker:          async () => null,
  getSelectionSummary:    async () => null,
  hasSelection:           async () => false,
  clearSelection:         async () => {},
  applyShield:            async () => {},
  clearShield:            async () => {},
};

let nativeLoadError: Error | null = null;

function loadNative(): AnchorScreenTimeNativeModule {
  if (Platform.OS !== 'ios') return noopModule;
  try {
    return requireNativeModule<AnchorScreenTimeNativeModule>('AnchorScreenTime');
  } catch (err) {
    nativeLoadError = err instanceof Error ? err : new Error(String(err));
    console.warn(
      '[anchor-screen-time] native module not available — shield will be a no-op.',
      nativeLoadError.message,
    );
    return noopModule;
  }
}

const native: AnchorScreenTimeNativeModule = loadNative();

export const isSupported   = (): boolean => Platform.OS === 'ios';
export const isNativeReady = (): boolean => Platform.OS === 'ios' && nativeLoadError === null;
export const getLoadError  = (): Error | null => nativeLoadError;

export const getAuthorizationStatus = () => native.getAuthorizationStatus();
export const requestAuthorization   = () => native.requestAuthorization();
export const presentPicker          = () => native.presentPicker();
export const getSelectionSummary    = () => native.getSelectionSummary();
export const hasSelection           = () => native.hasSelection();
export const clearSelection         = () => native.clearSelection();
export const applyShield            = () => native.applyShield();
export const clearShield            = () => native.clearShield();

export function summaryTotal(s: ScreenTimeSelectionSummary | null | undefined): number {
  if (!s) return 0;
  return s.applicationCount + s.categoryCount + s.webDomainCount;
}

export function formatSummary(s: ScreenTimeSelectionSummary | null | undefined): string {
  if (!s || summaryTotal(s) === 0) return 'None selected';
  const parts: string[] = [];
  if (s.applicationCount > 0) parts.push(`${s.applicationCount} app${s.applicationCount === 1 ? '' : 's'}`);
  if (s.categoryCount    > 0) parts.push(`${s.categoryCount} categor${s.categoryCount === 1 ? 'y' : 'ies'}`);
  if (s.webDomainCount   > 0) parts.push(`${s.webDomainCount} site${s.webDomainCount === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
