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

// Khóa lưu trữ tách riêng theo từng coupleId VÀ từng userId để không bao giờ trộn góc nhìn myProfile/partnerProfile
const getSharedRoomStorageKey = (coupleId?: string | null, userId?: string | null) =>
  `lovevault_room_shared_v7_${coupleId || 'no_couple'}_${userId || 'guest'}`;

const getUserPrivateStorageKey = (userId?: string | null) =>
  `lovevault_user_private_v7_${userId || 'guest'}`;

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

// Làm sạch dữ liệu kéo từ server:
// 1. Giữ lại link http(s) và data:image/... (Base64)
// 2. XÓA BỎ myProfile và partnerProfile顶cấp từ server (vì góc nhìn trên server có thể là của máy đối phương!)
//    Chỉ sử dụng bảng ánh xạ `membersById` / `profiles` theo đúng userId thực tế của từng người.
function sanitizeRemoteRoomPayload(remote: any) {
  if (!remote || typeof remote !== 'object') return {};
  const next = { ...remote };

  // Tuyệt đối không dùng myProfile / partnerProfile tương đối từ payload chung của phòng
  delete next.myProfile;
  delete next.partnerProfile;

  if (!isSyncableMediaUri(next.heroWallpaperUri)) {
    delete next.heroWallpaperUri;
  }

  const rawMap = next.membersById || next.profiles;
  if (rawMap && typeof rawMap === 'object') {
    const cleanMembers: Record<string, any> = {};
    for (const [uid, prof] of Object.entries(rawMap)) {
      if (prof && typeof prof === 'object') {
        const { avatarUri, ...rest } = prof as any;
        cleanMembers[uid] = isSyncableMediaUri(avatarUri)
          ? { ...rest, avatarUri, userId: uid }
          : { ...rest, userId: uid };
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

// Hàm gộp 2 hồ sơ của CÙNG MỘT NGƯỜI an toàn: ưu tiên incoming (mới nhất từ Server/Update), chỉ fallback khi incoming bị null/rỗng
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

// Chỉ ghép fallback nếu fallback đó thực sự thuộc về cùng một userId (hoặc chưa gắn userId)
// Ngăn chặn triệt để lỗi lấy nhầm hồ sơ của Quốc Anh đắp sang cho Trúc Duyên khi đổi tài khoản!
// 1. Sửa lại hàm safeFallbackForUser (khoảng dòng 289)
function safeFallbackForUser(
  candidate: Partial<PersonProfile> | null | undefined,
  expectedUserId: string | null | undefined,
  currentViewerUserId?: string | null,
): Partial<PersonProfile> | undefined {
  if (!candidate) return undefined;

  // Nếu đang tìm fallback cho Partner (expectedUserId khác currentViewerUserId)
  // thì TUYỆT ĐỐI không được nhận candidate có userId của currentViewerUserId!
  if (
    currentViewerUserId &&
    expectedUserId &&
    String(expectedUserId) !== String(currentViewerUserId) &&
    candidate.userId &&
    String(candidate.userId) === String(currentViewerUserId)
  ) {
    return undefined;
  }

  if (
    candidate.userId &&
    expectedUserId &&
    !candidate.userId.startsWith('partner_in_') &&
    !candidate.userId.startsWith('local_') &&
    !expectedUserId.startsWith('partner_in_') &&
    !expectedUserId.startsWith('local_') &&
    String(candidate.userId) !== String(expectedUserId)
  ) {
    return undefined;
  }
  return candidate;
}

// 2. Sửa lại hàm resolveProfilesForViewer (khoảng dòng 308)
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
  const validFallbackMy = safeFallbackForUser(fallbackMy, currentUserId, currentUserId);

  const resolvedMy: PersonProfile = {
    ...mergeProfilePreservingData(DEFAULT_MY_PROFILE, myEntry, validFallbackMy),
    userId: currentUserId,
  };

  // Chỉ lấy các entry KHÁC currentUserId và có internal userId cũng KHÁC currentUserId
  const partnerEntries = allEntries.filter(
    ([uid, prof]) =>
      String(uid) !== String(currentUserId) &&
      (!prof?.userId || String(prof.userId) !== String(currentUserId)),
  );

  const realPartnerPair = partnerEntries.find(
    ([uid]) => !uid.startsWith('partner_in_') && !uid.startsWith('local_'),
  );
  const primaryPartnerPair = realPartnerPair || partnerEntries[0];

  const resolvedPartnerId = primaryPartnerPair
    ? primaryPartnerPair[0]
    : fallbackPartner?.userId && String(fallbackPartner.userId) !== String(currentUserId)
      ? fallbackPartner.userId
      : null;

  const validFallbackPartner = safeFallbackForUser(
    fallbackPartner,
    resolvedPartnerId,
    currentUserId,
  );

  let aggregatedPartner: Partial<PersonProfile> = { ...(validFallbackPartner || {}) };
  for (const [, prof] of partnerEntries) {
    aggregatedPartner = mergeProfilePreservingData(
      DEFAULT_PARTNER_PROFILE,
      prof,
      aggregatedPartner,
    );
  }

  const resolvedPartner: PersonProfile = {
    ...mergeProfilePreservingData(
      DEFAULT_PARTNER_PROFILE,
      primaryPartnerPair ? primaryPartnerPair[1] : undefined,
      aggregatedPartner,
    ),
    userId: resolvedPartnerId,
  };

  return { myProfile: resolvedMy, partnerProfile: resolvedPartner };
}

function normalizeCouponsForRoom(
  rawCoupons: any[],
  myUserId: string | null,
  partnerUserId: string | null,
): LoveCouponItem[] {
  const list = Array.isArray(rawCoupons) && rawCoupons.length > 0 ? rawCoupons : DEFAULT_COUPONS;
  const sortedUserIds = [myUserId, partnerUserId]
    .filter((id): id is string => Boolean(id && !id.startsWith('partner_in_') && !id.startsWith('local_')))
    .map(String)
    .sort();
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

    if (!ownerUserId || ownerUserId.startsWith('partner_in_') || ownerUserId.startsWith('local_')) {
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

    // Đảm bảo membersById luôn chứa hồ sơ mới nhất của cả 2 người theo đúng userId trước khi lưu
    const cleanMembersById: Record<string, PersonProfile> = { ...s.membersById };
    if (s.activeUserId) {
      cleanMembersById[s.activeUserId] = {
        ...s.myProfile,
        userId: s.activeUserId,
      };
    }
    const partnerUid =
      s.partnerProfile.userId && String(s.partnerProfile.userId) !== String(s.activeUserId)
        ? s.partnerProfile.userId
        : Object.keys(cleanMembersById).find((k) => String(k) !== String(s.activeUserId));
    if (partnerUid) {
      cleanMembersById[partnerUid] = {
        ...s.partnerProfile,
        userId: partnerUid,
      };
    }

    // Dữ liệu lưu ở máy cục bộ (đã tách theo roomKey riêng của từng userId)
    const localPayload = {
      coupleId: s.activeCoupleId,
      viewerUserId: s.activeUserId,
      membersById: cleanMembersById,
      profiles: cleanMembersById,
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
    await storage.setItem(roomKey, JSON.stringify(localPayload));

    // Khi đẩy lên Server: CHỈ đẩy `membersById` / `profiles` (theo ID từng người),
    // KHÔNG đẩy `myProfile` và `partnerProfile` để tránh máy người kia kéo về bị ngược vai!
    if (syncServer && s.activeCoupleId) {
      const { myProfile: _omitMy, partnerProfile: _omitPartner, ...serverSafePayload } = localPayload;
      api
        .patch('/api/v1/couples/shared-settings', {
          coupleId: s.activeCoupleId,
          ...serverSafePayload,
          sharedSettings: {
            ...serverSafePayload,
            membersById: cleanMembersById,
            profiles: cleanMembersById,
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

        const [rawRoom, rawLegacyV6Room, rawPrivate] = await Promise.all([
          storage.getItem(roomKey),
          storage.getItem(legacyV6RoomKey),
          storage.getItem(userKey),
        ]);

        const parsedRoom = rawRoom
          ? JSON.parse(rawRoom)
          : rawLegacyV6Room
            ? JSON.parse(rawLegacyV6Room)
            : {};

        const parsedPrivate = rawPrivate ? JSON.parse(rawPrivate) : {};

        const nextMembersById: Record<string, PersonProfile> = {};
        const rawMembers = parsedRoom.membersById || parsedRoom.profiles || {};
        for (const [uid, prof] of Object.entries(rawMembers)) {
          if (prof && typeof prof === 'object') {
            nextMembersById[uid] = {
              ...(prof as PersonProfile),
              userId: uid,
              avatarUri: cleanAvatarUri((prof as PersonProfile).avatarUri),
            };
          }
        }

        // Chỉ khôi phục myProfile / partnerProfile từ cache nếu nó khớp đúng với viewerUserId hiện tại
        const isSameViewer =
          !parsedRoom.viewerUserId ||
          String(parsedRoom.viewerUserId) === String(targetUserId);

        const cachedMy =
          isSameViewer &&
          parsedRoom.myProfile &&
          (!parsedRoom.myProfile.userId ||
            String(parsedRoom.myProfile.userId) === String(targetUserId))
            ? parsedRoom.myProfile
            : undefined;

        const cachedPartner =
          isSameViewer &&
          parsedRoom.partnerProfile &&
          (!parsedRoom.partnerProfile.userId ||
            String(parsedRoom.partnerProfile.userId) !== String(targetUserId))
            ? parsedRoom.partnerProfile
            : undefined;

        if (targetUserId && cachedMy) {
          nextMembersById[targetUserId] = {
            ...mergeProfilePreservingData(
              DEFAULT_MY_PROFILE,
              nextMembersById[targetUserId],
              cachedMy,
            ),
            userId: targetUserId,
          };
        }

        if (cachedPartner) {
          const existingPartnerKey =
            cachedPartner.userId ||
            Object.keys(nextMembersById).find((k) => String(k) !== String(targetUserId)) ||
            `partner_in_${targetCoupleId || 'room'}`;

          if (String(existingPartnerKey) !== String(targetUserId)) {
            nextMembersById[existingPartnerKey] = {
              ...mergeProfilePreservingData(
                DEFAULT_PARTNER_PROFILE,
                nextMembersById[existingPartnerKey],
                cachedPartner,
              ),
              userId: existingPartnerKey,
            };
          }
        }

        const { myProfile, partnerProfile } = resolveProfilesForViewer(
          nextMembersById,
          targetUserId || null,
          cachedMy,
          cachedPartner,
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

      const isSwitchingUser =
        Boolean(currentState.activeUserId) && String(currentState.activeUserId) !== String(userId);

      if (
        currentState.activeUserId !== userId ||
        currentState.activeCoupleId !== targetCoupleId
      ) {
        await get().hydrateSettings(userId, targetCoupleId);
      }

      set((state) => {
        // Nếu vừa đổi tài khoản trên cùng 1 máy, chỉ giữ các member có ID thật, loại bỏ key tạm cũ
        const mergedMembers: Record<string, PersonProfile> = {};
        for (const [k, v] of Object.entries(state.membersById)) {
          if (!isSwitchingUser || (!k.startsWith('partner_in_') && !k.startsWith('local_'))) {
            mergedMembers[k] = v;
          }
        }

        const remoteMembers =
          sharedRoomPayload?.membersById || sharedRoomPayload?.profiles || {};

        // 1. Gộp dữ liệu từ Server vào Local theo đúng từng `uid` độc lập
        for (const [uid, remoteProf] of Object.entries(remoteMembers)) {
          if (remoteProf && typeof remoteProf === 'object') {
            const prevProf = mergedMembers[uid];
            const isMe = String(uid) === String(userId);
            const candidateFallback = isMe ? state.myProfile : state.partnerProfile;
            const validFallback = safeFallbackForUser(candidateFallback, uid);

            mergedMembers[uid] = {
              ...mergeProfilePreservingData(
                isMe ? DEFAULT_MY_PROFILE : DEFAULT_PARTNER_PROFILE,
                remoteProf as Partial<PersonProfile>,
                mergeProfilePreservingData(
                  isMe ? DEFAULT_MY_PROFILE : DEFAULT_PARTNER_PROFILE,
                  prevProf,
                  validFallback,
                ),
              ),
              userId: uid,
            };
          }
        }

        // 2. Định vị chính xác ID của Partner (không bao giờ trùng với userId của mình)
        const realPartnerKey = Object.keys(mergedMembers).find(
          (k) =>
            String(k) !== String(userId) &&
            !k.startsWith('partner_in_') &&
            !k.startsWith('local_'),
        );
        const finalPartnerKey =
          (partnerId && String(partnerId) !== String(userId) ? partnerId : null) ||
          realPartnerKey ||
          `partner_in_${targetCoupleId || 'room'}`;

        // 3. Gom dữ liệu Partner từ các key tạm (chỉ lấy các entry khác userId của mình)
        let stashedPartnerData: Partial<PersonProfile> = {
          ...(safeFallbackForUser(state.partnerProfile, finalPartnerKey) || {}),
        };
        Object.entries(mergedMembers).forEach(([k, prof]) => {
          if (String(k) !== String(userId)) {
            stashedPartnerData = mergeProfilePreservingData(
              DEFAULT_PARTNER_PROFILE,
              prof,
              stashedPartnerData,
            );
          }
        });

        // 4. Dọn dẹp các key tạm không khớp với finalPartnerKey
        Object.keys(mergedMembers).forEach((k) => {
          if (
            String(k) !== String(userId) &&
            String(k) !== String(finalPartnerKey) &&
            (k.startsWith('partner_in_') || k.startsWith('local_') || Boolean(partnerId))
          ) {
            delete mergedMembers[k];
          }
        });

        // 5. Chuẩn hóa hồ sơ bản thân (chỉ dùng fallback nếu đúng là của userId này)
        const validMyStateFallback = safeFallbackForUser(state.myProfile, userId);
        const existingMe = mergeProfilePreservingData(
          DEFAULT_MY_PROFILE,
          mergedMembers[userId],
          validMyStateFallback,
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
            cleanAvatarUri(validMyStateFallback?.avatarUri) ||
            cleanAvatarUri(myAvatarUrl) ||
            null,
          birthDate: existingMe.birthDate || validMyStateFallback?.birthDate || null,
        };

        // 6. Chuẩn hóa hồ sơ Partner
        const existingPartner = mergeProfilePreservingData(
          DEFAULT_PARTNER_PROFILE,
          mergedMembers[finalPartnerKey],
          stashedPartnerData,
        );
        const isGenericPartnerName =
          !existingPartner.nickname ||
          existingPartner.nickname === 'Bạn Đời' ||
          existingPartner.nickname === 'Người ấy';

        const myFinalProfile = mergedMembers[userId];

        // Kiểm tra xem từng trường của Partner có bị dính dữ liệu clone từ User 1 hay không
        const isClonedName =
          Boolean(partnerName) &&
          existingPartner.nickname === myFinalProfile.nickname &&
          partnerName.trim() !== myFinalProfile.nickname;

        const isClonedAvatar =
          Boolean(existingPartner.avatarUri) &&
          existingPartner.avatarUri === myFinalProfile.avatarUri &&
          existingPartner.avatarUri !== cleanAvatarUri(partnerAvatarUrl);

        mergedMembers[finalPartnerKey] = {
          ...existingPartner,
          userId: finalPartnerKey,
          nickname:
            (isGenericPartnerName || isClonedName) && partnerName
              ? partnerName.trim()
              : existingPartner.nickname || 'Người ấy',
          avatarUri: isClonedAvatar
            ? cleanAvatarUri(partnerAvatarUrl) || null
            : cleanAvatarUri(existingPartner.avatarUri) ||
              cleanAvatarUri(stashedPartnerData.avatarUri) ||
              cleanAvatarUri(partnerAvatarUrl) ||
              null,
          birthDate:
            existingPartner.birthDate ||
            stashedPartnerData.birthDate ||
            null,
        };

        // Phát hiện nếu do lỗi phiên bản cũ mà hồ sơ Partner bị sao chép y hệt ngày sinh & tên của chính mình
        const isCorruptedCloneOfMe =
          Boolean(partnerName) &&
          existingPartner.nickname === mergedMembers[userId].nickname &&
          partnerName.trim() !== mergedMembers[userId].nickname;

        mergedMembers[finalPartnerKey] = {
          ...existingPartner,
          userId: finalPartnerKey,
          nickname:
            (isGenericPartnerName || isCorruptedCloneOfMe) && partnerName
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
      if (!activeCoupleId || !activeUserId || pendingLocalWrites > 0) return;
      try {
        const res = await api.get('/api/v1/couples/shared-settings', {
          params: { coupleId: activeCoupleId },
        });
        const remote = res.data?.sharedSettings || res.data?.settings || res.data;
        if (remote && typeof remote === 'object') {
          await get().syncIdentityFromAuth({
            userId: activeUserId,
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
            String(state.partnerProfile.userId) !== String(myUid) &&
            !state.partnerProfile.userId.startsWith('partner_in_')
              ? state.partnerProfile.userId
              : null) ||
            partnerKeyFromMembers ||
            (state.partnerProfile.userId && String(state.partnerProfile.userId) !== String(myUid)
              ? state.partnerProfile.userId
              : null) ||
            Object.keys(state.membersById).find((k) => String(k) !== String(myUid)) ||
            `partner_in_${state.activeCoupleId || 'room'}`;

          resolvedPartnerUid = existingPartnerUid;

          const baseMy = state.membersById[myUid] || state.myProfile;
          const basePartner = state.membersById[existingPartnerUid] || state.partnerProfile;

          const updatedMy: PersonProfile = myPatch
            ? {
                ...baseMy,
                ...state.myProfile,
                ...myPatch,
                avatarUri:
                  myPatch.avatarUri !== undefined
                    ? cleanAvatarUri(myPatch.avatarUri)
                    : cleanAvatarUri(state.myProfile.avatarUri),
                userId: myUid,
              }
            : {
                ...baseMy,
                ...state.myProfile,
                avatarUri: cleanAvatarUri(state.myProfile.avatarUri),
                userId: myUid,
              };

          const updatedPartner: PersonProfile = partnerPatch
            ? {
                ...basePartner,
                ...state.partnerProfile,
                ...partnerPatch,
                avatarUri:
                  partnerPatch.avatarUri !== undefined
                    ? cleanAvatarUri(partnerPatch.avatarUri)
                    : cleanAvatarUri(state.partnerProfile.avatarUri),
                userId: existingPartnerUid,
              }
            : {
                ...basePartner,
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
                const nextMy: PersonProfile = { ...state.myProfile, avatarUri: cloudUrl, userId: myUid };
                return {
                  myProfile: nextMy,
                  membersById: {
                    ...state.membersById,
                    [myUid]: { ...(state.membersById[myUid] || nextMy), avatarUri: cloudUrl, userId: myUid },
                  },
                };
              });
            }
          } catch {
            // Nếu upload cloud lỗi, giữ nguyên chuỗi Base64/local URI đã lưu
          }
        }

        // Upload ảnh đại diện của NGƯỜI THƯƠNG lên Cloud
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
                  userId: pUid,
                };
                return {
                  partnerProfile: nextPartner,
                  membersById: {
                    ...state.membersById,
                    [pUid]: {
                      ...(state.membersById[pUid] || nextPartner),
                      avatarUri: cloudPartnerUrl,
                      userId: pUid,
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