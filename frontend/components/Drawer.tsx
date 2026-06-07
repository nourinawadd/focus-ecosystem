import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, View, Text, TouchableOpacity,
  StyleSheet, Dimensions, Platform, Pressable,
} from 'react-native';
import { ScreenName, NavProps } from '../App';

const W = Dimensions.get('window').width * 0.80;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  currentScreen: ScreenName;
  nav: NavProps;
  onSignOut: () => void;
};

const NAV_ITEMS: { label: string; screen: ScreenName }[] = [
  { label: 'Dashboard',      screen: 'Dashboard'     },
  { label: 'Create Session', screen: 'CreateSession' },
  { label: 'History',        screen: 'History'       },
  { label: 'Analytics',      screen: 'Analytics'     },
  { label: 'AI Insights',    screen: 'AIInsights'    },
  { label: 'NFC Setup',      screen: 'NFCSetup'      },
  { label: 'Settings',       screen: 'Settings'      },
];

export default function Drawer({ isOpen, onClose, currentScreen, nav, onSignOut }: Props) {
  const [visible, setVisible] = useState(false);
  const translateX = useRef(new Animated.Value(-W)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 270, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0.45, duration: 270, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -W, duration: 240, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    }
  }, [isOpen]);

  if (!visible) return null;

  const name = nav.user.name;
  const email = nav.user.email;
  const initial = name.charAt(0).toUpperCase();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim overlay */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>

        {/* User info — horizontal row */}
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{name}</Text>
            {email ? <Text style={styles.userEmail}>{email}</Text> : null}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Nav links — no icons, plain text */}
        <View style={styles.navList}>
          {NAV_ITEMS.map(item => {
            const active = currentScreen === item.screen;
            return (
              <TouchableOpacity
                key={item.screen}
                style={[styles.navItem, active && styles.navItemActive]}
                onPress={() => nav.navigate(item.screen)}
                activeOpacity={0.7}
              >
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sign out — fixed at bottom, plain text */}
        <TouchableOpacity style={styles.signOut} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute', top: 0, left: 0, bottom: 0, width: W,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 64 : 44,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    shadowColor: '#000', shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 12,
  },
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 22,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#111', justifyContent: 'center',
    alignItems: 'center', marginRight: 14,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 2 },
  userEmail: { fontSize: 13, color: '#888' },
  divider: { height: 1, backgroundColor: '#e8e8e8', marginHorizontal: 20, marginBottom: 10 },
  navList: { flex: 1, paddingHorizontal: 12, paddingTop: 6 },
  navItem: {
    paddingVertical: 13, paddingHorizontal: 16,
    borderRadius: 12, marginBottom: 2,
  },
  navItemActive: { backgroundColor: '#111' },
  navLabel: { fontSize: 17, color: '#aaa', fontWeight: '500' },
  navLabelActive: { color: '#fff', fontWeight: '600' },
  signOut: {
    paddingHorizontal: 28, paddingVertical: 18,
    borderTopWidth: 1, borderTopColor: '#efefef',
  },
  signOutText: { fontSize: 16, color: '#e53935', fontWeight: '600' },
});
