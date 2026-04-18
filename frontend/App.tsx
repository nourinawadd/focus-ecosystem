import { useState, useRef, useCallback } from 'react';
import { SessionRecord, SEED_SESSIONS } from './store/sessions';
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

export type ScreenName =
  | 'SignUp' | 'Login' | 'Dashboard' | 'Profile' | 'Settings'
  | 'CreateSession' | 'NFCScan' | 'ActiveSession' | 'SessionComplete'
  | 'History' | 'Analytics' | 'AIInsights' | 'NFCSetup';

export type NavParams = Record<string, string>;
export type NavProps = {
  navigate:      (screen: ScreenName, params?: NavParams) => void;
  replace:       (screen: ScreenName, params?: NavParams) => void;
  params:        NavParams;
  openDrawer:    () => void;
  // ── Session store ──────────────────────────────────────────────────────────
  sessions:      SessionRecord[];
  addSession:    (s: SessionRecord) => void;
  deleteSession: (id: string) => void;
  // ── User / preferences ─────────────────────────────────────────────────────
  user:          UserProfile;
  updateUser:    (updates: Partial<UserProfile>) => void;
};

export type { SessionRecord, UserProfile };

const COMING_SOON: ScreenName[] = ['AIInsights', 'NFCSetup'];
const NO_DRAWER:   ScreenName[] = ['SignUp', 'Login', 'NFCScan', 'ActiveSession', 'SessionComplete'];
const DARK_STATUS: ScreenName[] = ['ActiveSession'];

export default function App() {
  const [current,    setCurrent]    = useState<ScreenName>('SignUp');
  const [params,     setParams]     = useState<NavParams>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessions,   setSessions]   = useState<SessionRecord[]>(SEED_SESSIONS);
  const [user,       setUser]       = useState<UserProfile>(DEFAULT_USER);

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

  // ── Cross-screen fade transition ────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const navigate = useCallback((screen: ScreenName, p?: NavParams) => {
    // Fade out → swap screen → fade in
    Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => {
      if (p) setParams(prev => ({ ...prev, ...p }));
      setCurrent(screen);
      setDrawerOpen(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  const signOut = useCallback(() => {
    setParams({});
    setDrawerOpen(false);
    navigate('Login');
  }, [navigate]);

  const nav: NavProps = {
    navigate,
    replace:       navigate,
    params,
    openDrawer:    () => setDrawerOpen(true),
    sessions,
    addSession,
    deleteSession,
    user,
    updateUser,
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={DARK_STATUS.includes(current) ? 'light' : 'dark'} />

      {/* All screens fade as one unit */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {current === 'SignUp'          && <SignUpScreen nav={nav} />}
        {current === 'Login'           && <LoginScreen nav={nav} />}
        {current === 'Dashboard'       && <DashboardScreen nav={nav} />}
        {current === 'Profile'         && <ProfileScreen nav={nav} />}
        {current === 'Settings'        && <SettingsScreen nav={nav} />}
        {current === 'CreateSession'   && <CreateSessionScreen nav={nav} />}
        {current === 'NFCScan'         && <NFCScreen nav={nav} />}
        {current === 'ActiveSession'    && <ActiveSessionScreen nav={nav} />}
        {current === 'SessionComplete'  && <SessionCompleteScreen nav={nav} />}
        {current === 'History'          && <HistoryScreen nav={nav} />}
        {current === 'Analytics'        && <AnalyticsScreen nav={nav} />}
        {COMING_SOON.includes(current)  && <ComingSoonScreen nav={nav} screen={current} />}
      </Animated.View>

      {/* Drawer sits above the fade layer so it slides independently */}
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
