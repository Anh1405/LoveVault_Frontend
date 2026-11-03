// src/services/notification.service.ts
import { storage } from './storage';
import { api } from './api';
import { useSettingsStore } from '../store/useSettingsStore';

export type AiToneStyle = 'FUNNY' | 'ROMANTIC' | 'GIFT_HINT' | 'SASSY';

export interface ScheduledReminderRecord {
  notificationId: string;
  sourceId: string;
  category: 'ANNIVERSARY' | 'BIRTHDAY' | 'GOAL' | 'DATE_PLAN';
  title: string;
  body: string;
  triggerIso: string;
}

// Dán khóa Gemini API Key của bạn vào giữa cặp dấu nháy đơn bên dưới:
const EMBEDDED_GEMINI_API_KEY = 'DÁN_GEMINI_API_KEY_CỦA_BẠN_VÀO_ĐÂY';

const REGISTRY_KEY = 'lovevault_scheduled_notifications_v1';
const FUN_EXTRAS_STORAGE_KEY = 'lovevault_fun_profile_extras_v2';

export class LocalNotificationService {
  private static async getRegistry(): Promise<Record<string, ScheduledReminderRecord>> {
    try {
      const raw = await storage.getItem(REGISTRY_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private static async saveRegistry(reg: Record<string, ScheduledReminderRecord>): Promise<void> {
    try {
      await storage.setItem(REGISTRY_KEY, JSON.stringify(reg));
    } catch {
      // Bỏ qua lỗi ghi bộ nhớ
    }
  }

  private static getSystemGeminiKey(): string | null {
    const storeState = useSettingsStore?.getState ? useSettingsStore.getState() : null;
    if (storeState?.geminiApiKey && storeState.geminiApiKey.trim()) {
      return storeState.geminiApiKey.trim();
    }

    const envKey =
      typeof process !== 'undefined' && (process as any).env?.EXPO_PUBLIC_GEMINI_API_KEY
        ? String((process as any).env.EXPO_PUBLIC_GEMINI_API_KEY).trim()
        : '';

    if (envKey) return envKey;

    if (
      EMBEDDED_GEMINI_API_KEY &&
      !EMBEDDED_GEMINI_API_KEY.includes('DÁN_GEMINI_API_KEY')
    ) {
      return EMBEDDED_GEMINI_API_KEY.trim();
    }

    return null;
  }

  static async generateAiFunnyReminder(params: {
    title: string;
    category: 'ANNIVERSARY' | 'BIRTHDAY' | 'CUSTOM';
    daysUntilEvent: number;
    partnerName: string;
    tone: AiToneStyle;
  }): Promise<string> {
    const storeState = useSettingsStore?.getState ? useSettingsStore.getState() : null;
    const myNickname = storeState?.myProfile?.nickname || 'Bạn';
    const partnerNickname =
      storeState?.partnerProfile?.nickname || params.partnerName || 'Bạn Đời';

    let favDrink = 'trà sữa';
    let shoeClothSize = 'đúng cỡ';
    let howToComfort = 'dành thời gian bên nhau';

    try {
      const rawExtras = await storage.getItem(FUN_EXTRAS_STORAGE_KEY);
      if (rawExtras) {
        const parsed = JSON.parse(rawExtras);
        if (parsed.favDrink) favDrink = parsed.favDrink;
        if (parsed.shoeClothSize) shoeClothSize = parsed.shoeClothSize;
        if (parsed.howToComfort) howToComfort = parsed.howToComfort;
      }
    } catch {
      // Giữ mặc định
    }

    const toneInstruction: Record<AiToneStyle, string> = {
      FUNNY: 'tự nhiên, hóm hỉnh nhẹ nhàng như lời nhắn đời thường, không dùng từ ngữ kịch tính',
      GIFT_HINT: 'gợi ý tinh tế việc chuẩn bị quà hoặc món đồ uống yêu thích',
      ROMANTIC: 'chân thành, ngắn gọn, ấm áp',
      SASSY: 'trêu đùa nhẹ nhàng giữa hai người yêu nhau',
    };

    const daysCount = Number.isFinite(params.daysUntilEvent) ? params.daysUntilEvent : 1;
    const countdownPhrase =
      daysCount === 0
        ? 'diễn ra hôm nay'
        : daysCount === 1
          ? 'vào ngày mai'
          : `còn ${daysCount} ngày nữa`;

    const promptText = `Viết 1 câu nhắc nhở ngắn gọn (dưới 28 từ, không dùng dấu ngoặc kép, tối đa 1 emoji, không xưng là AI hay trợ lý) nhắc "${myNickname}" về dịp "${params.title}" (${countdownPhrase}). Phong cách: ${toneInstruction[params.tone] || toneInstruction.FUNNY}. Sở thích của "${partnerNickname}": thích "${favDrink}", cỡ đồ "${shoeClothSize}", cách quan tâm "${howToComfort}".`;

    // 1. Gọi qua Backend NestJS nếu có
    try {
      const backendRes = await api.post(
        '/api/v1/ai/generate-reminder',
        { prompt: promptText, ...params },
        { timeout: 4500 },
      );
      if (backendRes.data?.message && typeof backendRes.data.message === 'string') {
        return backendRes.data.message.replace(/^["']|["']$/g, '').trim();
      }
    } catch {
      // Chuyển sang gọi trực tiếp
    }

    // 2. Gọi trực tiếp tới Google Gemini 2.5 Flash
    const apiKey = this.getSystemGeminiKey();
    if (apiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 100,
              },
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (aiText && typeof aiText === 'string') {
            return aiText.replace(/^["']|["']$/g, '').trim();
          }
        }
      } catch {
        // Chuyển xuống câu nhắc dự phòng
      }
    }

    // 3. Nhánh dự phòng cục bộ khi chưa điền API Key hoặc mất mạng
    const daySeed = new Date().getDate() + daysCount;
    const timeText =
      daysCount === 0
        ? `Hôm nay là ${params.title}`
        : `Còn ${daysCount} ngày nữa đến ${params.title}`;

    const naturalPool: Record<AiToneStyle, string[]> = {
      FUNNY: [
        `${timeText}, nhớ đặt lịch hẹn trước kẻo quên nhé.`,
        `${timeText}. Chuẩn bị sẵn một ly ${favDrink} cho ${partnerNickname} là hợp lý nhất.`,
      ],
      GIFT_HINT: [
        `${timeText}. Gợi ý nhỏ: ${partnerNickname} thích ${favDrink} (${shoeClothSize}).`,
        `${timeText}, bạn có thể chuẩn bị một món quà nhỏ hoặc bữa tối cùng ${partnerNickname}.`,
      ],
      ROMANTIC: [
        `${timeText}. Dành một buổi tối trọn vẹn bên ${partnerNickname} nhé.`,
        `${timeText}, nhớ gửi một lời chúc thật sớm cho ${partnerNickname}.`,
      ],
      SASSY: [
        `${timeText}. Quên lịch này là tốn một phiếu hẹn bù cho ${partnerNickname} đấy.`,
        `${timeText}, nhớ lên lịch đi chơi sớm với ${partnerNickname} nha.`,
      ],
    };

    const list = naturalPool[params.tone] || naturalPool.FUNNY;
    return list[daySeed % list.length];
  }

  static async cancelReminder(idOrSourceId?: string | null): Promise<void> {
    if (!idOrSourceId) return;
    const registry = await this.getRegistry();
    let changed = false;

    for (const key of Object.keys(registry)) {
      const item = registry[key];
      if (
        key === idOrSourceId ||
        item.sourceId === idOrSourceId ||
        item.sourceId === `${idOrSourceId}_start` ||
        item.sourceId === `${idOrSourceId}_end`
      ) {
        delete registry[key];
        changed = true;
      }
    }

    if (changed) {
      await this.saveRegistry(registry);
    }
  }

  static async scheduleCustomReminder(params: {
    sourceId: string;
    category: 'ANNIVERSARY' | 'BIRTHDAY' | 'GOAL' | 'DATE_PLAN';
    title: string;
    body: string;
    eventDateIso: string;
    daysBefore: number;
    timeHm: string;
  }): Promise<string | null> {
    await this.cancelReminder(params.sourceId);

    if (params.daysBefore < 0) return null;

    const storeState = useSettingsStore?.getState ? useSettingsStore.getState() : null;
    const notificationPrefs = storeState?.notificationPrefs;

    if (notificationPrefs) {
      if (!notificationPrefs.masterEnabled) return null;
      if (params.category === 'ANNIVERSARY' && !notificationPrefs.enableAnniversary) return null;
      if (params.category === 'BIRTHDAY' && !notificationPrefs.enableBirthday) return null;
      if (params.category === 'GOAL' && !notificationPrefs.enableGoals) return null;
    }

    const [year, month, day] = params.eventDateIso.split('-').map(Number);
    const [rawHour, rawMinute] = params.timeHm.split(':').map(Number);
    if (!year || !month || !day) return null;

    let hour = Number.isFinite(rawHour) ? Math.min(23, Math.max(0, rawHour)) : 9;
    const minute = Number.isFinite(rawMinute) ? Math.min(59, Math.max(0, rawMinute)) : 0;

    if (notificationPrefs && params.category !== 'DATE_PLAN') {
      const [quietEndH] = notificationPrefs.quietHoursEnd.split(':').map(Number);
      const [quietStartH] = notificationPrefs.quietHoursStart.split(':').map(Number);
      if (hour >= quietStartH || hour < quietEndH) {
        hour = Number.isFinite(quietEndH) ? quietEndH : 7;
      }
    }

    const triggerDate = new Date(year, month - 1, day, hour, minute, 0);
    triggerDate.setDate(triggerDate.getDate() - params.daysBefore);

    const now = new Date();
    if (
      triggerDate <= now &&
      params.category !== 'GOAL' &&
      params.category !== 'DATE_PLAN'
    ) {
      triggerDate.setFullYear(now.getFullYear() + 1);
    }

    const hideLock = Boolean(notificationPrefs?.hideLockScreenContent);
    const safeTitle = hideLock ? 'LoveVault: Bạn có một lời nhắc mới' : params.title;
    const safeBody = hideLock
      ? 'Mở ứng dụng để xem chi tiết kỷ niệm của hai bạn.'
      : params.body;

    const notificationId = `notif_${params.sourceId}_${Date.now()}`;
    const registry = await this.getRegistry();
    registry[notificationId] = {
      notificationId,
      sourceId: params.sourceId,
      category: params.category,
      title: safeTitle,
      body: safeBody,
      triggerIso: triggerDate.toISOString(),
    };

    await this.saveRegistry(registry);
    return notificationId;
  }

  /**
   * Đặt lịch thông báo riêng cho Giờ hẹn (kèm số phút báo trước) và Giờ về dự kiến của buổi đi chơi
   */
  static async scheduleDatePlanReminders(params: {
    sourceId?: string;
    title: string;
    dateIso: string;
    startTimeHm: string;
    endTimeHm?: string;
    notifyStartTime: boolean;
    startRemindMinutesBefore: number;
    notifyEndTime: boolean;
    partnerNickname: string;
    locationName?: string;
  }): Promise<{ startNotificationId: string | null; endNotificationId: string | null }> {
    const baseId = params.sourceId || `dateplan_${params.dateIso}_${params.startTimeHm}`;
    await this.cancelReminder(baseId);

    const storeState = useSettingsStore?.getState ? useSettingsStore.getState() : null;
    const notificationPrefs = storeState?.notificationPrefs;
    if (notificationPrefs && !notificationPrefs.masterEnabled) {
      return { startNotificationId: null, endNotificationId: null };
    }

    const [year, month, day] = params.dateIso.split('-').map(Number);
    if (!year || !month || !day) {
      return { startNotificationId: null, endNotificationId: null };
    }

    const hideLock = Boolean(notificationPrefs?.hideLockScreenContent);
    const registry = await this.getRegistry();
    let startNotificationId: string | null = null;
    let endNotificationId: string | null = null;

    // 1. Lên lịch nhắc Giờ hẹn / Đón
    if (params.notifyStartTime) {
      const [sh, sm] = params.startTimeHm.split(':').map(Number);
      const startHour = Number.isFinite(sh) ? Math.min(23, Math.max(0, sh)) : 18;
      const startMin = Number.isFinite(sm) ? Math.min(59, Math.max(0, sm)) : 30;
      const minsBefore = Number.isFinite(params.startRemindMinutesBefore)
        ? Math.max(0, params.startRemindMinutesBefore)
        : 0;

      const startTrigger = new Date(year, month - 1, day, startHour, startMin, 0);
      startTrigger.setMinutes(startTrigger.getMinutes() - minsBefore);

      const rawStartTitle = `Lịch hẹn: ${params.title}`;
      const placeSuffix = params.locationName?.trim()
        ? ` tại ${params.locationName.trim()}`
        : '';
      const rawStartBody =
        minsBefore > 0
          ? `Còn ${minsBefore} phút nữa đến giờ hẹn (${params.startTimeHm}) với ${params.partnerNickname}${placeSuffix}.`
          : `Đã đến giờ hẹn (${params.startTimeHm}) với ${params.partnerNickname}${placeSuffix}.`;

      startNotificationId = `notif_${baseId}_start_${Date.now()}`;
      registry[startNotificationId] = {
        notificationId: startNotificationId,
        sourceId: `${baseId}_start`,
        category: 'DATE_PLAN',
        title: hideLock ? 'LoveVault: Nhắc lịch hẹn sắp tới' : rawStartTitle,
        body: hideLock ? 'Mở ứng dụng để xem chi tiết lịch đi chơi.' : rawStartBody,
        triggerIso: startTrigger.toISOString(),
      };
    }

    // 2. Lên lịch nhắc Giờ về dự kiến
    if (params.notifyEndTime && params.endTimeHm) {
      const [eh, em] = params.endTimeHm.split(':').map(Number);
      const endHour = Number.isFinite(eh) ? Math.min(23, Math.max(0, eh)) : 21;
      const endMin = Number.isFinite(em) ? Math.min(59, Math.max(0, em)) : 30;

      const endTrigger = new Date(year, month - 1, day, endHour, endMin, 0);
      const rawEndTitle = `Nhắc giờ về: ${params.title}`;
      const rawEndBody = `Đã ${params.endTimeHm}, đến giờ về dự kiến của hai bạn rồi nhé.`;

      endNotificationId = `notif_${baseId}_end_${Date.now() + 1}`;
      registry[endNotificationId] = {
        notificationId: endNotificationId,
        sourceId: `${baseId}_end`,
        category: 'DATE_PLAN',
        title: hideLock ? 'LoveVault: Nhắc giờ về dự kiến' : rawEndTitle,
        body: hideLock ? 'Mở ứng dụng để xem chi tiết lịch trình.' : rawEndBody,
        triggerIso: endTrigger.toISOString(),
      };
    }

    await this.saveRegistry(registry);
    return { startNotificationId, endNotificationId };
  }

  static async clearAllReminders(): Promise<void> {
    await this.saveRegistry({});
  }

  static async getAllScheduledCount(): Promise<number> {
    const reg = await this.getRegistry();
    return Object.keys(reg).length;
  }
}

export const NotificationService = LocalNotificationService;
export default LocalNotificationService;