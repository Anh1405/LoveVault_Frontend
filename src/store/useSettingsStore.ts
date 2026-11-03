// src/store/useSettingsStore.ts
import { create } from 'zustand';
import { AccessibilityInfo } from 'react-native';
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

const isRemoteUrl = (uri?: string | null): uri is string =>
  typeof uri === 'string' && /^https?:\/\//i.test(uri);

// Dữ liệu kéo từ server có thể chứa đường dẫn file nội bộ của máy đối phương.
// Máy này không đọc được các đường dẫn đó nên chỉ giữ lại link http(s).
function sanitizeRemoteRoomPayload(remote: any) {
  const next = { ...remote };

  if (!isRemoteUrl(next.heroWallpaperUri)) {
    delete next.heroWallpaperUri;
  }

  if (next.membersById && typeof next.membersById === 'object') {
    const cleanMembers: Record<string, any> = {};
    for (const [uid, prof] of Object.entries(next.membersById)) {
      if (prof && typeof prof === 'object') {
        const { avatarUri, ...rest } = prof as any;
        cleanMembers[uid] = isRemoteUrl(avatarUri) ? { ...rest, avatarUri } : rest;
      } else {
        cleanMembers[uid] = prof;
      }
    }
    next.membersById = cleanMembers;
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

function resolveProfilesForViewer(
  membersById: Record<string, PersonProfile>,
  currentUserId: string | null,
  fallbackMy?: PersonProfile,
  fallbackPartner?: PersonProfile,
): { myProfile: PersonProfile; partnerProfile: PersonProfile } {
  const allEntries = Object.entries(membersById || {});

  if (!currentUserId) {
    return {
      myProfile: fallbackMy || { ...DEFAULT_MY_PROFILE },
      partnerProfile: fallbackPartner || { ...DEFAULT_PARTNER_PROFILE },
    };
  }

  const myEntry = membersById[currentUserId];
  // Ưu tiên chọn Key thực (không phải key tạm partner_in_...)
  const partnerPair =
    allEntries.find(
      ([uid]) => String(uid) !== String(currentUserId) && !uid.startsWith('partner_in_') && !uid.startsWith('local_'),
    ) || allEntries.find(([uid]) => String(uid) !== String(currentUserId));

  const partnerEntry = partnerPair ? partnerPair[1] : undefined;

  const resolvedMy: PersonProfile = myEntry
    ? { ...DEFAULT_MY_PROFILE, ...myEntry, userId: currentUserId }
    : { ...(fallbackMy || DEFAULT_MY_PROFILE), userId: currentUserId };

  const resolvedPartner: PersonProfile = partnerEntry
    ? {
        ...DEFAULT_PARTNER_PROFILE,
        ...partnerEntry,
        userId: partnerPair ? partnerPair[0] : partnerEntry.userId || null,
      }
    : { ...(fallbackPartner || DEFAULT_PARTNER_PROFILE) };

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
        .patch('/api/v1/couples/shared-settings', sharedPayload)
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

        const nextMembersById: Record<string, PersonProfile> = {
          ...(parsedRoom.membersById || {}),
        };

        if (targetUserId && !nextMembersById[targetUserId] && parsedRoom.myProfile) {
          nextMembersById[targetUserId] = {
            ...DEFAULT_MY_PROFILE,
            ...parsedRoom.myProfile,
            userId: targetUserId,
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
        const remoteMembers = sharedRoomPayload?.membersById || {};

        // 1. Cập nhật dữ liệu mới từ Server đè/gộp vào Local (bao gồm birthDate, nickname, avatar, status)
        for (const [uid, remoteProf] of Object.entries(remoteMembers)) {
          if (remoteProf && typeof remoteProf === 'object') {
            mergedMembers[uid] = {
              ...DEFAULT_MY_PROFILE,
              ...(mergedMembers[uid] || {}),
              ...(remoteProf as Partial<PersonProfile>),
              userId: uid,
            };
          }
        }

        // 2. Dọn dẹp key tạm ("partner_in_...") khi đã có thông tin user ID thực sự
        const realKeys = Object.keys(mergedMembers).filter(
          (k) => !k.startsWith('partner_in_') && !k.startsWith('local_'),
        );
        if (realKeys.length >= 2 || partnerId) {
          Object.keys(mergedMembers).forEach((k) => {
            if (k.startsWith('partner_in_') || k.startsWith('local_')) {
              delete mergedMembers[k];
            }
          });
        }

        // 3. Chuẩn hóa hồ sơ bản thân
        const existingMe = mergedMembers[userId] || {
          ...DEFAULT_MY_PROFILE,
          userId,
        };
        const isGenericMyName =
          !existingMe.nickname ||
          existingMe.nickname === 'Bạn' ||
          existingMe.nickname === 'User';

        mergedMembers[userId] = {
          ...existingMe,
          userId,
          nickname:
            isGenericMyName && myFullName ? myFullName.trim() : existingMe.nickname || 'Bạn',
          avatarUri: existingMe.avatarUri || myAvatarUrl || null,
        };

        // 4. Định vị chính xác ID của Partner
        const candidatePartnerKey =
          partnerId ||
          Object.keys(mergedMembers).find(
            (k) => String(k) !== String(userId) && !k.startsWith('partner_in_'),
          ) ||
          `partner_in_${targetCoupleId || 'room'}`;

        if (partnerId && candidatePartnerKey !== partnerId && mergedMembers[candidatePartnerKey]) {
          delete mergedMembers[candidatePartnerKey];
        }

        const finalPartnerKey = partnerId || candidatePartnerKey;
        const existingPartner = mergedMembers[finalPartnerKey] || {
          ...DEFAULT_PARTNER_PROFILE,
          userId: finalPartnerKey,
        };
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
          avatarUri: existingPartner.avatarUri || partnerAvatarUrl || null,
        };

        const { myProfile, partnerProfile } = resolveProfilesForViewer(
          mergedMembers,
          userId,
          state.myProfile,
          state.partnerProfile,
        );

        const nextCoupons = normalizeCouponsForRoom(
          sharedRoomPayload?.loveCoupons || state.loveCoupons,
          userId,
          finalPartnerKey,
        );

        return {
          activeUserId: userId,
          activeCoupleId: targetCoupleId,
          membersById: mergedMembers,
          heroWallpaperUri:
            sharedRoomPayload?.heroWallpaperUri !== undefined
              ? sharedRoomPayload.heroWallpaperUri
              : state.heroWallpaperUri,
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
        const res = await api.get('/api/v1/couples/shared-settings');
        const remote = res.data?.settings || res.data;
        if (remote && typeof remote === 'object') {
          await get().syncIdentityFromAuth({
            userId: activeUserId || '',
            coupleId: activeCoupleId,
            sharedRoomPayload: sanitizeRemoteRoomPayload(remote),
          });
        }
      } catch {
        await get().hydrateSettings(activeUserId, activeCoupleId);
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
        momoFund: { ...DEFAULT_MOMO_FUND, quickAmounts: [...DEFAULT_MOMO_FUND.quickAmounts], contributions: [] },
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
      if (pickedWallpaper && !isRemoteUrl(pickedWallpaper)) {
        // Lưu tạm ở máy trước để không mất nếu app bị tắt giữa lúc upload
        await persistSharedRoomState(false);
        try {
          const cloudUrl = await uploadHeroWallpaperToCloud(pickedWallpaper);
          // Chỉ thay bằng link online nếu trong lúc upload người dùng chưa đổi sang hình khác
          if (get().heroWallpaperUri === pickedWallpaper) {
            set({ heroWallpaperUri: cloudUrl });
          }
        } catch {
          // Mất mạng: giữ đường dẫn nội bộ, ảnh đã nằm trong hàng đợi upload bù
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
      set((state) => {
        const myUid = state.activeUserId || 'local_me';
        const partnerKeyFromMembers = Object.keys(state.membersById).find(
          (k) => String(k) !== String(myUid) && !k.startsWith('partner_in_'),
        );
        const existingPartnerUid =
          state.partnerProfile.userId ||
          partnerKeyFromMembers ||
          Object.keys(state.membersById).find((k) => String(k) !== String(myUid)) ||
          `partner_in_${state.activeCoupleId || 'room'}`;

        const updatedMy: PersonProfile = myPatch
          ? { ...state.myProfile, ...myPatch, userId: myUid }
          : { ...state.myProfile, userId: myUid };

        const updatedPartner: PersonProfile = partnerPatch
          ? { ...state.partnerProfile, ...partnerPatch, userId: existingPartnerUid }
          : { ...state.partnerProfile, userId: existingPartnerUid };

        const nextMembersById: Record<string, PersonProfile> = {
          ...state.membersById,
          [myUid]: updatedMy,
          [existingPartnerUid]: updatedPartner,
        };

        if (partnerKeyFromMembers) {
          Object.keys(nextMembersById).forEach((k) => {
            if (k.startsWith('partner_in_')) {
              delete nextMembersById[k];
            }
          });
        }

        return {
          membersById: nextMembersById,
          myProfile: updatedMy,
          partnerProfile: updatedPartner,
        };
      });

      const pickedAvatar = myPatch?.avatarUri;
      if (pickedAvatar && !isRemoteUrl(pickedAvatar)) {
        await persistSharedRoomState(false);
        try {
          const cloudUrl = await uploadHeroWallpaperToCloud(pickedAvatar);
          if (get().myProfile.avatarUri === pickedAvatar) {
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
          // Mất mạng: giữ avatar nội bộ, lần lưu Profile sau sẽ thử upload lại
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