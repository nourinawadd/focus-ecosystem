// frontend/utils/haptics.ts
// Thin wrapper around expo-haptics so call sites stay terse and crash-safe.
// Every call is fire-and-forget; failures (web, unsupported device, missing
// Taptic Engine) are swallowed so a missing buzz never breaks a flow.
//   • selection — light "tick" for moving between options (wheels, tabs, chips)
//   • light/medium/heavy — impact for taps and confirmations
//   • success/warning/error — notification feedback for outcomes
import * as Haptics from 'expo-haptics';

export const hSelection = () => { Haptics.selectionAsync().catch(() => {}); };
export const hLight  = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const hMedium = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
export const hHeavy  = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); };
export const hSuccess = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
export const hWarning = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); };
export const hError   = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); };
