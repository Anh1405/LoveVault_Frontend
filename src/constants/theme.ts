// src/constants/theme.ts
export type ThemePreset = 'ROSE' | 'VIOLET' | 'PASTEL' | 'MIDNIGHT';
export type ColorMode = 'LIGHT' | 'DARK' | 'SYSTEM';
export type CounterDisplayStyle = 'DAYS_ONLY' | 'YMD_BREAKDOWN' | 'PROGRESS_RING';

export interface ThemeColors {
  primary: string;
  primaryPressed: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  background: string;
  surface: string;
  surfaceVariant: string;
  outline: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  error: string;
  errorContainer: string;
  success: string;
  successContainer: string;
  warning: string;
  warningContainer: string;
  heroGradientOverlay: string;
  mediaCardBg: string;
  backdrop: string;
  rippleLight: string;
  rippleDark: string;
}

const PRESET_ACCENTS: Record<
  ThemePreset,
  {
    primary: string;
    primaryPressed: string;
    lightContainer: string;
    onLightContainer: string;
    darkContainer: string;
    onDarkContainer: string;
  }
> = {
  ROSE: {
    primary: '#E11D48',
    primaryPressed: '#BE123C',
    lightContainer: '#FFE4E6',
    onLightContainer: '#9F1239',
    darkContainer: '#4C0519',
    onDarkContainer: '#FECDD3',
  },
  VIOLET: {
    primary: '#7C3AED',
    primaryPressed: '#6D28D9',
    lightContainer: '#EDE9FE',
    onLightContainer: '#5B21B6',
    darkContainer: '#2E1065',
    onDarkContainer: '#DDD6FE',
  },
  PASTEL: {
    primary: '#EC4899',
    primaryPressed: '#DB2777',
    lightContainer: '#FCE7F3',
    onLightContainer: '#9D174D',
    darkContainer: '#500724',
    onDarkContainer: '#FBCFE8',
  },
  MIDNIGHT: {
    primary: '#38BDF8',
    primaryPressed: '#0284C7',
    lightContainer: '#E0F2FE',
    onLightContainer: '#075985',
    darkContainer: '#082F49',
    onDarkContainer: '#BAE6FD',
  },
};

export function getThemeColors(preset: ThemePreset, isDark: boolean): ThemeColors {
  const accent = PRESET_ACCENTS[preset] || PRESET_ACCENTS.ROSE;

  if (isDark || preset === 'MIDNIGHT') {
    return {
      primary: accent.primary,
      primaryPressed: accent.primaryPressed,
      primaryContainer: accent.darkContainer,
      onPrimaryContainer: accent.onDarkContainer,
      background: '#090D16',
      surface: '#131B2E',
      surfaceVariant: '#1E293B',
      outline: '#334155',
      borderSubtle: '#1E293B',
      textPrimary: '#F8FAFC',
      textSecondary: '#94A3B8',
      error: '#F87171',
      errorContainer: '#450A0A',
      success: '#4ADE80',
      successContainer: '#052E16',
      warning: '#FBBF24',
      warningContainer: '#451A03',
      heroGradientOverlay: 'rgba(9, 13, 22, 0.72)',
      mediaCardBg: '#1E293B',
      backdrop: 'rgba(2, 6, 23, 0.75)',
      rippleLight: 'rgba(255, 255, 255, 0.2)',
      rippleDark: 'rgba(255, 255, 255, 0.1)',
    };
  }

  return {
    primary: accent.primary,
    primaryPressed: accent.primaryPressed,
    primaryContainer: accent.lightContainer,
    onPrimaryContainer: accent.onLightContainer,
    background: '#FAFAFA',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    outline: '#CBD5E1',
    borderSubtle: '#E2E8F0',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    error: '#DC2626',
    errorContainer: '#FEE2E2',
    success: '#16A34A',
    successContainer: '#DCFCE7',
    warning: '#D97706',
    warningContainer: '#FEF3C7',
    heroGradientOverlay: 'rgba(15, 23, 42, 0.48)',
    mediaCardBg: '#1E293B',
    backdrop: 'rgba(15, 23, 42, 0.55)',
    rippleLight: 'rgba(255, 255, 255, 0.24)',
    rippleDark: 'rgba(225, 29, 72, 0.12)',
  };
}

// Giữ PALETTE mặc định để tương thích ngược với LoginScreen, RegisterScreen, PairingScreen
export const PALETTE = getThemeColors('ROSE', false);

export const METRICS = {
  minTouchTarget: 48,
  iosMinTouchTarget: 44,
  radiusSm: 10,
  radiusMd: 16,
  radiusLg: 24,
  paddingHorizontal: 20,
};

export function getZodiacSign(isoBirthDate?: string | null): string {
  if (!isoBirthDate) return 'Chưa rõ cung';
  const parts = isoBirthDate.split('-').map(Number);
  if (parts.length !== 3) return 'Chưa rõ cung';
  const [, month, day] = parts;
  if (!month || !day) return 'Chưa rõ cung';

  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '♈ Bạch Dương';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '♉ Kim Ngưu';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) return '♊ Song Tử';
  if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) return '♋ Cự Giải';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '♌ Sư Tử';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return '♍ Xử Nữ';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 23)) return '♎ Thiên Bình';
  if ((month === 10 && day >= 24) || (month === 11 && day <= 22)) return '♏ Bọ Cạp';
  if ((month === 11 && day >= 23) || (month === 12 && day <= 21)) return '♐ Nhân Mã';
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return '♑ Ma Kết';
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '♒ Bảo Bình';
  return '♓ Song Ngư';
}

export function getGreetingByHour(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Chào buổi sáng';
  if (hour >= 11 && hour < 14) return 'Chào buổi trưa';
  if (hour >= 14 && hour < 18) return 'Chào buổi chiều';
  return 'Buổi tối ấm áp';
}

const DAILY_QUOTES = [
  'Bình yên là khi trở về nhà có người đang đợi.',
  'Mỗi ngày bên nhau đều đáng giá hơn ngàn lời hứa.',
  'Hạnh phúc lớn lên từ những điều nhỏ bé cả hai cùng vun đắp.',
  'Gửi một chút thương nhớ cho ngày dài thêm dịu dàng.',
  'Đi đâu cũng được, miễn là đi cùng nhau.',
  'Cảm ơn vì đã luôn kiên nhẫn và lắng nghe nhau mỗi ngày.',
];

export function getDailyLoveQuote(): string {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}