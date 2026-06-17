// frontend/components/WheelPicker.tsx
// An iOS Clock-style scroll wheel. Built on a snapping Animated.ScrollView so
// the cylinder effect (fade + scale + 3D tilt) is interpolated continuously
// against the scroll offset and driven on the native thread — no per-frame
// re-renders, no native module, so it runs in the existing dev client.
//
// The unit label ("hours" / "min") is pinned beside the centered row, exactly
// like the Clock timer. Used for the session duration on CreateSessionScreen.
import React, { useRef, useEffect } from 'react';
import {
  View, Text, Animated, ScrollView, StyleSheet,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { colors } from '../constants/theme';

const ITEM_HEIGHT = 44;
const VISIBLE     = 5;                              // rows shown (must be odd)
const HEIGHT      = ITEM_HEIGHT * VISIBLE;
const PAD         = ITEM_HEIGHT * Math.floor(VISIBLE / 2);

type Props = {
  values:        number[];
  selectedValue: number;
  onChange:      (value: number) => void;
  unit?:         string;        // pinned label, e.g. 'min'
  width?:        number;
  numberWidth?:  number;        // width of the (right-aligned) number column
  // Fired when the wheel is grabbed / released so the parent can freeze its own
  // scroll — otherwise a vertical drag here also drags the page behind it.
  onInteractionStart?: () => void;
  onInteractionEnd?:   () => void;
};

export default function WheelPicker({
  values, selectedValue, onChange, unit, width = 150, numberWidth = 58,
  onInteractionStart, onInteractionEnd,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY   = useRef(new Animated.Value(0)).current;
  const lastIndex = useRef(Math.max(0, values.indexOf(selectedValue)));

  // Position to the initial value once, without animation.
  useEffect(() => {
    const i = values.indexOf(selectedValue);
    if (i >= 0) {
      const id = setTimeout(() => scrollRef.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: false }), 0);
      return () => clearTimeout(id);
    }
    // mount only — the wheel owns its position afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clampIndex = (i: number) => Math.min(values.length - 1, Math.max(0, i));

  const commit = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = clampIndex(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT));
    if (i !== lastIndex.current) {
      lastIndex.current = i;
      onChange(values[i]);
    }
  };

  return (
    <View style={[styles.row, { width }]}>
      <Animated.ScrollView
        ref={scrollRef}
        style={{ width: numberWidth, height: HEIGHT }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        bounces={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        // Freeze the page while the finger owns the wheel; release on lift so the
        // snap momentum can still settle and commit the final value.
        onTouchStart={onInteractionStart}
        onTouchEnd={onInteractionEnd}
        onTouchCancel={onInteractionEnd}
        onMomentumScrollEnd={commit}
        onScrollEndDrag={commit}
        contentContainerStyle={{ paddingVertical: PAD }}
      >
        {values.map((v, i) => {
          const center     = i * ITEM_HEIGHT;
          const inputRange = [
            center - 2 * ITEM_HEIGHT, center - ITEM_HEIGHT, center,
            center + ITEM_HEIGHT, center + 2 * ITEM_HEIGHT,
          ];
          const opacity = scrollY.interpolate({
            inputRange, outputRange: [0.18, 0.45, 1, 0.45, 0.18], extrapolate: 'clamp',
          });
          const scale = scrollY.interpolate({
            inputRange, outputRange: [0.8, 0.9, 1, 0.9, 0.8], extrapolate: 'clamp',
          });
          const rotateX = scrollY.interpolate({
            inputRange, outputRange: ['52deg', '26deg', '0deg', '-26deg', '-52deg'], extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={v}
              style={[styles.item, { opacity, transform: [{ perspective: 700 }, { rotateX }, { scale }] }]}
            >
              <Text style={styles.num}>{v}</Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      {/* Pinned unit label — vertically centered on the selection row. */}
      {unit ? (
        <View pointerEvents="none" style={styles.labelCol}>
          <Text style={styles.label}>{unit}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row:      { height: HEIGHT, flexDirection: 'row', alignItems: 'center' },
  item:     { height: ITEM_HEIGHT, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 6 },
  num:      { fontSize: 26, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  labelCol: { flex: 1, height: ITEM_HEIGHT, justifyContent: 'center' },
  label:    { fontSize: 17, fontWeight: '400', color: colors.inkSoft },
});
