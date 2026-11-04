// src/store/useSettingsStore.ts
import { create } from 'zustand';
import { AccessibilityInfo, Platform } from 'react-native';
import { storage } from '../services/storage';
import { api } from '../services/api';
import { uploadHeroWallpaperToCloud } from '../services/cloudMediaService';
import { ThemePreset, ColorMode, CounterDisplayStyle } from '../constants/theme';

export type HeartSkinType = '❤️' | '💖' | '🌸' | '✨' | '🔥' | '🧸' | '💌';
export type HeartAnimationStyle = 'FLOAT_UP' | 'BURST_RADIAL' | 'FOUNTAIN';

export interface PersonProfile {
  userId?: string | null;
  nickname: string;
  avatarUri: string | null;
  birthDate: string | null;
  moodEmoji: string;
  customStatusText: string;
  lastActiveAt: string;
}

export type CouponApprovalStatus = 'AVAILABLE' | 'PENDING_APPROVAL' | 'USED';

export interface LoveCouponItem {
  id: string;
  title: string;
  desc: string;
  icon: string;
  ownerUserId?: string | null;
  ownerSlot?: 'USER_1' | 'USER_2';
  createdByUserId?: string | null;
  status: CouponApprovalStatus;
  used: boolean;
  requestedByUserId?: string | null;
  requestedAt?: string | null;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
}

export interface PersonalPrivateNote {
  favDrink: string;
  shoeClothSize: string;
  howToComfort: string;
  secretNote: string;
  updatedAt?: string;
}

export interface NotificationPrefs {
  masterEnabled: boolean;
  enableAnniversary: boolean;
  enableBirthday: boolean;
  enableGoals: boolean;
  enableLocket: boolean;
  enableAiFunnyTone: boolean;
  soundAndVibration: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  hideLockScreenContent: boolean;
}

export interface SocialMessengerPrefs {
  activeStatusOnline: boolean;
  readReceipts: boolean;
  typingIndicator: boolean;
  autoPlayVideos: boolean;
  hdMediaUpload: boolean;
  quickReactionEmoji: string;
  heartBoxSkin: HeartSkinType;
  heartAnimationStyle: HeartAnimationStyle;
  heartTapHaptics: boolean;
}

export interface MomoContributionLog {
  id: string;
  contributorId?: string;
  contributorName: string;
  amount: number;
  goalTitle: string;
  createdAt: string;
}

export interface MomoFundConfig {
  enabled?: boolean;
  holderPhone: string;
  holderName: string;
  momoPaymentLink: string;
  quickAmounts: number[];
  contributions: MomoContributionLog[];
}

interface SyncIdentityPayload {
  userId: string;
  coupleId?: string | null;
  myFullName?: string | null;
  myAvatarUrl?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  partnerAvatarUrl?: string | null;
  sharedRoomPayload?: any;
}

interface SettingsState {
  activeUserId: string | null;
  activeCoupleId: string | null;
  membersById: Record<string, PersonProfile>;
  themePreset: ThemePreset;
  colorMode: ColorMode;
  counterStyle: CounterDisplayStyle;
  countFromOne: boolean;
  enableHeroParticles: boolean;
  systemReduceMotion: boolean;
  heroWallpaperUri: string | null;
  appPinCode: string | null;
  isAppLocked: boolean;
  geminiApiKey: string;
  notificationPrefs: NotificationPrefs;
  socialPrefs: SocialMessengerPrefs;
  myProfile: PersonProfile;
  partnerProfile: PersonProfile;
  myPrivateNote: PersonalPrivateNote;
  loveCoupons: LoveCouponItem[];
  streakDays: number;
  heartTapTotal: number;
  lastMissYouSentAt: string | null;
  momoFund: MomoFundConfig;

  hydrateSettings: (userId?: string | null, coupleId?: string | null) => Promise<void>;
  syncIdentityFromAuth: (payload: SyncIdentityPayload) => Promise<void>;
  pullSharedRoomSettingsFromServer: () => Promise<void>;
  resetMemoryOnLogout: () => void;
  setGeminiApiKey: (key: string) => Promise<void>;
  updateAppearance: (patch: Partial<{
    themePreset: ThemePreset;
    colorMode: ColorMode;
    counterStyle: CounterDisplayStyle;
    countFromOne: boolean;
    enableHeroParticles: boolean;
    heroWallpaperUri: string | null;
  }>) => Promise<void>;
  updateNotificationPrefs: (patch: Partial<NotificationPrefs>) => Promise<void>;
  updateSocialPrefs: (patch: Partial<SocialMessengerPrefs>) => Promise<void>;
  updateProfiles: (myPatch?: Partial<PersonProfile>, partnerPatch?: Partial<PersonProfile>) => Promise<void>;
  updateMyPrivateNote: (patch: Partial<PersonalPrivateNote>) => Promise<void>;
  addLoveCoupon: (
    title: string,
    desc: string,
    icon?: string,
    targetOwner?: 'ME' | 'PARTNER',
  ) => Promise<void>;
  updateLoveCoupon: (
    id: string,
    title: string,
    desc: string,
    icon?: string,
    targetOwner?: 'ME' | 'PARTNER',
  ) => Promise<void>;
  requestUseLoveCoupon: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  respondLoveCouponRequest: (id: string, approve: boolean) => Promise<{ ok: boolean; reason?: string }>;
  toggleLoveCouponUsed: (id: string) => Promise<void>;
  deleteLoveCoupon: (id: string) => Promise<void>;
  incrementHeartTap: (count?: number) => Promise<void>;
  setPinCode: (pin: string | null) => Promise<void>;
  unlockAppWithPin: (inputPin: string) => boolean;
  lockAppNow: () => void;
  recordInteractionStreak: () => Promise<void>;
  updateMomoFund: (patch: Partial<MomoFundConfig>) => Promise<void>;
  recordMomoContribution: (contributorName: string, amount: number, goalTitle: string) => Promise<void>;
}

const getSharedRoomStorageKey = (coupleId?: string | null, userId?: string | null) =>
  `lovevault_room_shared_v6_${coupleId || (userId ? `single_${userId}` : 'guest')}`;

const getUserPrivateStorageKey = (userId?: string | null) =>
  `lovevault_user_private_v6_${userId || 'guest'}`;

// Đếm số lần lưu đang chạy dở, lúc đó không kéo dữ liệu từ server để tránh đè lên thay đổi vừa nhập
let pendingLocalWrites = 0;

// Chấp nhận cả URL http(s) VÀ chuỗi ảnh Base64 (data:image/...) để đồng bộ xuyên suốt giữa các thiết bị
const isSyncableMediaUri = (uri?: string | null): uri is string =>
  typeof uri === 'string' && (/^https?:\/\//i.test(uri) || /^data:image\//i.test(uri));

const isCloudHttpUrl = (uri?: string | null): uri is string =>
  typeof uri === 'string' && /^https?:\/\//i.test(uri);

// Loại bỏ các đường dẫn rỗng hoặc link blob: đã chết trên trình duyệt gây hiện tượng avatar trắng xóa
const cleanAvatarUri = (uri?: string | null): string | null => {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
  if (Platform.OS === 'web' && trimmed.startsWith('blob:')) return null;
  return trimmed;
};

// Dữ liệu kéo từ server có thể chứa đường dẫn file:// nội bộ của máy đối phương.
// Giữ lại link http(s) và data:image/... (Base64) để cả 2 máy đều hiển thị được.
function sanitizeRemoteRoomPayload(remote: any) {
  const next = { ...remote };

  if (!isSyncableMediaUri(next.heroWallpaperUri)) {
    delete next.heroWallpaperUri;
  }

  const rawMap = next.membersById || next.profiles;
  if (rawMap && typeof rawMap === 'object') {
    const cleanMembers: Record<string, any> = {};
    for (const [uid, prof] of Object.entries(rawMap)) {
      if (prof && typeof prof === 'object') {
        const { avatarUri, ...rest } = prof as any;
        cleanMembers[uid] = isSyncableMediaUri(avatarUri) ? { ...rest, avatarUri } : rest;
      } else {
        cleanMembers[uid] = prof;
      }
    }
    next.membersById = cleanMembers;
    next.profiles = cleanMembers;
  }

  return next;
}

const DEFAULT_MY_PROFILE: PersonProfile = {
  userId: null,
  nickname: 'Bạn',
  avatarUri: null,
  birthDate: null,
  moodEmoji: '😊',
  customStatusText: 'Đang nghĩ về người ấy',
  lastActiveAt: 'Đang hoạt động',
};

const DEFAULT_PARTNER_PROFILE: PersonProfile = {
  userId: null,
  nickname: 'Người ấy',
  avatarUri: null,
  birthDate: null,
  moodEmoji: '🥰',
  customStatusText: 'Trực tuyến',
  lastActiveAt: 'Vừa truy cập',
};

const DEFAULT_PRIVATE_NOTE: PersonalPrivateNote = {
  favDrink: 'Trà sữa trân châu trắng ít đường',
  shoeClothSize: 'Áo size M, Giày size 37',
  howToComfort: 'Mua đồ ăn ngon và ôm một cái',
  secretNote: '',
};

const DEFAULT_COUPONS: LoveCouponItem[] = [
  {
    id: 'cp_1',
    icon: '🎟',
    title: 'Phiếu Miễn Giận 1 Lần',
    desc: 'Sử dụng để làm hòa ngay lập tức',
    ownerSlot: 'USER_1',
    status: 'AVAILABLE',
    used: false,
  },
  {
    id: 'cp_2',
    icon: '🧋',
    title: 'Phiếu Trà Sữa Full Topping',
    desc: 'Người kia phải bao ngay 1 ly',
    ownerSlot: 'USER_1',
    status: 'AVAILABLE',
    used: false,
  },
  {
    id: 'cp_3',
    icon: '💆',
    title: 'Phiếu Đấm Lưng 15 Phút',
    desc: 'Áp dụng sau một ngày đi học hoặc đi làm mệt',
    ownerSlot: 'USER_2',
    status: 'AVAILABLE',
    used: false,
  },
  {
    id: 'cp_4',
    icon: '🎬',
    title: 'Quyền Chọn Phim Tối Nay',
    desc: 'Không được phản đối bộ phim đã chọn',
    ownerSlot: 'USER_2',
    status: 'AVAILABLE',
    used: false,
  },
];

const DEFAULT_MOMO_FUND: MomoFundConfig = {
  enabled: true,
  holderPhone: '',
  holderName: 'Quỹ chung hai đứa',
  momoPaymentLink: '',
  quickAmounts: [50000, 100000, 200000, 500000],
  contributions: [],
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  masterEnabled: true,
  enableAnniversary: true,
  enableBirthday: true,
  enableGoals: true,
  enableLocket: true,
  enableAiFunnyTone: true,
  soundAndVibration: true,
  quietHoursStart: '22:30',
  quietHoursEnd: '07:00',
  hideLockScreenContent: false,
};

const DEFAULT_SOCIAL_PREFS: SocialMessengerPrefs = {
  activeStatusOnline: true,
  readReceipts: true,
  typingIndicator: true,
  autoPlayVideos: true,
  hdMediaUpload: true,
  quickReactionEmoji: '❤️',
  heartBoxSkin: '❤️',
  heartAnimationStyle: 'FLOAT_UP',
  heartTapHaptics: true,
};

// Hàm gộp 2 hồ sơ an toàn: không bao giờ để giá trị null/rỗng đè mất birthDate hay avatarUri đã có
function mergeProfilePreservingData(
  base: PersonProfile,
  incoming?: Partial<PersonProfile> | null,
  fallback?: Partial<PersonProfile> | null,
): PersonProfile {
  const inc = incoming || {};
  const fb = fallback || {};

  const incomingNick = inc.nickname?.trim();
  const baseNick = base.nickname?.trim();
  const fbNick = fb.nickname?.trim();
  const isGenericNick = (n?: string) =>
    !n || n === 'Bạn' || n === 'Người ấy' || n === 'Bạn Đời' || n === 'User';

  const finalNickname = !isGenericNick(incomingNick)
    ? incomingNick!
    : !isGenericNick(baseNick)
      ? baseNick!
      : !isGenericNick(fbNick)
        ? fbNick!
        : incomingNick || baseNick || fbNick || base.nickname;

  return {
    ...base,
    ...fb,
    ...inc,
    nickname: finalNickname,
    birthDate: inc.birthDate || base.birthDate || fb.birthDate || null,
    avatarUri:
      cleanAvatarUri(inc.avatarUri) ||
      cleanAvatarUri(base.avatarUri) ||
      cleanAvatarUri(fb.avatarUri) ||
      null,
    moodEmoji: inc.moodEmoji || base.moodEmoji || fb.moodEmoji || '😊',
    customStatusText:
      inc.customStatusText || base.customStatusText || fb.customStatusText || 'Trực tuyến',
    lastActiveAt: inc.lastActiveAt || base.lastActiveAt || fb.lastActiveAt || 'Đang hoạt động',
  };
}

function resolveProfilesForViewer(
  membersById: Record<string, PersonProfile>,
  currentUserId: string | null,
  fallbackMy?: PersonProfile,
  fallbackPartner?: PersonProfile,
): { myProfile: PersonProfile; partnerProfile: PersonProfile } {
  const allEntries = Object.entries(membersById || {});

  if (!currentUserId) {
    return {
      myProfile: mergeProfilePreservingData(DEFAULT_MY_PROFILE, fallbackMy),
      partnerProfile: mergeProfilePreservingData(DEFAULT_PARTNER_PROFILE, fallbackPartner),
    };
  }

  const myEntry = membersById[currentUserId];

  // Tìm tất cả các entry không phải của mình (bao gồm cả key thật và key tạm partner_in_...)
  const partnerEntries = allEntries.filter(([uid]) => String(uid) !== String(currentUserId));
  const realPartnerPair = partnerEntries.find(
    ([uid]) => !uid.startsWith('partner_in_') && !uid.startsWith('local_'),
  );
  const primaryPartnerPair = realPartnerPair || partnerEntries[0];

  // Gộp dữ liệu từ mọi entry của partner (để nếu birthDate/avatarUri nằm ở key tạm partner_in_... thì vẫn giữ được)
  let aggregatedPartner: Partial<PersonProfile> = { ...(fallbackPartner || {}) };
  for (const [, prof] of partnerEntries) {
    aggregatedPartner = mergeProfilePreservingData(
      DEFAULT_PARTNER_PROFILE,
      prof,
      aggregatedPartner,
    );
  }

  const resolvedMy: PersonProfile = {
    ...mergeProfilePreservingData(DEFAULT_MY_PROFILE, myEntry, fallbackMy),
    userId: currentUserId,
  };

  const resolvedPartner: PersonProfile = {
    ...mergeProfilePreservingData(
      DEFAULT_PARTNER_PROFILE,
      primaryPartnerPair ? primaryPartnerPair[1] : undefined,
      aggregatedPartner,
    ),
    userId: primaryPartnerPair
      ? primaryPartnerPair[0]
      : fallbackPartner?.userId || null,
  };

  return { myProfile: resolvedMy, partnerProfile: resolvedPartner };
}

function normalizeCouponsForRoom(
  rawCoupons: any[],
  myUserId: string | null,
  partnerUserId: string | null,
): LoveCouponItem[] {
  const list = Array.isArray(rawCoupons) && rawCoupons.length > 0 ? rawCoupons : DEFAULT_COUPONS;
  const sortedUserIds = [myUserId, partnerUserId].filter(Boolean).map(String).sort();
  const user1Id = sortedUserIds[0] || myUserId || null;
  const user2Id = sortedUserIds[1] || partnerUserId || null;

  return list.map((cp, index) => {
    const status: CouponApprovalStatus =
      cp.status === 'PENDING_APPROVAL' || cp.status === 'USED' || cp.status === 'AVAILABLE'
        ? cp.status
        : cp.used
          ? 'USED'
          : 'AVAILABLE';

    let ownerUserId = cp.ownerUserId || null;
    const slot: 'USER_1' | 'USER_2' =
      cp.ownerSlot || (index % 2 === 0 ? 'USER_1' : 'USER_2');

    if (!ownerUserId) {
      ownerUserId = slot === 'USER_1' ? user1Id : user2Id;
    }

    return {
      ...cp,
      icon: cp.icon || '🎟',
      ownerSlot: slot,
      ownerUserId,
      status,
      used: status === 'USED',
    };
  });
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const persistSharedRoomState = async (syncServer = true) => {
    const s = get();
    const roomKey = getSharedRoomStorageKey(s.activeCoupleId, s.activeUserId);
    const sharedPayload = {
      coupleId: s.activeCoupleId,
      membersById: s.membersById,
      // Lưu trực tiếp cả myProfile và partnerProfile vào Storage để khi mở lại app luôn có đủ birthDate & avatarUri
      myProfile: s.myProfile,
      partnerProfile: s.partnerProfile,
      themePreset: s.themePreset,
      colorMode: s.colorMode,
      counterStyle: s.counterStyle,
      countFromOne: s.countFromOne,
      enableHeroParticles: s.enableHeroParticles,
      heroWallpaperUri: s.heroWallpaperUri,
      socialPrefs: s.socialPrefs,
      loveCoupons: s.loveCoupons,
      streakDays: s.streakDays,
      heartTapTotal: s.heartTapTotal,
      lastMissYouSentAt: s.lastMissYouSentAt,
      momoFund: s.momoFund,
      updatedAt: new Date().toISOString(),
    };
    await storage.setItem(roomKey, JSON.stringify(sharedPayload));

    if (syncServer && s.activeCoupleId) {
      api
        .patch('/api/v1/couples/shared-settings', {
          coupleId: s.activeCoupleId,
          ...sharedPayload,
          sharedSettings: {
            ...sharedPayload,
            profiles: s.membersById,
          },
        })
        .catch(() => null);
    }
  };

  const persistPrivateUserState = async () => {
    const s = get();
    const userKey = getUserPrivateStorageKey(s.activeUserId);
    const privatePayload = {
      userId: s.activeUserId,
      appPinCode: s.appPinCode,
      geminiApiKey: s.geminiApiKey,
      notificationPrefs: s.notificationPrefs,
      myPrivateNote: s.myPrivateNote,
    };
    await storage.setItem(userKey, JSON.stringify(privatePayload));
  };

  return {
    activeUserId: null,
    activeCoupleId: null,
    membersById: {},
    themePreset: 'ROSE',
    colorMode: 'LIGHT',
    counterStyle: 'DAYS_ONLY',
    countFromOne: true,
    enableHeroParticles: true,
    systemReduceMotion: false,
    heroWallpaperUri: null,
    appPinCode: null,
    isAppLocked: false,
    geminiApiKey: '',
    notificationPrefs: {
      masterEnabled: true,
      enableAnniversary: true,
      enableBirthday: true,
      enableGoals: true,
      enableLocket: true,
      enableAiFunnyTone: true,
      soundAndVibration: true,
      quietHoursStart: '22:30',
      quietHoursEnd: '07:00',
      hideLockScreenContent: false,
    },
    socialPrefs: {
      activeStatusOnline: true,
      readReceipts: true,
      typingIndicator: true,
      autoPlayVideos: true,
      hdMediaUpload: true,
      quickReactionEmoji: '❤️',
      heartBoxSkin: '❤️',
      heartAnimationStyle: 'FLOAT_UP',
      heartTapHaptics: true,
    },
    myProfile: { ...DEFAULT_MY_PROFILE },
    partnerProfile: { ...DEFAULT_PARTNER_PROFILE },
    myPrivateNote: { ...DEFAULT_PRIVATE_NOTE },
    loveCoupons: DEFAULT_COUPONS,
    streakDays: 1,
    heartTapTotal: 0,
    lastMissYouSentAt: null,
    momoFund: DEFAULT_MOMO_FUND,

    hydrateSettings: async (explicitUserId?: string | null, explicitCoupleId?: string | null) => {
      try {
        const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
        let targetUserId = explicitUserId !== undefined ? explicitUserId : get().activeUserId;
        let targetCoupleId =
          explicitCoupleId !== undefined ? explicitCoupleId : get().activeCoupleId;

        const needUserFallback = explicitUserId === undefined && !targetUserId;
        const needCoupleFallback = explicitCoupleId === undefined && !targetCoupleId;

        if (needUserFallback || needCoupleFallback) {
          const [savedUserRaw, savedCoupleId] = await Promise.all([
            storage.getItem('user_info'),
            storage.getItem('couple_id'),
          ]);
          const cleanSavedCoupleId =
            savedCoupleId && savedCoupleId !== 'paired_active' ? savedCoupleId : null;
          if (savedUserRaw) {
            const parsedUser = JSON.parse(savedUserRaw);
            if (needUserFallback) targetUserId = parsedUser?.id || null;
            if (needCoupleFallback) {
              const userCoupleId =
                parsedUser?.coupleId && parsedUser.coupleId !== 'paired_active'
                  ? parsedUser.coupleId
                  : null;
              targetCoupleId = userCoupleId || cleanSavedCoupleId;
            }
          } else if (needCoupleFallback) {
            targetCoupleId = cleanSavedCoupleId;
          }
        }

        const roomKey = getSharedRoomStorageKey(targetCoupleId, targetUserId);
        const userKey = getUserPrivateStorageKey(targetUserId);

        const [rawRoom, rawPrivate, legacyV4Raw] = await Promise.all([
          storage.getItem(roomKey),
          storage.getItem(userKey),
          storage.getItem('lovevault_settings_v4'),
        ]);

        const parsedRoom = rawRoom
          ? JSON.parse(rawRoom)
          : legacyV4Raw
            ? JSON.parse(legacyV4Raw)
            : {};
        if (!rawRoom && legacyV4Raw) {
          storage.removeItem('lovevault_settings_v4').catch(() => null);
        }
        const parsedPrivate = rawPrivate ? JSON.parse(rawPrivate) : {};

        const nextMembersById: Record<string, PersonProfile> = {};
        for (const [uid, prof] of Object.entries(parsedRoom.membersById || {})) {
          if (prof && typeof prof === 'object') {
            nextMembersById[uid] = {
              ...(prof as PersonProfile),
              avatarUri: cleanAvatarUri((prof as PersonProfile).avatarUri),
            };
          }
        }

        if (targetUserId && parsedRoom.myProfile) {
          nextMembersById[targetUserId] = {
            ...mergeProfilePreservingData(
              DEFAULT_MY_PROFILE,
              nextMembersById[targetUserId],
              parsedRoom.myProfile,
            ),
            userId: targetUserId,
          };
        }

        // Khôi phục đầy đủ cả partnerProfile đã lưu trong parsedRoom (bao gồm birthDate và avatarUri)
        if (parsedRoom.partnerProfile) {
          const existingPartnerKey =
            parsedRoom.partnerProfile.userId ||
            Object.keys(nextMembersById).find((k) => String(k) !== String(targetUserId)) ||
            `partner_in_${targetCoupleId || 'room'}`;

          nextMembersById[existingPartnerKey] = {
            ...mergeProfilePreservingData(
              DEFAULT_PARTNER_PROFILE,
              nextMembersById[existingPartnerKey],
              parsedRoom.partnerProfile,
            ),
            userId: existingPartnerKey,
          };
        }

        const { myProfile, partnerProfile } = resolveProfilesForViewer(
          nextMembersById,
          targetUserId || null,
          parsedRoom.myProfile,
          parsedRoom.partnerProfile,
        );

        const normalizedCoupons = normalizeCouponsForRoom(
          parsedRoom.loveCoupons,
          targetUserId || null,
          partnerProfile.userId || null,
        );

        set((state) => ({
          ...state,
          activeUserId: targetUserId || null,
          activeCoupleId: targetCoupleId || null,
          membersById: nextMembersById,
          themePreset: parsedRoom.themePreset || 'ROSE',
          colorMode: parsedRoom.colorMode || 'LIGHT',
          counterStyle: parsedRoom.counterStyle || 'DAYS_ONLY',
          countFromOne: parsedRoom.countFromOne ?? true,
          enableHeroParticles: parsedRoom.enableHeroParticles ?? true,
          heroWallpaperUri: parsedRoom.heroWallpaperUri ?? null,
          socialPrefs: { ...DEFAULT_SOCIAL_PREFS, ...(parsedRoom.socialPrefs || {}) },
          myProfile,
          partnerProfile,
          loveCoupons: normalizedCoupons,
          streakDays: parsedRoom.streakDays ?? 1,
          heartTapTotal: parsedRoom.heartTapTotal ?? 0,
          lastMissYouSentAt: parsedRoom.lastMissYouSentAt ?? null,
          momoFund: {
            ...DEFAULT_MOMO_FUND,
            ...(parsedRoom.momoFund || {}),
            quickAmounts: Array.isArray(parsedRoom.momoFund?.quickAmounts)
              ? parsedRoom.momoFund.quickAmounts
              : DEFAULT_MOMO_FUND.quickAmounts,
            contributions: Array.isArray(parsedRoom.momoFund?.contributions)
              ? parsedRoom.momoFund.contributions
              : [],
          },
          appPinCode: parsedPrivate.appPinCode ?? null,
          geminiApiKey: parsedPrivate.geminiApiKey || '',
          notificationPrefs: {
            ...DEFAULT_NOTIFICATION_PREFS,
            ...(parsedPrivate.notificationPrefs || {}),
          },
          myPrivateNote: {
            ...DEFAULT_PRIVATE_NOTE,
            ...(parsedPrivate.myPrivateNote || {}),
          },
          systemReduceMotion: Boolean(reduceMotion),
          isAppLocked: Boolean(parsedPrivate.appPinCode),
        }));
      } catch {
        // Giữ mặc định nếu lỗi parse
      }
    },

    syncIdentityFromAuth: async ({
      userId,
      coupleId,
      myFullName,
      myAvatarUrl,
      partnerId,
      partnerName,
      partnerAvatarUrl,
      sharedRoomPayload,
    }) => {
      if (!userId) return;

      const currentState = get();
      const targetCoupleId: string | null =
        coupleId !== undefined ? coupleId : currentState.activeCoupleId;

      if (
        currentState.activeUserId !== userId ||
        currentState.activeCoupleId !== targetCoupleId
      ) {
        await get().hydrateSettings(userId, targetCoupleId);
      }

      set((state) => {
        const mergedMembers: Record<string, PersonProfile> = { ...state.membersById };
        const remoteMembers =
          sharedRoomPayload?.membersById || sharedRoomPayload?.profiles || {};

        // 1. Gộp dữ liệu từ Server vào Local nhưng BẢO TỒN birthDate và avatarUri của CẢ 2 NGƯỜI nếu server trả về null
        for (const [uid, remoteProf] of Object.entries(remoteMembers)) {
          if (remoteProf && typeof remoteProf === 'object') {
            const prevProf = mergedMembers[uid];
            const isMe = String(uid) === String(userId);
            const fallbackStateProf = isMe ? state.myProfile : state.partnerProfile;

            mergedMembers[uid] = {
              ...mergeProfilePreservingData(
                isMe ? DEFAULT_MY_PROFILE : DEFAULT_PARTNER_PROFILE,
                remoteProf as Partial<PersonProfile>,
                mergeProfilePreservingData(
                  isMe ? DEFAULT_MY_PROFILE : DEFAULT_PARTNER_PROFILE,
                  prevProf,
                  fallbackStateProf,
                ),
              ),
              userId: uid,
            };
          }
        }

        // 2. Gom toàn bộ dữ liệu Partner đang nằm ở các key tạm (partner_in_..., local_...) TRƯỚC KHI xóa key tạm!
        let stashedPartnerData: Partial<PersonProfile> = { ...state.partnerProfile };
        Object.entries(mergedMembers).forEach(([k, prof]) => {
          if (String(k) !== String(userId)) {
            stashedPartnerData = mergeProfilePreservingData(
              DEFAULT_PARTNER_PROFILE,
              prof,
              stashedPartnerData,
            );
          }
        });

        // 3. Định vị chính xác ID của Partner
        const realPartnerKey = Object.keys(mergedMembers).find(
          (k) =>
            String(k) !== String(userId) &&
            !k.startsWith('partner_in_') &&
            !k.startsWith('local_'),
        );
        const finalPartnerKey =
          partnerId || realPartnerKey || `partner_in_${targetCoupleId || 'room'}`;

        // 4. Dọn dẹp các key tạm không khớp với finalPartnerKey (dữ liệu đã được cất vào stashedPartnerData ở Bước 2)
        Object.keys(mergedMembers).forEach((k) => {
          if (
            String(k) !== String(userId) &&
            String(k) !== String(finalPartnerKey) &&
            (k.startsWith('partner_in_') || k.startsWith('local_') || Boolean(partnerId))
          ) {
            delete mergedMembers[k];
          }
        });

        // 5. Chuẩn hóa hồ sơ bản thân (bảo toàn birthDate & avatarUri)
        const existingMe = mergeProfilePreservingData(
          DEFAULT_MY_PROFILE,
          mergedMembers[userId],
          state.myProfile,
        );
        const isGenericMyName =
          !existingMe.nickname ||
          existingMe.nickname === 'Bạn' ||
          existingMe.nickname === 'User';

        mergedMembers[userId] = {
          ...existingMe,
          userId,
          nickname:
            isGenericMyName && myFullName ? myFullName.trim() : existingMe.nickname || 'Bạn',
          avatarUri:
            cleanAvatarUri(existingMe.avatarUri) ||
            cleanAvatarUri(state.myProfile.avatarUri) ||
            cleanAvatarUri(myAvatarUrl) ||
            null,
          birthDate: existingMe.birthDate || state.myProfile.birthDate || null,
        };

        // 6. Chuẩn hóa hồ sơ Partner (bảo toàn 100% birthDate & avatarUri từ stashedPartnerData)
        const existingPartner = mergeProfilePreservingData(
          DEFAULT_PARTNER_PROFILE,
          mergedMembers[finalPartnerKey],
          stashedPartnerData,
        );
        const isGenericPartnerName =
          !existingPartner.nickname ||
          existingPartner.nickname === 'Bạn Đời' ||
          existingPartner.nickname === 'Người ấy';

        mergedMembers[finalPartnerKey] = {
          ...existingPartner,
          userId: finalPartnerKey,
          nickname:
            isGenericPartnerName && partnerName
              ? partnerName.trim()
              : existingPartner.nickname || 'Người ấy',
          avatarUri:
            cleanAvatarUri(existingPartner.avatarUri) ||
            cleanAvatarUri(stashedPartnerData.avatarUri) ||
            cleanAvatarUri(partnerAvatarUrl) ||
            null,
          birthDate:
            existingPartner.birthDate ||
            stashedPartnerData.birthDate ||
            state.partnerProfile.birthDate ||
            null,
        };

        const { myProfile, partnerProfile } = resolveProfilesForViewer(
          mergedMembers,
          userId,
          mergedMembers[userId],
          mergedMembers[finalPartnerKey],
        );

        const nextCoupons = normalizeCouponsForRoom(
          sharedRoomPayload?.loveCoupons || state.loveCoupons,
          userId,
          finalPartnerKey,
        );

        const nextHeroWallpaperUri = isSyncableMediaUri(sharedRoomPayload?.heroWallpaperUri)
          ? sharedRoomPayload.heroWallpaperUri
          : state.heroWallpaperUri;

        return {
          activeUserId: userId,
          activeCoupleId: targetCoupleId,
          membersById: mergedMembers,
          heroWallpaperUri: nextHeroWallpaperUri,
          themePreset: sharedRoomPayload?.themePreset || state.themePreset,
          momoFund: sharedRoomPayload?.momoFund
            ? { ...state.momoFund, ...sharedRoomPayload.momoFund }
            : state.momoFund,
          streakDays: sharedRoomPayload?.streakDays ?? state.streakDays,
          heartTapTotal: sharedRoomPayload?.heartTapTotal ?? state.heartTapTotal,
          myProfile,
          partnerProfile,
          loveCoupons: nextCoupons,
        };
      });

      await persistSharedRoomState(false);
    },

    pullSharedRoomSettingsFromServer: async () => {
      const { activeCoupleId, activeUserId } = get();
      if (!activeCoupleId || pendingLocalWrites > 0) return;
      try {
        const res = await api.get('/api/v1/couples/shared-settings', {
          params: { coupleId: activeCoupleId },
        });
        const remote = res.data?.sharedSettings || res.data?.settings || res.data;
        if (remote && typeof remote === 'object') {
          await get().syncIdentityFromAuth({
            userId: activeUserId || '',
            coupleId: activeCoupleId,
            sharedRoomPayload: sanitizeRemoteRoomPayload(remote),
          });
        }
      } catch {
        // Không gọi hydrateSettings ở đây khi rớt mạng để tránh đọc lại cache cũ đè lên state mới
      }
    },

    resetMemoryOnLogout: () => {
      set({
        activeUserId: null,
        activeCoupleId: null,
        membersById: {},
        themePreset: 'ROSE',
        colorMode: 'LIGHT',
        counterStyle: 'DAYS_ONLY',
        countFromOne: true,
        enableHeroParticles: true,
        heroWallpaperUri: null,
        appPinCode: null,
        geminiApiKey: '',
        notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
        socialPrefs: { ...DEFAULT_SOCIAL_PREFS },
        myProfile: { ...DEFAULT_MY_PROFILE },
        partnerProfile: { ...DEFAULT_PARTNER_PROFILE },
        myPrivateNote: { ...DEFAULT_PRIVATE_NOTE },
        loveCoupons: normalizeCouponsForRoom([], null, null),
        streakDays: 1,
        heartTapTotal: 0,
        lastMissYouSentAt: null,
        momoFund: {
          ...DEFAULT_MOMO_FUND,
          quickAmounts: [...DEFAULT_MOMO_FUND.quickAmounts],
          contributions: [],
        },
        isAppLocked: false,
      });
    },

    setGeminiApiKey: async (key: string) => {
      set({ geminiApiKey: key.trim() });
      await persistPrivateUserState();
    },

    updateAppearance: async (patch) => {
      pendingLocalWrites += 1;
      try {
        set((state) => ({ ...state, ...patch }));

        const pickedWallpaper = patch.heroWallpaperUri;
        if (pickedWallpaper && !isCloudHttpUrl(pickedWallpaper)) {
          await persistSharedRoomState(false);
          try {
            const cloudUrl = await uploadHeroWallpaperToCloud(pickedWallpaper);
            if (get().heroWallpaperUri === pickedWallpaper) {
              set({ heroWallpaperUri: cloudUrl });
            }
          } catch {
            // Mất mạng: giữ đường dẫn nội bộ / base64
          }
        }

        await persistSharedRoomState(true);
      } finally {
        pendingLocalWrites -= 1;
      }
    },

    updateNotificationPrefs: async (patch) => {
      set((state) => ({
        notificationPrefs: { ...state.notificationPrefs, ...patch },
      }));
      await persistPrivateUserState();
    },

    updateSocialPrefs: async (patch) => {
      set((state) => ({
        socialPrefs: { ...state.socialPrefs, ...patch },
      }));
      await persistSharedRoomState(true);
    },

    updateProfiles: async (myPatch, partnerPatch) => {
      pendingLocalWrites += 1;
      try {
        let resolvedPartnerUid = '';

        set((state) => {
          const myUid = state.activeUserId || 'local_me';
          const partnerKeyFromMembers = Object.keys(state.membersById).find(
            (k) =>
              String(k) !== String(myUid) &&
              !k.startsWith('partner_in_') &&
              !k.startsWith('local_'),
          );
          const existingPartnerUid =
            (state.partnerProfile.userId &&
            !state.partnerProfile.userId.startsWith('partner_in_')
              ? state.partnerProfile.userId
              : null) ||
            partnerKeyFromMembers ||
            state.partnerProfile.userId ||
            Object.keys(state.membersById).find((k) => String(k) !== String(myUid)) ||
            `partner_in_${state.activeCoupleId || 'room'}`;

          resolvedPartnerUid = existingPartnerUid;

          const updatedMy: PersonProfile = myPatch
            ? {
                ...state.myProfile,
                ...myPatch,
                avatarUri:
                  myPatch.avatarUri !== undefined
                    ? cleanAvatarUri(myPatch.avatarUri)
                    : cleanAvatarUri(state.myProfile.avatarUri),
                userId: myUid,
              }
            : {
                ...state.myProfile,
                avatarUri: cleanAvatarUri(state.myProfile.avatarUri),
                userId: myUid,
              };

          const updatedPartner: PersonProfile = partnerPatch
            ? {
                ...state.partnerProfile,
                ...partnerPatch,
                avatarUri:
                  partnerPatch.avatarUri !== undefined
                    ? cleanAvatarUri(partnerPatch.avatarUri)
                    : cleanAvatarUri(state.partnerProfile.avatarUri),
                userId: existingPartnerUid,
              }
            : {
                ...state.partnerProfile,
                avatarUri: cleanAvatarUri(state.partnerProfile.avatarUri),
                userId: existingPartnerUid,
              };

          const nextMembersById: Record<string, PersonProfile> = {
            ...state.membersById,
            [myUid]: updatedMy,
            [existingPartnerUid]: updatedPartner,
          };

          // Xóa các key tạm nếu đã có key chính thức
          Object.keys(nextMembersById).forEach((k) => {
            if (
              String(k) !== String(myUid) &&
              String(k) !== String(existingPartnerUid) &&
              (k.startsWith('partner_in_') || k.startsWith('local_'))
            ) {
              delete nextMembersById[k];
            }
          });

          return {
            membersById: nextMembersById,
            myProfile: updatedMy,
            partnerProfile: updatedPartner,
          };
        });

        // Lưu xuống bộ nhớ máy ngay lập tức trước khi thử upload ảnh lên Cloud
        await persistSharedRoomState(false);

        // Upload ảnh đại diện của BẢN THÂN lên Cloud nếu chưa phải link http(s)
        const pickedMyAvatar = cleanAvatarUri(myPatch?.avatarUri);
        if (pickedMyAvatar && !isCloudHttpUrl(pickedMyAvatar)) {
          try {
            const cloudUrl = await uploadHeroWallpaperToCloud(pickedMyAvatar);
            if (cloudUrl && get().myProfile.avatarUri === pickedMyAvatar) {
              set((state) => {
                const myUid = state.activeUserId || 'local_me';
                const nextMy: PersonProfile = { ...state.myProfile, avatarUri: cloudUrl };
                return {
                  myProfile: nextMy,
                  membersById: {
                    ...state.membersById,
                    [myUid]: { ...(state.membersById[myUid] || nextMy), avatarUri: cloudUrl },
                  },
                };
              });
            }
          } catch {
            // Nếu upload cloud lỗi, giữ nguyên chuỗi Base64/local URI đã lưu
          }
        }

        // Upload ảnh đại diện của NGƯỜI THƯƠNG lên Cloud (Fix lỗi mất ảnh & trắng ảnh của user còn lại)
        const pickedPartnerAvatar = cleanAvatarUri(partnerPatch?.avatarUri);
        if (pickedPartnerAvatar && !isCloudHttpUrl(pickedPartnerAvatar)) {
          try {
            const cloudPartnerUrl = await uploadHeroWallpaperToCloud(pickedPartnerAvatar);
            if (cloudPartnerUrl && get().partnerProfile.avatarUri === pickedPartnerAvatar) {
              set((state) => {
                const pUid =
                  resolvedPartnerUid ||
                  state.partnerProfile.userId ||
                  `partner_in_${state.activeCoupleId || 'room'}`;
                const nextPartner: PersonProfile = {
                  ...state.partnerProfile,
                  avatarUri: cloudPartnerUrl,
                };
                return {
                  partnerProfile: nextPartner,
                  membersById: {
                    ...state.membersById,
                    [pUid]: {
                      ...(state.membersById[pUid] || nextPartner),
                      avatarUri: cloudPartnerUrl,
                    },
                  },
                };
              });
            }
          } catch {
            // Nếu upload cloud lỗi, chuỗi Base64 vẫn được giữ nguyên và đồng bộ qua shared-settings
          }
        }

        await persistSharedRoomState(true);
      } finally {
        pendingLocalWrites -= 1;
      }
    },

    updateMyPrivateNote: async (patch) => {
      set((state) => ({
        myPrivateNote: {
          ...state.myPrivateNote,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      }));
      await persistPrivateUserState();
    },

    addLoveCoupon: async (title, desc, icon = '🎟', targetOwner = 'ME') => {
      const s = get();
      const myUid = s.activeUserId || 'user_1';
      const partnerUid =
        s.partnerProfile.userId ||
        Object.keys(s.membersById).find((k) => String(k) !== String(myUid)) ||
        'user_2';

      const assignedOwnerId = targetOwner === 'PARTNER' ? partnerUid : myUid;

      const newCoupon: LoveCouponItem = {
        id: `cp_${Date.now()}`,
        title: title.trim(),
        desc: desc.trim(),
        icon,
        ownerUserId: assignedOwnerId,
        createdByUserId: myUid,
        status: 'AVAILABLE',
        used: false,
      };
      set((state) => ({ loveCoupons: [newCoupon, ...state.loveCoupons] }));
      await persistSharedRoomState(true);
    },

    updateLoveCoupon: async (id, title, desc, icon = '🎟', targetOwner) => {
      const s = get();
      const myUid = s.activeUserId || 'user_1';
      const partnerUid =
        s.partnerProfile.userId ||
        Object.keys(s.membersById).find((k) => String(k) !== String(myUid)) ||
        'user_2';

      set((state) => ({
        loveCoupons: state.loveCoupons.map((cp) => {
          if (cp.id !== id) return cp;
          const nextOwnerId =
            targetOwner === 'PARTNER'
              ? partnerUid
              : targetOwner === 'ME'
                ? myUid
                : cp.ownerUserId;
          return {
            ...cp,
            title: title.trim(),
            desc: desc.trim(),
            icon,
            ownerUserId: nextOwnerId,
          };
        }),
      }));
      await persistSharedRoomState(true);
    },

    requestUseLoveCoupon: async (id) => {
      const s = get();
      const currentUid = s.activeUserId || 'local_me';
      const target = s.loveCoupons.find((c) => c.id === id);
      if (!target) return { ok: false, reason: 'Không tìm thấy phiếu hẹn.' };

      if (target.ownerUserId && String(target.ownerUserId) !== String(currentUid)) {
        return {
          ok: false,
          reason: `Phiếu này thuộc phần của ${s.partnerProfile.nickname}, chỉ ${s.partnerProfile.nickname} mới có thể bấm yêu cầu sử dụng.`,
        };
      }

      set((state) => ({
        loveCoupons: state.loveCoupons.map((cp) =>
          cp.id === id
            ? {
                ...cp,
                status: 'PENDING_APPROVAL',
                used: false,
                requestedByUserId: currentUid,
                requestedAt: new Date().toISOString(),
              }
            : cp,
        ),
      }));
      await persistSharedRoomState(true);
      return { ok: true };
    },

    respondLoveCouponRequest: async (id, approve) => {
      const s = get();
      const currentUid = s.activeUserId || 'local_me';
      const target = s.loveCoupons.find((c) => c.id === id);
      if (!target) return { ok: false, reason: 'Không tìm thấy phiếu hẹn.' };

      if (
        target.requestedByUserId &&
        String(target.requestedByUserId) === String(currentUid) &&
        approve
      ) {
        return {
          ok: false,
          reason: `Bạn là người gửi yêu cầu dùng phiếu này. Hãy chờ ${s.partnerProfile.nickname} bấm "Cho phép" nhé!`,
        };
      }

      set((state) => ({
        loveCoupons: state.loveCoupons.map((cp) => {
          if (cp.id !== id) return cp;
          if (approve) {
            return {
              ...cp,
              status: 'USED',
              used: true,
              approvedByUserId: currentUid,
              approvedAt: new Date().toISOString(),
            };
          }
          return {
            ...cp,
            status: 'AVAILABLE',
            used: false,
            requestedByUserId: null,
            requestedAt: null,
          };
        }),
      }));
      await persistSharedRoomState(true);
      return { ok: true };
    },

    toggleLoveCouponUsed: async (id) => {
      set((state) => ({
        loveCoupons: state.loveCoupons.map((cp) => {
          if (cp.id !== id) return cp;
          return {
            ...cp,
            status: 'AVAILABLE',
            used: false,
            requestedByUserId: null,
            requestedAt: null,
            approvedByUserId: null,
            approvedAt: null,
          };
        }),
      }));
      await persistSharedRoomState(true);
    },

    deleteLoveCoupon: async (id) => {
      set((state) => ({
        loveCoupons: state.loveCoupons.filter((cp) => cp.id !== id),
      }));
      await persistSharedRoomState(true);
    },

    incrementHeartTap: async (count = 1) => {
      set((state) => ({ heartTapTotal: state.heartTapTotal + count }));
      await persistSharedRoomState(true);
    },

    setPinCode: async (pin) => {
      set({ appPinCode: pin, isAppLocked: false });
      await persistPrivateUserState();
    },

    unlockAppWithPin: (inputPin) => {
      const currentPin = get().appPinCode;
      if (!currentPin || inputPin === currentPin) {
        set({ isAppLocked: false });
        return true;
      }
      return false;
    },

    lockAppNow: () => {
      if (get().appPinCode) {
        set({ isAppLocked: true });
      }
    },

    recordInteractionStreak: async () => {
      const todayIso = new Date().toISOString().split('T')[0];
      const lastIso = get().lastMissYouSentAt?.split('T')[0];
      if (lastIso !== todayIso) {
        set((state) => ({
          streakDays: state.streakDays + 1,
          lastMissYouSentAt: new Date().toISOString(),
        }));
      } else {
        set({ lastMissYouSentAt: new Date().toISOString() });
      }
      await persistSharedRoomState(true);
    },

    updateMomoFund: async (patch) => {
      set((state) => ({
        momoFund: { ...state.momoFund, ...patch },
      }));
      await persistSharedRoomState(true);
    },

    recordMomoContribution: async (contributorName, amount, goalTitle) => {
      const newLog: MomoContributionLog = {
        id: `momo_${Date.now()}`,
        contributorId: get().activeUserId || undefined,
        contributorName,
        amount,
        goalTitle,
        createdAt: new Date().toISOString().split('T')[0],
      };
      set((state) => ({
        momoFund: {
          ...state.momoFund,
          contributions: [newLog, ...(state.momoFund.contributions || []).slice(0, 19)],
        },
      }));
      await persistSharedRoomState(true);
    },
  };
});