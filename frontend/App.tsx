// frontend/App.tsx
// Root component. Owns all global state: auth token, sessions, user profile.
// When the token changes, sessions and user settings are re-fetched from the API.
import { useState, useRef, useCallback, useEffect } from 'react';
import { SessionRecord } from './store/sessions';
import { UserProfile, DEFAULT_USER, UserTag } from './store/user';
import { View, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SignUpScreen from './screens/SignUpScreen';
import LoginScreen from './screens/LoginScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import OnboardingScreenTimeScreen, { SCREEN_TIME_ONBOARDING_KEY } from './screens/OnboardingScreenTimeScreen';
import DashboardScreen from './screens/DashboardScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import CreateSessionScreen from './screens/CreateSessionScreen';
import NFCScreen from './screens/NFCScreen';
import ActiveSessionScreen from './screens/ActiveSessionScreen';
import SessionCompleteScreen from './screens/SessionCompleteScreen';
import HistoryScreen from './screens/HistoryScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import AIInsightsScreen from './screens/AIInsightsScreen';
import ComingSoonScreen from './screens/ComingSoonScreen';
import NFCSetupScreen from './screens/NFCSetupScreen';
import Drawer from './components/Drawer';
import { apiFetch, loadTokens, logout as clearAuth, setOnAuthExpired } from './api/client';
import { registerForPush, unregisterPush, cancelLegacyDailyNudge } from './notifications';
import {
  isSupported as screenTimeSupported,
  clearShield as clearScreenTimeShield,
  getAuthorizationStatus as getScreenTimeAuthStatus,
} from 'anchor-screen-time';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

export type ScreenName =
  | 'SignUp' | 'Login' | 'VerifyEmail' | 'OnboardingScreenTime'
  | 'Dashboard' | 'Profile' | 'Settings'
  | 'CreateSession' | 'NFCScan' | 'ActiveSession' | 'SessionComplete'
  | 'History' | 'Analytics' | 'AIInsights' | 'NFCSetup';

export type NavParams = Record<string, string>;
export type NavProps = {
  navigate:         (screen: ScreenName, params?: NavParams) => void;
  replace:          (screen: ScreenName, params?: NavParams) => void;
  params:           NavParams;
  openDrawer:       () => void;
  sessions:         SessionRecord[];
  addSession:       (s: SessionRecord) => void;
  deleteSession:    (id: string) => void;
  refreshSessions:  () => void;
  user:             UserProfile;
  updateUser:       (updates: Partial<UserProfile>) => void;
  userTags:         UserTag[];
  refreshTags:      () => void;
  token:            string | null;
  setToken:         (t: string) => void;
  signOut:          () => void;
};

export type { SessionRecord, UserProfile, UserTag };

const COMING_SOON: ScreenName[] = [];
const NO_DRAWER:   ScreenName[] = ['SignUp', 'Login', 'VerifyEmail', 'OnboardingScreenTime', 'NFCScan', 'ActiveSession', 'SessionComplete'];
const DARK_STATUS: ScreenName[] = ['ActiveSession'];

export default function App() {
  const [current,    setCurrent]    = useState<ScreenName>('SignUp');
  const [params,     setParams]     = useState<NavParams>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessions,   setSessions]   = useState<SessionRecord[]>([]);
  const [user,       setUser]       = useState<UserProfile>(DEFAULT_USER);
  const [userTags,   setUserTags]   = useState<UserTag[]>([]);
  const [token,      setTokenState] = useState<string | null>(null);
  const [hydrated,   setHydrated]   = useState(false);

  // Token persistence lives in api/client (it owns the access+refresh pair and
  // the rotation logic). App only mirrors the access token into state to gate
  // screens and re-trigger data fetches.
  const setToken = useCallback((t: string) => {
    setTokenState(t);
  }, []);

  // Restore persisted tokens on app launch.
  useEffect(() => {
    loadTokens()
      .then(({ accessToken }) => {
        if (accessToken) {
          setTokenState(accessToken);
          setCurrent('Dashboard');
        }
      })
      .catch(console.error)
      .finally(() => setHydrated(true));
  }, []);

  const addSession = useCallback(
    (s: SessionRecord) => setSessions(prev => [s, ...prev]),
    [],
  );
  const deleteSession = useCallback(
    (id: string) => setSessions(prev => prev.filter(s => s.id !== id)),
    [],
  );
  const updateUser = useCallback(
    (updates: Partial<UserProfile>) => setUser(prev => ({ ...prev, ...updates })),
    [],
  );

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const navigate = useCallback((screen: ScreenName, p?: NavParams) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => {
      setParams(prev => {
        // Params merge across navigations, so stale resume keys from an earlier
        // resumed session would make a brand-new session adopt the old session
        // id. Drop them on every ActiveSession entry unless explicitly passed.
        let base = prev;
        if (screen === 'ActiveSession') {
          const { resumeId, resumeStartedAt, ...rest } = prev;
          base = rest;
        }
        return p ? { ...base, ...p } : base;
      });
      setCurrent(screen);
      setDrawerOpen(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  const signOut = useCallback(() => {
    unregisterPush().catch(console.error);   // drop this device's push token (uses current token)
    clearAuth().catch(console.error);   // revoke refresh token server-side + clear local
    setTokenState(null);
    setSessions([]);
    setUser(DEFAULT_USER);
    setUserTags([]);
    setParams({});
    setDrawerOpen(false);
    navigate('Login');
  }, [navigate]);

  // When a refresh fails mid-session, the client gives up and calls this.
  useEffect(() => {
    setOnAuthExpired(signOut);
    return () => setOnAuthExpired(null);
  }, [signOut]);

  // Once authenticated, register this device for push (prompts for permission
  // on first grant, silent thereafter) and hand the token to the backend.
  // Also clear the legacy on-device daily nudge: it used to be a local
  // repeating notification, but it now comes from the backend cron (which can
  // check whether a session already exists that day).
  useEffect(() => {
    if (!token) return;
    registerForPush().catch(console.error);
    cancelLegacyDailyNudge().catch(() => {});
  }, [token]);

  // Handle taps on push notifications — navigate to Dashboard for any type,
  // except while a session is live on screen: leaving ActiveSession unmounts
  // the timer and orphans the session, so in-session alert taps stay put.
  const currentRef = useRef(current);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => {
    const addNotificationResponseListener =
      (Notifications as any).addNotificationResponseReceivedListener ??
      (Notifications as any).addNotificationResponseListener;

    const sub = addNotificationResponseListener?.(() => {
      if (currentRef.current === 'ActiveSession') return;
      navigate('Dashboard');
    });
    return () => sub?.remove?.();
  }, [navigate]);

  const refreshSessions = useCallback(() => {
    if (!token) return;
    apiFetch<SessionRecord[]>('/sessions', token)
      .then(setSessions)
      .catch((e: any) => { if (e?.status === 401) signOut(); });
  }, [token, signOut]);

  // A session is orphaned when the app is killed mid-session: only
  // ActiveSessionScreen ever calls /end, so the session stays ACTIVE in the DB
  // forever ("Incomplete" in History). On launch, finalize any orphan whose
  // full timer window has passed — COMPLETED, since the timer ran its course
  // unattended — and drop back into the live screen for one still mid-window.
  const reconcileOrphans = useCallback(async (list: SessionRecord[]) => {
    if (!token) return;

    // Wall-clock length of the whole session: Pomodoro alternates focus/break
    // phases (mirrors maxRounds in ActiveSessionScreen), countdown is planned.
    const wallMsOf = (s: SessionRecord) => {
      const planned = s.plannedDuration ?? s.duration;
      if (s.timerMode === 'POMODORO') {
        const work   = s.pomodoroWork  ?? 25;
        const brk    = s.pomodoroBreak ?? 5;
        const rounds = Math.max(Math.ceil(planned / work), 1);
        return rounds * (work + brk) * 60_000;
      }
      return planned * 60_000;
    };

    const orphans = list.filter(s => s.status === 'ACTIVE' && s.startedAtISO);
    let ended = false;
    let live: SessionRecord | null = null;

    for (const s of orphans) {
      const startMs = new Date(s.startedAtISO!).getTime();
      const wallMs  = wallMsOf(s);
      if (Date.now() >= startMs + wallMs) {
        try {
          await apiFetch(`/sessions/${s.id}/end`, token, {
            method: 'PATCH',
            body: JSON.stringify({
              status:     'COMPLETED',
              timerState: { actualDuration: s.plannedDuration ?? s.duration },
              endedAt:    new Date(startMs + wallMs).toISOString(),
            }),
          });
          ended = true;
        } catch (e) {
          console.warn('[sessions] failed to finalize orphaned session', e);
        }
      } else if (!live || s.startedAtISO! > live.startedAtISO!) {
        live = s;
      }
    }

    if (ended) refreshSessions();

    // The Screen Time shield persists across app kills (ManagedSettingsStore is
    // system-level). If no session is being resumed, any shield left behind by
    // a killed session would block apps forever — lift it.
    if (!live && screenTimeSupported()) {
      clearScreenTimeShield().catch(() => {});
    }

    if (live) {
      navigate('ActiveSession', {
        resumeId:        live.id,
        resumeStartedAt: live.startedAtISO!,
        duration:        String(live.plannedDuration ?? live.duration),
        pomodoro:        live.timerMode === 'POMODORO' ? 'true' : 'false',
        pomodoroWork:    String(live.pomodoroWork  ?? 25),
        pomodoroBreak:   String(live.pomodoroBreak ?? 5),
        categoryId:      live.categoryId,
        customName:      live.title,
        blockedApps:     (live.blockedApps ?? []).join(','),
        nfcTag:          '',
      });
    }
  }, [token, refreshSessions, navigate]);

  const refreshTags = useCallback(() => {
    if (!token) return;
    apiFetch<UserTag[]>('/user/nfc-tags', token)
      .then(setUserTags)
      .catch(console.error);
  }, [token]);

  // Re-fetch sessions and user profile from the API whenever the token changes.
  // On 401 (expired/invalid token), clear stored auth and bounce to Login.
  useEffect(() => {
    if (!token) {
      setSessions([]);
      return;
    }

    apiFetch<SessionRecord[]>('/sessions', token)
      .then(list => {
        setSessions(list);
        return reconcileOrphans(list);
      })
      .catch((e: any) => {
        if (e?.status === 401) signOut();
        else setSessions([]);
      });

    // Screen Time permission onboarding — once per device, only while iOS has
    // never been asked (notDetermined). Granting, denying, or skipping sets
    // the flag, so this can never nag. A live-session resume wins over it.
    (async () => {
      if (!screenTimeSupported()) return;
      if (await AsyncStorage.getItem(SCREEN_TIME_ONBOARDING_KEY)) return;
      const status = await getScreenTimeAuthStatus();
      if (status !== 'notDetermined') {
        // Already granted/denied elsewhere (e.g. via Create Session) — done.
        await AsyncStorage.setItem(SCREEN_TIME_ONBOARDING_KEY, 'seen');
        return;
      }
      if (currentRef.current === 'ActiveSession') return;   // don't interrupt a resumed session
      navigate('OnboardingScreenTime');
    })().catch(console.error);

    apiFetch<UserTag[]>('/user/nfc-tags', token)
      .then(setUserTags)
      .catch(console.error);

    apiFetch<{ name: string; email: string; createdAt?: string; settings: Record<string, any> }>('/user/me', token)
      .then(me => {
        updateUser({
          name:                 me.name,
          email:                me.email,
          createdAt:            me.createdAt,
          dailyGoalMinutes:     me.settings?.dailyGoalMinutes     ?? 120,
          weeklyGoalMinutes:    me.settings?.weeklyGoalMinutes     ?? 600,
          preferredDuration:    me.settings?.defaultDuration       ?? 25,
          pomodoroEnabled:      me.settings?.defaultTimerMode === 'POMODORO',
          notificationsEnabled: me.settings?.notificationsEnabled  ?? true,
          reminderHour:         me.settings?.reminderHour          ?? 20,
          nudgeHour:            me.settings?.nudgeHour             ?? 9,
          notify: {
            dailyNudge:      me.settings?.notify?.dailyNudge      ?? true,
            inSessionAlerts: me.settings?.notify?.inSessionAlerts ?? true,
            dailySummary:    me.settings?.notify?.dailySummary    ?? true,
            streakAlert:     me.settings?.notify?.streakAlert     ?? true,
            goalNudge:       me.settings?.notify?.goalNudge       ?? true,
            goalAchieved:    me.settings?.notify?.goalAchieved    ?? true,
          },
        });

        // Keep the backend's "today" boundary aligned with this device's local
        // calendar day (used to compute session dateStr) so analytics date-range
        // queries don't silently exclude sessions logged near midnight.
        const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (deviceTz && me.settings?.timezone !== deviceTz) {
          apiFetch('/user/settings', token, {
            method: 'PATCH',
            body: JSON.stringify({ timezone: deviceTz }),
          }).catch(console.error);
        }
      })
      .catch((e: any) => {
        if (e?.status === 401) signOut();
        else console.error(e);
      });
  }, [token, updateUser, signOut, reconcileOrphans]);

  const nav: NavProps = {
    navigate,
    replace:          navigate,
    params,
    openDrawer:       () => setDrawerOpen(true),
    sessions,
    addSession,
    deleteSession,
    refreshSessions,
    user,
    updateUser,
    userTags,
    refreshTags,
    token,
    setToken,
    signOut,
  };

  if (!hydrated) return <View style={{ flex: 1, backgroundColor: '#F6F7F1' }} />;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={DARK_STATUS.includes(current) ? 'light' : 'dark'} />

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {current === 'SignUp'          && <SignUpScreen nav={nav} />}
        {current === 'Login'           && <LoginScreen nav={nav} />}
        {current === 'VerifyEmail'     && <VerifyEmailScreen nav={nav} />}
        {current === 'OnboardingScreenTime' && <OnboardingScreenTimeScreen nav={nav} />}
        {current === 'Dashboard'       && <DashboardScreen nav={nav} />}
        {current === 'Profile'         && <ProfileScreen nav={nav} />}
        {current === 'Settings'        && <SettingsScreen nav={nav} />}
        {current === 'CreateSession'   && <CreateSessionScreen nav={nav} />}
        {current === 'NFCScan'         && <NFCScreen nav={nav} />}
        {current === 'ActiveSession'   && <ActiveSessionScreen nav={nav} />}
        {current === 'SessionComplete' && <SessionCompleteScreen nav={nav} />}
        {current === 'History'         && <HistoryScreen nav={nav} />}
        {current === 'Analytics'       && <AnalyticsScreen nav={nav} />}
        {current === 'AIInsights'      && <AIInsightsScreen nav={nav} />}
        {current === 'NFCSetup'        && <NFCSetupScreen nav={nav} />}
        {COMING_SOON.includes(current) && <ComingSoonScreen nav={nav} screen={current} />}
      </Animated.View>

      {!NO_DRAWER.includes(current) && (
        <Drawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          currentScreen={current}
          nav={nav}
          onSignOut={signOut}
        />
      )}
    </View>
  );
}

