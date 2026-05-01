// frontend/App.tsx
// Root component. Owns all global state: auth token, sessions, user profile.
// When the token changes, sessions and user settings are re-fetched from the API.
import { useState, useRef, useCallback, useEffect } from 'react';
import { SessionRecord } from './store/sessions';
import { UserProfile, DEFAULT_USER } from './store/user';
import { View, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SignUpScreen from './screens/SignUpScreen';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import CreateSessionScreen from './screens/CreateSessionScreen';
import NFCScreen from './screens/NFCScreen';
import ActiveSessionScreen from './screens/ActiveSessionScreen';
import SessionCompleteScreen from './screens/SessionCompleteScreen';
import HistoryScreen from './screens/HistoryScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import ComingSoonScreen from './screens/ComingSoonScreen';
import Drawer from './components/Drawer';
import { apiFetch } from './api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth.token';

export type ScreenName =
  | 'SignUp' | 'Login' | 'Dashboard' | 'Profile' | 'Settings'
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
  token:            string | null;
  setToken:         (t: string) => void;
  signOut:          () => void;
};

export type { SessionRecord, UserProfile };

const COMING_SOON: ScreenName[] = ['AIInsights', 'NFCSetup'];
const NO_DRAWER:   ScreenName[] = ['SignUp', 'Login', 'NFCScan', 'ActiveSession', 'SessionComplete'];
const DARK_STATUS: ScreenName[] = ['ActiveSession'];

export default function App() {
  const [current,    setCurrent]    = useState<ScreenName>('SignUp');
  const [params,     setParams]     = useState<NavParams>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessions,   setSessions]   = useState<SessionRecord[]>([]);
  const [user,       setUser]       = useState<UserProfile>(DEFAULT_USER);
  const [token,      setTokenState] = useState<string | null>(null);
  const [hydrated,   setHydrated]   = useState(false);

  const setToken = useCallback((t: string) => {
    setTokenState(t);
    AsyncStorage.setItem(TOKEN_KEY, t).catch(console.error);
  }, []);

  // Restore persisted token on app launch.
  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY)
      .then(stored => {
        if (stored) {
          setTokenState(stored);
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
      if (p) setParams(prev => ({ ...prev, ...p }));
      setCurrent(screen);
      setDrawerOpen(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  const signOut = useCallback(() => {
    AsyncStorage.removeItem(TOKEN_KEY).catch(console.error);
    setTokenState(null);
    setSessions([]);
    setUser(DEFAULT_USER);
    setParams({});
    setDrawerOpen(false);
    navigate('Login');
  }, [navigate]);

  const refreshSessions = useCallback(() => {
    if (!token) return;
    apiFetch<SessionRecord[]>('/sessions', token)
      .then(setSessions)
      .catch((e: any) => { if (e?.status === 401) signOut(); });
  }, [token, signOut]);

  // Re-fetch sessions and user profile from the API whenever the token changes.
  // On 401 (expired/invalid token), clear stored auth and bounce to Login.
  useEffect(() => {
    if (!token) {
      setSessions([]);
      return;
    }

    apiFetch<SessionRecord[]>('/sessions', token)
      .then(setSessions)
      .catch((e: any) => {
        if (e?.status === 401) signOut();
        else setSessions([]);
      });

    apiFetch<{ name: string; email: string; createdAt?: string; settings: Record<string, any> }>('/user/me', token)
      .then(me => updateUser({
        name:                 me.name,
        email:                me.email,
        createdAt:            me.createdAt,
        dailyGoalMinutes:     me.settings?.dailyGoalMinutes     ?? 120,
        weeklyGoalMinutes:    me.settings?.weeklyGoalMinutes     ?? 600,
        preferredDuration:    me.settings?.defaultDuration       ?? 25,
        pomodoroEnabled:      me.settings?.defaultTimerMode === 'POMODORO',
        notificationsEnabled: me.settings?.notificationsEnabled  ?? true,
      }))
      .catch((e: any) => {
        if (e?.status === 401) signOut();
        else console.error(e);
      });
  }, [token, updateUser, signOut]);

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
    token,
    setToken,
    signOut,
  };

  if (!hydrated) return <View style={{ flex: 1, backgroundColor: '#fff' }} />;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={DARK_STATUS.includes(current) ? 'light' : 'dark'} />

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {current === 'SignUp'          && <SignUpScreen nav={nav} />}
        {current === 'Login'           && <LoginScreen nav={nav} />}
        {current === 'Dashboard'       && <DashboardScreen nav={nav} />}
        {current === 'Profile'         && <ProfileScreen nav={nav} />}
        {current === 'Settings'        && <SettingsScreen nav={nav} />}
        {current === 'CreateSession'   && <CreateSessionScreen nav={nav} />}
        {current === 'NFCScan'         && <NFCScreen nav={nav} />}
        {current === 'ActiveSession'   && <ActiveSessionScreen nav={nav} />}
        {current === 'SessionComplete' && <SessionCompleteScreen nav={nav} />}
        {current === 'History'         && <HistoryScreen nav={nav} />}
        {current === 'Analytics'       && <AnalyticsScreen nav={nav} />}
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