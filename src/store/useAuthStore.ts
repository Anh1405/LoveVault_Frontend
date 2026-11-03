// src/store/useAuthStore.ts
import { create } from 'zustand';
import { storage, setAccessToken } from '../services/storage';
import { api, registerUnauthorizedHandler } from '../services/api';
import { useSettingsStore } from './useSettingsStore';

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  coupleId?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  partnerAvatarUrl?: string | null;
  timezone?: string;
  couple_id?: string | null;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  coupleId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (
    token: string,
    rawUser: any,
    extraCoupleId?: string | null,
    explicitRefreshToken?: string | null,
  ) => Promise<void>;
  setCoupleId: (coupleId: string) => Promise<void>;
  syncCoupleStatusFromServer: () => Promise<string | null>;
  logout: () => Promise<void>;
  initAuth: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

const extractCoupleId = (data: any, fallbackId?: string | null): string | null => {
  if (!data && !fallbackId) return null;

  const directId =
    data?.coupleId ||
    data?.couple_id ||
    data?.couple?.id ||
    data?.user?.coupleId ||
    data?.user?.couple_id ||
    data?.user?.couple?.id;

  return directId || fallbackId || null;
};

const resolveAndSyncProfilesFromServerData = async (
  currentUser: User | null,
  serverData: any,
  detectedCoupleId?: string | null,
) => {
  if (!currentUser?.id) return;

  let partnerId: string | null = currentUser.partnerId || null;
  let partnerName: string | null = currentUser.partnerName || null;
  let partnerAvatarUrl: string | null = currentUser.partnerAvatarUrl || null;
  let myResolvedName: string = currentUser.fullName || 'Bạn';
  let myResolvedAvatar: string | null = currentUser.avatarUrl || null;

  const coupleObj = serverData?.couple || serverData;

  const members: any[] =
    coupleObj?.members ||
    coupleObj?.users ||
    coupleObj?.participants ||
    (Array.isArray(coupleObj?.coupleMembers) ? coupleObj.coupleMembers : []);

  if (Array.isArray(members) && members.length > 0) {
    const meInRoom = members.find(
      (m) => String(m?.id || m?.userId || m?.user?.id) === String(currentUser.id),
    );
    const partnerInRoom = members.find(
      (m) => String(m?.id || m?.userId || m?.user?.id) !== String(currentUser.id),
    );

    if (meInRoom) {
      const u = meInRoom.user || meInRoom;
      myResolvedName = u.fullName || u.full_name || u.nickname || u.name || myResolvedName;
      myResolvedAvatar = u.avatarUrl || u.avatar_url || myResolvedAvatar;
    }

    if (partnerInRoom) {
      const p = partnerInRoom.user || partnerInRoom;
      partnerId = String(p.id || partnerInRoom.userId || '');
      partnerName = p.fullName || p.full_name || p.nickname || p.name || partnerName;
      partnerAvatarUrl = p.avatarUrl || p.avatar_url || partnerAvatarUrl;
    }
  } else {
    const u1 = coupleObj?.user1 || coupleObj?.userA || coupleObj?.creator || coupleObj?.initiator;
    const u2 = coupleObj?.user2 || coupleObj?.userB || coupleObj?.partner || coupleObj?.receiver;

    if (u1 || u2) {
      const u1Id = String(u1?.id || coupleObj?.user1Id || coupleObj?.userAId || '');
      const u2Id = String(u2?.id || coupleObj?.user2Id || coupleObj?.userBId || '');

      if (u1Id && u1Id === String(currentUser.id)) {
        myResolvedName = u1?.fullName || u1?.full_name || u1?.nickname || myResolvedName;
        myResolvedAvatar = u1?.avatarUrl || u1?.avatar_url || myResolvedAvatar;
        if (u2) {
          partnerId = u2Id || null;
          partnerName = u2?.fullName || u2?.full_name || u2?.nickname || partnerName;
          partnerAvatarUrl = u2?.avatarUrl || u2?.avatar_url || partnerAvatarUrl;
        }
      } else if (u2Id && u2Id === String(currentUser.id)) {
        myResolvedName = u2?.fullName || u2?.full_name || u2?.nickname || myResolvedName;
        myResolvedAvatar = u2?.avatarUrl || u2?.avatar_url || myResolvedAvatar;
        if (u1) {
          partnerId = u1Id || null;
          partnerName = u1?.fullName || u1?.full_name || u1?.nickname || partnerName;
          partnerAvatarUrl = u1?.avatarUrl || u1?.avatar_url || partnerAvatarUrl;
        }
      } else if (coupleObj?.partner && String(coupleObj.partner.id) !== String(currentUser.id)) {
        const p = coupleObj.partner;
        partnerId = String(p.id || '');
        partnerName = p.fullName || p.full_name || p.nickname || partnerName;
        partnerAvatarUrl = p.avatarUrl || p.avatar_url || partnerAvatarUrl;
      }
    }

    if (!partnerName && (coupleObj?.partnerName || coupleObj?.partnerNickname)) {
      partnerName = coupleObj.partnerName || coupleObj.partnerNickname;
    }
    if (!partnerId && (coupleObj?.partnerId || coupleObj?.partner_id)) {
      partnerId = String(coupleObj.partnerId || coupleObj.partner_id);
    }
  }

  await useSettingsStore.getState().syncIdentityFromAuth({
    userId: currentUser.id,
    coupleId: detectedCoupleId || currentUser.coupleId,
    myFullName: myResolvedName,
    myAvatarUrl: myResolvedAvatar,
    partnerId,
    partnerName,
    partnerAvatarUrl,
    sharedRoomPayload: coupleObj?.sharedSettings || coupleObj?.settings || undefined,
  });

  return { partnerId, partnerName, partnerAvatarUrl };
};

export const useAuthStore = create<AuthState>((set, get) => {
  const syncCoupleStatusFromServer = async (): Promise<string | null> => {
    try {
      const res = await api.get('/api/v1/couples/day-counter');
      // Chỉ chấp nhận coupleId thật từ server, không dùng giá trị giả như 'paired_active'
      const rawDetectedId: string | null =
        res.data?.coupleId || res.data?.couple?.id || null;
      const detectedCoupleId: string | null =
        rawDetectedId && rawDetectedId !== 'paired_active' ? String(rawDetectedId) : null;

      const currentUser = get().user;
      if (currentUser) {
        const partnerInfo = await resolveAndSyncProfilesFromServerData(
          currentUser,
          res.data,
          detectedCoupleId,
        );
        if (partnerInfo?.partnerId || partnerInfo?.partnerName || detectedCoupleId) {
          const updatedUser: User = {
            ...currentUser,
            coupleId: detectedCoupleId || currentUser.coupleId,
            partnerId: partnerInfo?.partnerId || currentUser.partnerId,
            partnerName: partnerInfo?.partnerName || currentUser.partnerName,
            partnerAvatarUrl: partnerInfo?.partnerAvatarUrl || currentUser.partnerAvatarUrl,
          };
          set({ user: updatedUser });
          await storage.setItem('user_info', JSON.stringify(updatedUser));
        }
      }

      if (detectedCoupleId) {
        await get().setCoupleId(detectedCoupleId);
        return detectedCoupleId;
      }
    } catch {
      // Ngoại tuyến: Giữ nguyên dữ liệu local
    }
    return null;
  };

  /**
   * Khôi phục phiên làm việc khi bật App.
   * Nếu có Token hợp lệ -> tự động chuyển thẳng HomeScreen.
   */
  const bootstrapAuth = async () => {
    try {
      await storage.init();
      const [savedToken, savedRefreshToken, savedUser, savedCoupleId] = await Promise.all([
        storage.getItem('access_token'),
        storage.getItem('refresh_token'),
        storage.getItem('user_info'),
        storage.getItem('couple_id'),
      ]);

      if (!savedToken) {
        set({
          token: null,
          refreshToken: null,
          user: null,
          coupleId: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      await setAccessToken(savedToken);

      const parsedUser: User | null = savedUser ? JSON.parse(savedUser) : null;
      // Bỏ giá trị rác 'paired_active' đã lưu từ phiên bản cũ; sẽ lấy lại id thật từ server
      const extractedCoupleId = extractCoupleId(parsedUser, savedCoupleId);
      const finalCoupleId = extractedCoupleId === 'paired_active' ? null : extractedCoupleId;

      if (parsedUser) {
        parsedUser.coupleId = finalCoupleId;
      }

      if (parsedUser?.id) {
        await useSettingsStore.getState().hydrateSettings(parsedUser.id, finalCoupleId);
        await useSettingsStore.getState().syncIdentityFromAuth({
          userId: parsedUser.id,
          coupleId: finalCoupleId,
          myFullName: parsedUser.fullName,
          myAvatarUrl: parsedUser.avatarUrl,
          partnerId: parsedUser.partnerId,
          partnerName: parsedUser.partnerName,
          partnerAvatarUrl: parsedUser.partnerAvatarUrl,
        });
      }

      set({
        token: savedToken,
        refreshToken: savedRefreshToken || null,
        user: parsedUser,
        coupleId: finalCoupleId,
        isAuthenticated: true,
        isLoading: false,
      });

      void syncCoupleStatusFromServer();
    } catch {
      set({
        token: null,
        refreshToken: null,
        user: null,
        coupleId: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  };

  /**
   * Đăng xuất: Chỉ xóa các Token phiên làm việc.
   * Giữ nguyên thông tin Nhớ mật khẩu (remembered_email, remembered_password) trên đĩa.
   */
  const logoutAction = async () => {
    try {
      await Promise.all([
        storage.removeItem('access_token'),
        storage.removeItem('refresh_token'),
        storage.removeItem('user_info'),
        storage.removeItem('couple_id'),
      ]);
    } catch (e) {
      console.warn('Lỗi dọn phiên khi logout:', e);
    }

    useSettingsStore.getState().resetMemoryOnLogout();

    set({
      token: null,
      refreshToken: null,
      user: null,
      coupleId: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  registerUnauthorizedHandler(logoutAction);

  return {
    token: null,
    refreshToken: null,
    user: null,
    coupleId: null,
    isAuthenticated: false,
    isLoading: true,

    setAuth: async (
      token: string,
      rawUser: any,
      extraCoupleId?: string | null,
      explicitRefreshToken?: string | null,
    ) => {
      await setAccessToken(token);

      const resolvedRefreshToken =
        explicitRefreshToken ||
        rawUser?.refreshToken ||
        rawUser?.refresh_token ||
        get().refreshToken ||
        null;

      const targetUserObj = rawUser?.user || rawUser || {};
      const resolvedCoupleId = extractCoupleId(rawUser, extraCoupleId);

      const normalizedUser: User = {
        id: String(targetUserObj?.id || targetUserObj?.userId || targetUserObj?._id || ''),
        email: (targetUserObj?.email || '').trim().toLowerCase(),
        fullName:
          targetUserObj?.fullName ||
          targetUserObj?.full_name ||
          targetUserObj?.nickname ||
          targetUserObj?.name ||
          (targetUserObj?.email ? targetUserObj.email.split('@')[0] : 'Bạn'),
        avatarUrl: targetUserObj?.avatarUrl || targetUserObj?.avatar_url || null,
        coupleId: resolvedCoupleId,
        partnerId: targetUserObj?.partnerId || targetUserObj?.partner_id || null,
        partnerName:
          targetUserObj?.partnerName ||
          targetUserObj?.partner_name ||
          targetUserObj?.partner?.fullName ||
          targetUserObj?.partner?.full_name ||
          null,
        partnerAvatarUrl:
          targetUserObj?.partnerAvatarUrl ||
          targetUserObj?.partner?.avatarUrl ||
          targetUserObj?.partner?.avatar_url ||
          null,
        timezone: targetUserObj?.timezone || 'Asia/Ho_Chi_Minh',
      };

      try {
        await storage.setItem('access_token', token);
        if (resolvedRefreshToken) {
          await storage.setItem('refresh_token', resolvedRefreshToken);
        }
        await storage.setItem('user_info', JSON.stringify(normalizedUser));
        if (resolvedCoupleId) {
          await storage.setItem('couple_id', resolvedCoupleId);
        } else {
          await storage.removeItem('couple_id');
        }
      } catch (e) {
        console.warn('Lỗi lưu auth storage:', e);
      }

      await useSettingsStore.getState().hydrateSettings(normalizedUser.id, resolvedCoupleId);
      await resolveAndSyncProfilesFromServerData(normalizedUser, rawUser, resolvedCoupleId);

      set({
        token,
        refreshToken: resolvedRefreshToken,
        user: normalizedUser,
        coupleId: resolvedCoupleId,
        isAuthenticated: true,
        isLoading: false,
      });

      await syncCoupleStatusFromServer();
    },

    setCoupleId: async (coupleId: string) => {
      try {
        await storage.setItem('couple_id', coupleId);
      } catch (e) {
        console.warn('Lỗi lưu coupleId storage:', e);
      }

      const currentUserId = get().user?.id || null;
      await useSettingsStore.getState().hydrateSettings(currentUserId, coupleId);

      set((state) => {
        const updatedUser: User = state.user
          ? { ...state.user, coupleId }
          : { id: '', email: '', fullName: 'Bạn', coupleId };

        storage.setItem('user_info', JSON.stringify(updatedUser)).catch(() => null);

        return {
          coupleId,
          user: updatedUser,
          isAuthenticated: true,
        };
      });
    },

    syncCoupleStatusFromServer,
    logout: logoutAction,
    initAuth: bootstrapAuth,
    restoreSession: bootstrapAuth,
  };
});