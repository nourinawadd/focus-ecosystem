import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, fontSize } from '../constants/theme';

type Props = {
  label: string;
  /** Pill background colour */
  bg?: string;
  /** Label text colour */
  color?: string;
  /** Show a small coloured dot before the label */
  dot?: boolean;
  dotColor?: string;
  /** Extra uppercase letter-spacing style */
  caps?: boolean;
};

export default function PillBadge({
  label,
  bg       = colors.card,
  color    = colors.ink,
  dot      = false,
  dotColor = colors.success,
  caps     = false,
}: Props) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
      <Text
        style={[
          styles.label,
          { color },
          caps && { textTransform: 'uppercase', letterSpacing: 1 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   radii.full,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  dot: {
    width: 7, height: 7, borderRadius: 4,
  },
  label: {
    fontSize:   fontSize.xs,
    fontWeight: '700',
  },
});
