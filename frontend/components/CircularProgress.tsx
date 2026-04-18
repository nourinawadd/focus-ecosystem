/**
 * CircularProgress
 *
 * Renders an arc progress ring using the "clip-and-rotate" technique —
 * no SVG or third-party libraries required.
 *
 * How it works:
 *   • Two half-width clip views (left half, right half) each contain a
 *     full-size border-circle.  Rotating those circles reveals/hides
 *     the corresponding quarter of the arc.
 *   • The outer container is rotated –90° so the arc starts at 12 o'clock.
 *   • The `children` area is counter-rotated +90° so content stays upright.
 *
 * Rotation math (angle = progress × 360):
 *   rightDeg = clamp(angle, 0, 180) – 180   → –180 … 0
 *   leftDeg  = clamp(angle–180, 0, 180) – 180 → –180 … 0
 */

import React from 'react';
import { View, ViewStyle } from 'react-native';

type Props = {
  /** 0 = empty, 1 = full */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Arc fill colour */
  color: string;
  /** Dim background ring colour */
  trackColor?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
};

export default function CircularProgress({
  progress,
  size = 220,
  strokeWidth = 11,
  color,
  trackColor = '#2a2a2a',
  children,
  style,
}: Props) {
  const p     = Math.min(Math.max(progress, 0), 1);
  const half  = size / 2;
  const angle = p * 360;

  const rightDeg = `${Math.min(angle, 180) - 180}deg`;
  const leftDeg  = `${Math.max(angle - 180, 0) - 180}deg`;

  // Shared style for both inner border-circles
  const arcCircle: ViewStyle = {
    position:     'absolute',
    width:        size,
    height:       size,
    borderRadius: half,
    borderWidth:  strokeWidth,
    borderColor:  color,
  };

  return (
    // Outer container: –90° so arc starts at 12 o'clock
    <View
      style={[
        { width: size, height: size, transform: [{ rotate: '-90deg' }] },
        style,
      ]}
    >
      {/* Track ring (always full circle, dim colour) */}
      <View
        style={{
          position: 'absolute',
          width: size, height: size,
          borderRadius: half,
          borderWidth: strokeWidth,
          borderColor: trackColor,
        }}
      />

      {/* Right-half clip → reveals first 0–180° of arc */}
      <View
        style={{
          position: 'absolute', top: 0, right: 0,
          width: half, height: size,
          overflow: 'hidden',
        }}
      >
        <View style={[arcCircle, { left: -half, transform: [{ rotate: rightDeg }] }]} />
      </View>

      {/* Left-half clip → reveals next 180–360° of arc */}
      <View
        style={{
          position: 'absolute', top: 0, left: 0,
          width: half, height: size,
          overflow: 'hidden',
        }}
      >
        <View style={[arcCircle, { right: -half, transform: [{ rotate: leftDeg }] }]} />
      </View>

      {/* Centre content — counter-rotated so it appears upright */}
      <View
        style={{
          position:       'absolute',
          width:          size,
          height:         size,
          alignItems:     'center',
          justifyContent: 'center',
          transform:      [{ rotate: '90deg' }],
        }}
      >
        {children}
      </View>
    </View>
  );
}
