import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';

type Props = {
  children: string;
  style?: TextStyle;
  /** Remove default top margin (useful when label is not the first element) */
  noTopMargin?: boolean;
};

export default function SectionLabel({ children, style, noTopMargin = false }: Props) {
  return (
    <Text
      style={[
        styles.label,
        noTopMargin && { marginTop: 0 },
        style,
      ]}
    >
      {children.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize:      fontSize.xs,
    fontWeight:    '600',
    color:         colors.muted,
    letterSpacing: 0.8,
    marginTop:     spacing.xl,
    marginBottom:  spacing.sm + 2,
  },
});
