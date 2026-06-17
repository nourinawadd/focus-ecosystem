// ─── Colour palette ──────────────────────────────────────────────────────────
// Brand palette (Dust Grey retired):
//   Graphite #2F2F2F · Twilight Indigo #313852 · Pale Slate #C3CAD4
//   Porcelain #F6F7F1 (app background)   (+ white/black as neutrals)
// Contrast model: text on light surfaces is Indigo (primary) or Graphite
// (secondary) — both high-contrast; Pale Slate is reserved for borders,
// tracks, and subtle text on the dark Indigo cards.
export const colors = {
  // Surfaces
  bg:          '#f4f4f4',  // 
  darkBg:      '#2F2F2F',  // Graphite
  card:        '#FFFFFF',  // white (neutral)
  darkCard:    '#313852',  // Twilight Indigo
  darkCardAlt: '#2F2F2F',  // Graphite

  // Text
  ink:         '#313852',  // Twilight Indigo (primary)
  inkSoft:     '#2F2F2F',  // Graphite (secondary)
  muted:       '#2F2F2F',  // Graphite (visible secondary labels)
  mutedLight:  '#C3CAD4',  // Pale Slate (subtle text on dark cards)
  white:       '#FFFFFF',
  black:       '#000000',

  // Borders / dividers
  border:      '#C3CAD4',  // Pale Slate (visible soft border)
  darkBorder:  '#2F2F2F',  // Graphite (subtle track on dark cards)

  // Accent / status (constrained to the brand palette)
  lime:        '#313852',  // Twilight Indigo
  amber:       '#313852',  // Twilight Indigo
  danger:      '#2F2F2F',  // Graphite
  success:     '#313852',  // Twilight Indigo
  yellow:      '#C3CAD4',  // Pale Slate (fill on dark cards)
} as const;

// ─── Spacing scale ────────────────────────────────────────────────────────────
export const spacing = {
  xxs: 2,
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl: 32,
} as const;

// ─── Border radii ─────────────────────────────────────────────────────────────
export const radii = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  full: 9999,
} as const;

// ─── Font sizes ───────────────────────────────────────────────────────────────
export const fontSize = {
  xs:      11,
  sm:      13,
  md:      15,
  lg:      17,
  xl:      20,
  xxl:     24,
  xxxl:    30,
  display: 52,
} as const;
