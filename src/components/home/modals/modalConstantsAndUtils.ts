// src/components/home/modals/modalConstantsAndUtils.ts
import { HeartSkinType, HeartAnimationStyle } from '../../../store/useSettingsStore';
import { AiToneStyle } from '../../../services/notification.service';
import { DatePlanActivityType, TransportMode, DatePlanStop } from '../../../hooks/useCoupleWorkspace';

export const MOOD_LIST = ['😊', '🥰', '🤩', '🥺', '😴', '🔥', '🫂'];
export const HEART_SKINS: HeartSkinType[] = ['❤️', '💖', '🌸', '✨', '🔥', '🧸', '💌'];
export const HEART_ANIM_STYLES: Array<{ id: HeartAnimationStyle; label: string }> = [
  { id: 'FLOAT_UP', label: 'Bay nhẹ' },
  { id: 'BURST_RADIAL', label: 'Tỏa tròn' },
  { id: 'FOUNTAIN', label: 'Đài phun' },
];

export const ADVANCE_DAYS = [
  { label: 'Đúng ngày', value: 0 },
  { label: 'Trước 1 ngày', value: 1 },
  { label: 'Trước 3 ngày', value: 3 },
  { label: 'Trước 7 ngày', value: 7 },
];

export const START_REMINDER_MINS = [
  { label: 'Đúng giờ hẹn', value: 0 },
  { label: 'Trước 15 phút', value: 15 },
  { label: 'Trước 30 phút', value: 30 },
  { label: 'Trước 1 tiếng', value: 60 },
];

export const AI_TONE_CHIPS: Array<{ tone: AiToneStyle; label: string }> = [
  { tone: 'FUNNY', label: 'Vui vẻ' },
  { tone: 'GIFT_HINT', label: 'Gợi ý quà' },
  { tone: 'ROMANTIC', label: 'Tình cảm' },
  { tone: 'SASSY', label: 'Trêu đùa' },
];

export const DATE_ACTIVITY_OPTIONS: Array<{
  id: DatePlanActivityType;
  label: string;
  icon: string;
}> = [
  { id: 'EAT_AND_DRINK', label: 'Ăn & Cafe', icon: '🍜' },
  { id: 'EAT', label: 'Đi ăn', icon: '🍲' },
  { id: 'DRINK', label: 'Cafe / Trà sữa', icon: '🧋' },
  { id: 'MOVIE', label: 'Xem phim', icon: '🎬' },
  { id: 'WALK', label: 'Dạo phố', icon: '🛵' },
  { id: 'OTHER', label: 'Khác', icon: '✨' },
];

export const TRANSPORT_OPTIONS: Array<{
  id: TransportMode;
  label: string;
  icon: string;
}> = [
  { id: 'PICKUP', label: 'Qua đón tận nơi', icon: '🛵' },
  { id: 'MOTORBIKE', label: 'Tự đi xe máy', icon: '🔑' },
  { id: 'CAR_TAXI', label: 'Ô tô / Đặt xe', icon: '🚗' },
  { id: 'BUS_METRO', label: 'Buýt / Metro', icon: '🚇' },
  { id: 'WALK', label: 'Đi bộ', icon: '👟' },
];

export const STOP_ACTIVITY_LABELS: Record<
  DatePlanStop['activityType'],
  { label: string; badge: string }
> = {
  EAT: { label: 'Ăn uống', badge: 'Ăn' },
  DRINK: { label: 'Cafe / Nước', badge: 'Uống' },
  MOVIE: { label: 'Xem phim', badge: 'Phim' },
  WALK: { label: 'Dạo chơi', badge: 'Chơi' },
  OTHER: { label: 'Hoạt động khác', badge: 'Khác' },
};

export const FUN_DATE_IDEAS = [
  'Đi ăn lẩu nướng hoặc mì cay',
  'Gọi 2 ly trà sữa rồi cùng xem phim tại nhà',
  'Chở nhau đi dạo phố tối',
  'Đi chụp Photobooth lưu ảnh kỷ niệm',
  'Cùng đi siêu thị mua đồ về tự nấu bữa tối',
  'Đi ăn kem tối và trò chuyện',
  'Chơi game cùng nhau xem ai thắng',
];

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toHmString(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function parseHmToDate(hm: string): Date {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

export function hmToMinutes(hm: string): number {
  if (!hm || !hm.includes(':')) return 0;
  const [h, m] = hm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
