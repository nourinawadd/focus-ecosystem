import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { colors, radii } from '../constants/theme';

type Props = {
  children: React.ReactNode;
  /** Use the dark (#1a1a1a) surface instead of white */
  dark?: boolean;
  style?: ViewStyle;
  padding?: number;
};

export default function Card({ children, dark = false, style, padding = 16 }: Props) {
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: dark ? colors.darkCard : colors.card, padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
  },
});
