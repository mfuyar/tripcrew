export const Colors = {
  primary: '#4F7FFF',
  primaryLight: '#EEF3FF',
  secondary: '#FF8C42',
  success: '#34C759',
  warning: '#FF9500',
  danger: '#FF3B30',
  background: '#F8F9FE',
  surface: '#FFFFFF',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  shadow: 'rgba(0,0,0,0.08)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
};

export const Shadow = {
  sm: {
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const DEFAULT_TRIP_EMOJI = '🏖️';

export const TRIP_THEMES: { emoji: string; label: string }[] = [
  { emoji: '🏖️', label: 'Beach' },
  { emoji: '🏔️', label: 'Mountain' },
  { emoji: '❄️', label: 'Snow' },
  { emoji: '🏙️', label: 'City' },
  { emoji: '🏕️', label: 'Camping' },
  { emoji: '🚐', label: 'Road Trip' },
  { emoji: '🛳️', label: 'Cruise' },
  { emoji: '🌲', label: 'Nature' },
  { emoji: '🎉', label: 'Celebration' },
  { emoji: '🍷', label: 'Food & Wine' },
];

export const CATEGORY_ICONS: Record<string, string> = {
  lodging: '🏨',
  groceries: '🛒',
  gas: '⛽',
  restaurant: '🍽️',
  activity: '🎯',
  tickets: '🎟️',
  parking: '🅿️',
  tolls: '🛣️',
  supplies: '📦',
  other: '💸',
};

export const CATEGORY_COLORS: Record<string, string> = {
  lodging: '#4F7FFF',
  groceries: '#34C759',
  gas: '#FF9500',
  restaurant: '#FF8C42',
  activity: '#AF52DE',
  tickets: '#FF2D55',
  parking: '#5AC8FA',
  tolls: '#636366',
  supplies: '#FF3B30',
  other: '#8E8E93',
};

export const FAMILY_COLORS = [
  '#4F7FFF',
  '#FF8C42',
  '#34C759',
  '#AF52DE',
  '#FF2D55',
  '#5AC8FA',
  '#FF9500',
  '#30B0C7',
];
