import colors from '@/constants/colors';

/**
 * Always returns the black/white light palette so Expo matches the website,
 * regardless of the device dark-mode setting.
 */
export function useColors() {
  return { ...colors.light, radius: colors.radius };
}
