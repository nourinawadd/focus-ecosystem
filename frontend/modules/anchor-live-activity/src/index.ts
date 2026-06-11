import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export interface LiveActivityContent {
  phase: 'focus' | 'break';
  round: number;
  /** Wall-clock ms timestamp the current phase ends (drives the native countdown). */
  endDateMs: number;
  /** Paused (or finished) — the widget freezes on remainingSecs instead of ticking. */
  paused: boolean;
  remainingSecs: number;
}

export interface LiveActivityStart extends LiveActivityContent {
  sessionName: string;
  isPomo: boolean;
  maxRounds: number;
}

interface AnchorLiveActivityNativeModule {
  areActivitiesEnabled(): Promise<boolean>;
  startActivity(opts: LiveActivityStart): Promise<boolean>;
  updateActivity(opts: LiveActivityContent): Promise<void>;
  endActivity(): Promise<void>;
}

const noopModule: AnchorLiveActivityNativeModule = {
  areActivitiesEnabled: async () => false,
  startActivity:        async () => false,
  updateActivity:       async () => {},
  endActivity:          async () => {},
};

let nativeLoadError: Error | null = null;

function loadNative(): AnchorLiveActivityNativeModule {
  if (Platform.OS !== 'ios') return noopModule;
  try {
    return requireNativeModule<AnchorLiveActivityNativeModule>('AnchorLiveActivity');
  } catch (err) {
    nativeLoadError = err instanceof Error ? err : new Error(String(err));
    console.warn(
      '[anchor-live-activity] native module not available — Live Activities will be a no-op.',
      nativeLoadError.message,
    );
    return noopModule;
  }
}

const native: AnchorLiveActivityNativeModule = loadNative();

export const isSupported   = (): boolean => Platform.OS === 'ios';
export const isNativeReady = (): boolean => Platform.OS === 'ios' && nativeLoadError === null;
export const getLoadError  = (): Error | null => nativeLoadError;

export const areActivitiesEnabled = () => native.areActivitiesEnabled();
export const startActivity        = (opts: LiveActivityStart) => native.startActivity(opts);
export const updateActivity       = (opts: LiveActivityContent) => native.updateActivity(opts);
export const endActivity          = () => native.endActivity();
