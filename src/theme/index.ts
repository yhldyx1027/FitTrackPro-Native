// ============================================================
// FitTrack Pro - Theme Configuration
// ============================================================
// Design principles: single accent, tinted shadows, no pure black
// Based on design-taste-frontend-v1 skill

export const Colors = {
  // Base
  background: '#f7f6f4',
  surface: '#ffffff',
  surfaceHover: '#f4f2ef',
  border: '#e4e1dc',
  borderLight: '#efede8',

  // Text
  textPrimary: '#201d1a',
  textSecondary: '#5d5852',
  textMuted: '#a39d95',
  textInverse: '#faf9f7',

  // Accent - deep teal (single accent, saturation < 80%)
  accent: '#16795f',
  accentLight: '#e5f2ed',
  accentMuted: '#9fcdbe',

  // Semantic
  success: '#1f8a70',
  warning: '#dc6b2f',
  danger: '#c83c3c',
  info: '#2f6c8f',

  // Ring colors (dashboard)
  ringIntake: '#dc6b2f',
  ringBurn: '#1f8a70',
  ringCarb: '#2f6c8f',
  ringFat: '#dc9b3f',
  ringProtein: '#c8476c',

  // Quick action dots
  dotPurple: '#7c5ce7',
  dotOrange: '#dc6b2f',
  dotBlue: '#2f6c8f',
  dotGreen: '#1f8a70',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
} as const;

export const BorderRadius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 30,
  full: 9999,
} as const;

export const Shadow = {
  card: {
    shadowColor: '#33291f',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  elevated: {
    shadowColor: '#33291f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  button: {
    shadowColor: '#16795f',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
} as const;

export const Typography = {
  headline: {
    fontSize: 30,
    fontWeight: '700' as const,
    letterSpacing: -0.8,
    lineHeight: 36,
    color: Colors.textPrimary,
  },
  title: {
    fontSize: 20,
    fontWeight: '600' as const,
    letterSpacing: -0.35,
    lineHeight: 27,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: -0.15,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 23,
    color: Colors.textSecondary,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 19,
    color: Colors.textMuted,
  },
  tabularNumber: {
    fontSize: 15,
    fontVariant: ['tabular-nums'] as any,
    lineHeight: 22,
  },
  metricLarge: {
    fontSize: 38,
    fontWeight: '700' as const,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'] as any,
    color: Colors.textPrimary,
  },
} as const;
