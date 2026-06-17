// frontend/screens/OnboardingScreen.tsx
// First-launch intro. A deep-indigo canvas with soft "aura" orbs that drift,
// breathe, and slide as you page — so the two screens' glows flow into one
// another. Page 1 is the brand (logo + name); page 2 is a minimal feature list.
// Built entirely on the native-driven RN Animated API (no extra native deps),
// so transforms/opacity run at 60fps off the JS thread.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Animated, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Platform, Image, Easing,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import { useFonts } from 'expo-font';   // ← re-enable after the rebuild that bundles expo-font
// import { BlurView } from 'expo-blur';   // ← re-enable after the rebuild; importing now crashes the dev client (resolves native at import). Then delete the `BlurView` stub below + set BLUR_ENABLED = true.
import { Ionicons } from '@expo/vector-icons';
import { NavProps } from '../App';
import { hLight, hMedium, hSelection } from '../utils/haptics';

// Seen-flag: shown once per install, before sign-up. (Reinstalling re-runs it.)
export const INTRO_ONBOARDING_KEY = 'onboarding.intro.seen';

// Palette — a near-black navy canvas with a luminous blue glow concentrated up
// top that falls off to dark at the bottom (mesh-gradient look from the ref).
const BASE       = '#0C1020';  // near-black navy canvas
const MESH_CORE  = '#AEC6FF';  // soft near-white blue (bright core highlight)
const MESH_GLOW  = '#5B86F5';  // luminous periwinkle-blue
const MESH_BLUE  = '#2E5BD0';  // royal blue
const MESH_DEEP  = '#1B2C66';  // deep blue (lower transition)
const MESH_INDIGO = '#313852'; // Twilight Indigo (brand nod, low)
const GLOW_SLATE = '#C3CAD4';  // Pale Slate highlight
const PORCELAIN  = '#F6F7F1';

// Real Gaussian blur over the mesh, for the soft "frosted" look from the ref.
// Disabled until the rebuild bundles expo-blur (see the commented import above).
// To enable post-rebuild: uncomment the import, delete this stub, set true.
const BlurView: any = null;
const BLUR_ENABLED = false;

const FEATURES = [
  { icon: 'timer-outline',       label: 'Timed focus sessions',     sub: 'Countdown or Pomodoro, your call' },
  { icon: 'shield-checkmark-outline', label: 'Block distractions',  sub: 'Shield apps while you work' },
  { icon: 'radio-outline',       label: 'Tap to begin',             sub: 'Scan an NFC tag to prove you showed up' },
  { icon: 'stats-chart-outline', label: 'See your progress',        sub: 'Streaks, focus score and AI insights' },
] as const;

// ─── Soft radial "bloom" faked from concentric translucent circles ───────────
function Bloom({ size, color }: { size: number; color: string }) {
  // Many thin concentric rings with a very low per-ring opacity integrate into a
  // soft, near-gaussian radial falloff (far smoother / blurrier than a few rings).
  const RINGS = 28;
  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: RINGS }).map((_, i) => {
        const t = i / (RINGS - 1);          // 0 outer → 1 inner
        const d = size * (1 - t * 0.96);    // outer ring ≈ full size, inner ≈ small core
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: d, height: d, borderRadius: d / 2,
              backgroundColor: color,
              opacity: 0.015 + t * t * 0.045,   // quadratic ramp → soft edge, denser core
            }}
          />
        );
      })}
    </View>
  );
}

// ─── One animated aura orb: continuous drift + breathing scale + page slide ───
function AuraBlob({
  scrollX, screenW, size, color, x, y, pageDX, range = 22, dur = 7000, delay = 0,
}: {
  scrollX: Animated.Value; screenW: number; size: number; color: string;
  x: number; y: number; pageDX: number; range?: number; dur?: number; delay?: number;
}) {
  const drift   = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const osc = (v: Animated.Value, d: number, dl: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: d, delay: dl, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
    const a = osc(drift, dur, delay);
    const b = osc(breathe, dur * 0.85, delay);
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, []);

  const translateX = Animated.add(
    drift.interpolate({ inputRange: [0, 1], outputRange: [-range, range] }),
    scrollX.interpolate({ inputRange: [0, screenW], outputRange: [0, pageDX], extrapolate: 'clamp' }),
  );
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [range, -range] });
  const scale      = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, transform: [{ translateX }, { translateY }, { scale }] }}
    >
      <Bloom size={size} color={color} />
    </Animated.View>
  );
}

export default function OnboardingScreen({ nav }: { nav: NavProps }) {
  const { width: W, height: H } = Dimensions.get('window');
  // Brand wordmark font. expo-font is a native module that isn't in the current
  // dev client, so it's disabled until the next rebuild. After rebuilding,
  // uncomment the import above + the useFonts line below and delete the
  // `const fontsLoaded = false` stub — the wordmark then renders in Garogier.
  // const [fontsLoaded] = useFonts({ Garogier: require('../assets/fonts/Garogier.ttf') });
  const fontsLoaded = false;
  const scrollRef = useRef<ScrollView>(null);
  const scrollX   = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);

  // Page-1 entrance: logo + name rise and fade in.
  const intro = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: 750, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  const finish = async () => {
    hMedium();
    await AsyncStorage.setItem(INTRO_ONBOARDING_KEY, 'seen').catch(() => {});
    nav.replace('SignUp');
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / W);
    if (i !== page) { setPage(i); hSelection(); }
  };

  const goNext = () => {
    if (page === 0) { hLight(); scrollRef.current?.scrollTo({ x: W, animated: true }); }
    else finish();
  };

  // Cross-fade the two pages' content so they hand off rather than just slide.
  const page1Opacity = scrollX.interpolate({ inputRange: [0, W], outputRange: [1, 0.15], extrapolate: 'clamp' });
  const page2Opacity = scrollX.interpolate({ inputRange: [0, W], outputRange: [0.15, 1], extrapolate: 'clamp' });
  const introStyle = {
    opacity: intro,
    transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  };

  return (
    <View style={[styles.screen, { backgroundColor: BASE }]}>
      {/* ── Animated mesh-gradient layer ───────────────────────────────────── */}
      {/* A bright blue glow clusters up top (a wide royal-blue field + a soft
          near-white core + side accents) and falls off into the near-black
          base toward the bottom. Each bloom drifts/breathes and slides with the
          page, so the whole mesh shimmers and morphs between screens. */}
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
        {/* Hero glow — wide royal-blue field, upper-centre */}
        <AuraBlob scrollX={scrollX} screenW={W} size={W * 1.55} color={MESH_BLUE} x={W * 0.50} y={H * 0.24} pageDX={W * 0.45}  dur={9000}  range={24} />
        {/* Bright soft core */}
        <AuraBlob scrollX={scrollX} screenW={W} size={W * 0.85} color={MESH_CORE} x={W * 0.46} y={H * 0.20} pageDX={W * 0.55}  dur={8000}  range={20} delay={200} />
        {/* Periwinkle accent, upper-right */}
        <AuraBlob scrollX={scrollX} screenW={W} size={W * 0.95} color={MESH_GLOW} x={W * 0.84} y={H * 0.12} pageDX={-W * 0.55} dur={10500} range={28} delay={350} />
        {/* Cool patch, upper-left */}
        <AuraBlob scrollX={scrollX} screenW={W} size={W * 0.90} color={MESH_GLOW} x={W * 0.12} y={H * 0.34} pageDX={W * 0.60}  dur={9500}  range={26} delay={500} />
        {/* Deep-blue transition into the dark lower half */}
        <AuraBlob scrollX={scrollX} screenW={W} size={W * 1.25} color={MESH_DEEP} x={W * 0.62} y={H * 0.58} pageDX={-W * 0.4} dur={11000} range={22} delay={150} />
        {/* Faint brand-indigo nod, low — keeps the bottom dark but not flat */}
        <AuraBlob scrollX={scrollX} screenW={W} size={W * 1.00} color={MESH_INDIGO} x={W * 0.22} y={H * 0.88} pageDX={W * 0.5} dur={10000} range={18} delay={700} />
      </View>

      {/* Frosted-glass blur that melts the moving blobs into a soft mesh.
          Sits above the bloom layer (blurs what's behind it) but below the
          content, so headings/buttons stay crisp. Disabled pre-rebuild. */}
      {BLUR_ENABLED && (
        <BlurView
          intensity={80}
          tint="dark"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* ── Skip ───────────────────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.skip} onPress={finish} hitSlop={10} activeOpacity={0.7}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* ── Pages ──────────────────────────────────────────────────────────── */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={onMomentumEnd}
      >
        {/* Page 1 — brand */}
        <View style={{ width: W }}>
          <Animated.View style={[styles.page, { opacity: page1Opacity }]}>
            <Animated.View style={[styles.brandWrap, introStyle]}>
              <Image source={require('../assets/anchor-logo.png')} style={styles.logo} resizeMode="contain" />
              <Text style={[styles.brand, fontsLoaded && { fontFamily: 'Garogier' }]}>Anchor</Text>
              <Text style={styles.tagline}>Stay anchored to what matters.</Text>
            </Animated.View>
          </Animated.View>
        </View>

        {/* Page 2 — minimal feature list */}
        <View style={{ width: W }}>
          <Animated.View style={[styles.page, { opacity: page2Opacity }]}>
            <Text style={styles.featuresTitle}>Everything you need{'\n'}to focus</Text>
            <View style={styles.featureList}>
              {FEATURES.map(f => (
                <View key={f.label} style={styles.featureRow}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={f.icon as any} size={20} color={PORCELAIN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureLabel}>{f.label}</Text>
                    <Text style={styles.featureSub}>{f.sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        </View>
      </Animated.ScrollView>

      {/* ── Footer: dots + CTA ─────────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: Platform.OS === 'ios' ? 44 : 28 }]}>
        <View style={styles.dots}>
          {[0, 1].map(i => {
            const range = [(i - 1) * W, i * W, (i + 1) * W];
            const scale   = scrollX.interpolate({ inputRange: range, outputRange: [1, 1.6, 1], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange: range, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
            return <Animated.View key={i} style={[styles.dot, { opacity, transform: [{ scale }] }]} />;
          })}
        </View>

        <TouchableOpacity style={styles.cta} onPress={goNext} activeOpacity={0.85}>
          <Text style={styles.ctaText}>{page === 0 ? 'Next' : 'Get Started'}</Text>
          <Ionicons name="arrow-forward" size={18} color={BASE} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  skip: {
    position: 'absolute', top: Platform.OS === 'ios' ? 58 : 40, right: 22, zIndex: 10,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  skipText: { color: GLOW_SLATE, fontSize: 15, fontWeight: '600' },

  page: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },

  // Page 1
  brandWrap: { alignItems: 'center' },
  logo:    { width: 132, height: 132, marginBottom: 18 },
  brand:   { fontSize: 46, fontWeight: '800', color: PORCELAIN, letterSpacing: 0.5 },
  tagline: { fontSize: 16, color: GLOW_SLATE, marginTop: 12, textAlign: 'center' },

  // Page 2
  featuresTitle: { fontSize: 30, fontWeight: '800', color: PORCELAIN, textAlign: 'center', lineHeight: 36, marginBottom: 36 },
  featureList: { width: '100%', gap: 18 },
  featureRow:  { flexDirection: 'row', alignItems: 'center', gap: 16 },
  featureIcon: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureLabel: { fontSize: 16, fontWeight: '700', color: PORCELAIN },
  featureSub:   { fontSize: 13, color: GLOW_SLATE, marginTop: 2 },

  // Footer
  footer: { paddingHorizontal: 28, paddingTop: 8 },
  dots:   { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 22 },
  dot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: PORCELAIN },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PORCELAIN, borderRadius: 16, paddingVertical: 17,
  },
  ctaText: { color: BASE, fontSize: 16, fontWeight: '700' },
});
