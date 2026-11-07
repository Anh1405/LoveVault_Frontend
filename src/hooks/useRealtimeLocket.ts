// src/hooks/useRealtimeLocket.ts
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, Alert, Linking } from 'react-native';
import { io, Socket } from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { storage } from '../services/storage';
import {
    uploadMediaToCloudAndSaveDb,
    deleteCloudMediaById,
    fetchCloudWorkspaceMedia,
    flushPendingCloudMediaQueue,
} from '../services/cloudMediaService';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import type { LocketSnapView } from '../components/home/locketReactions';

const RAW_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL || 'https://lovevault-appmoblie.onrender.com';
const SOCKET_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

const sameSnapList = (a: LocketSnapView[], b: LocketSnapView[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (
            a[i].id !== b[i].id ||
            a[i].uri !== b[i].uri ||
            a[i].reactions.length !== b[i].reactions.length
        ) {
            return false;
        }
    }
    return true;
};

export function useRealtimeLocket() {
    const queryClient = useQueryClient();
    const { user, coupleId: storeCoupleId } = useAuthStore();
    const currentUserId = user?.id || (user as any)?.sub || 'local_me';
    const { myProfile, partnerProfile, socialPrefs } = useSettingsStore();

    const [resolvedCoupleId, setResolvedCoupleId] = useState<string | null>(
        storeCoupleId || (user as any)?.coupleId || null,
    );

    useEffect(() => {
        if (storeCoupleId) {
            setResolvedCoupleId(storeCoupleId);
        } else if ((user as any)?.coupleId) {
            setResolvedCoupleId((user as any).coupleId);
        }
    }, [storeCoupleId, user]);

    const cacheKey = useMemo(
        () => `lovevault_rt_locket_v6_${resolvedCoupleId || currentUserId}`,
        [resolvedCoupleId, currentUserId],
    );

    const [locketSnaps, setLocketSnaps] = useState<LocketSnapView[]>([]);
    const [locketLive, setLocketLive] = useState<boolean>(true);

    const snapsRef = useRef<LocketSnapView[]>(locketSnaps);
    snapsRef.current = locketSnaps;

    // Giữ danh sách các ID vừa bị xóa trong 15 giây để chặn mọi request cũ ghi đè lại
    const deletedIdsTombstoneRef = useRef<Set<string>>(new Set());
    const mutationInFlightRef = useRef<number>(0);
    const socketRef = useRef<Socket | null>(null);
    const prevTopSnapIdRef = useRef<string | null>(null);

    const mapCloudSnapToView = useCallback(
        (s: any): LocketSnapView => {
            const uploaderId = s.uploaderId || s.ownerId || s.senderId || '';
            const isMine = String(uploaderId) === String(currentUserId);
            const dt = s.createdAt ? new Date(s.createdAt) : new Date();
            const createdAtTime =
                s.createdAtTime ||
                (!Number.isNaN(dt.getTime())
                    ? dt.toLocaleString('vi-VN')
                    : new Date().toLocaleString('vi-VN'));

            return {
                id: s.id,
                uri: s.remoteUrl || s.uri,
                remoteUrl: s.remoteUrl || s.uri,
                ownerId: uploaderId,
                senderId: uploaderId,
                senderName: isMine ? myProfile.nickname : partnerProfile.nickname,
                isMine,
                stampBadge: s.stamp || s.stampBadge || '💕 Đang nhớ đằng ấy',
                caption: s.caption || '',
                createdAtTime,
                reactions: Array.isArray(s.reactions) ? s.reactions : [],
            } as unknown as LocketSnapView;
        },
        [currentUserId, myProfile.nickname, partnerProfile.nickname],
    );

    // Kéo danh sách Locket mới nhất từ PostgreSQL
    const syncLocketsFromCloud = useCallback(
        async (silent = false) => {
            if (mutationInFlightRef.current > 0) return;

            if (!silent) {
                const rawCache = await storage.getItem(cacheKey);
                if (rawCache) {
                    try {
                        const parsed = JSON.parse(rawCache);
                        if (Array.isArray(parsed)) {
                            consthydrated = parsed.map(mapCloudSnapToView);
                            setLocketSnaps(hydrated);
                            prevTopSnapIdRef.current = hydrated[0]?.id || null;
                        }
                    } catch {}
                }
            }

            try {
                let targetCoupleId = resolvedCoupleId;
                if (!targetCoupleId) {
                    const counterRes = await api.get('/api/v1/couples/day-counter');
                    if (counterRes.data?.coupleId) {
                        targetCoupleId = counterRes.data.coupleId;
                        setResolvedCoupleId(targetCoupleId);
                    }
                }

                await flushPendingCloudMediaQueue().catch(() => null);
                const workspaceData = await fetchCloudWorkspaceMedia(150);
                setLocketLive(true);

                // Cập nhật luôn React Query cache để Album bên tab Không gian cũng đồng bộ
                if (targetCoupleId) {
                    queryClient.setQueryData(
                        ['cloudWorkspaceMedia', targetCoupleId, currentUserId],
                        workspaceData,
                    );
                }

                const rawCloudSnaps = Array.isArray(workspaceData?.locketSnaps)
                    ? workspaceData.locketSnaps
                    : [];

                const cloudMapped = rawCloudSnaps
                    .filter(
                        (s) =>
                            !deletedIdsTombstoneRef.current.has(s.id) &&
                            (!s.remoteUrl || !deletedIdsTombstoneRef.current.has(s.remoteUrl)),
                    )
                    .map(mapCloudSnapToView);

                const cloudIds = new Set(cloudMapped.map((s) => s.id));
                const cloudUrls = new Set(
                    cloudMapped.map((s: any) => s.remoteUrl || s.uri),
                );

                // Chỉ giữ lại các ảnh vừa chụp trên máy đang trong quá trình đẩy lên S3 (`locket_...`)
                const pendingLocalOnly = snapsRef.current.filter(
                    (loc: any) =>
                        String(loc.id).startsWith('locket_') &&
                        !loc.remoteUrl &&
                        !cloudIds.has(loc.id) &&
                        !cloudUrls.has(loc.uri) &&
                        !deletedIdsTombstoneRef.current.has(loc.id),
                );

                // QUAN TRỌNG: Không chặn `rawCloudSnaps.length > 0` nữa, nếu xóa hết trên DB thì trả về mảng rỗng chuẩn xác
                const nextSnaps = [...pendingLocalOnly, ...cloudMapped];

                // Rung nhẹ báo hiệu nếu đối phương vừa đăng ảnh Locket mới lên đầu danh sách
                const newestSnap = nextSnaps[0];
                if (
                    newestSnap &&
                    prevTopSnapIdRef.current &&
                    newestSnap.id !== prevTopSnapIdRef.current &&
                    String((newestSnap as any).ownerId) !== String(currentUserId)
                ) {
                    void Haptics.notificationAsync(
                        Haptics.NotificationFeedbackType.Success,
                    );
                }
                prevTopSnapIdRef.current = newestSnap?.id || null;

                if (!sameSnapList(nextSnaps, snapsRef.current)) {
                    setLocketSnaps(nextSnaps);
                    await storage.setItem(cacheKey, JSON.stringify(nextSnaps));
                }
            } catch {
                setLocketLive(false);
            }
        },
        [resolvedCoupleId, currentUserId, cacheKey, queryClient, mapCloudSnapToView],
    );

    // Mở kết nối Socket.IO + Vòng lặp Fast-Sync 2 giây
    useEffect(() => {
        void syncLocketsFromCloud(false);

        let isMounted = true;

        const connectSocket = async () => {
            const token =
                typeof (storage as any).getToken === 'function'
                    ? await (storage as any).getToken()
                    : await storage.getItem('access_token');

            if (!token || !isMounted) return;

            const socket = io(`${SOCKET_BASE_URL}/qa`, {
                transports: ['polling', 'websocket'],
                auth: { token },
                query: { token },
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 2000,
            });

            socketRef.current = socket;

            socket.on('connect', () => {
                if (isMounted) setLocketLive(true);
            });

            // 1. Nhận tức thì ảnh Locket mới khi đối phương vừa chụp xong
            socket.on('locket:snap_created', (incomingSnap: any) => {
                if (!isMounted || !incomingSnap?.id) return;
                const formatted = mapCloudSnapToView(incomingSnap);
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

                setLocketSnaps((prev) => {
                    if (prev.some((s) => s.id === formatted.id)) return prev;
                    const next = [formatted, ...prev];
                    void storage.setItem(cacheKey, JSON.stringify(next));
                    return next;
                });
            });

            // 2. Xóa tức thì trên màn hình khi đối phương bấm xóa ảnh của họ
            socket.on(
                'locket:snap_deleted',
                (payload: { snapId: string; remoteUrl?: string }) => {
                    if (!isMounted || !payload?.snapId) return;
                    deletedIdsTombstoneRef.current.add(payload.snapId);
                    if (payload.remoteUrl) {
                        deletedIdsTombstoneRef.current.add(payload.remoteUrl);
                    }

                    setLocketSnaps((prev) => {
                        const next = prev.filter(
                            (s: any) =>
                                s.id !== payload.snapId &&
                                (!payload.remoteUrl || s.remoteUrl !== payload.remoteUrl),
                        );
                        void storage.setItem(cacheKey, JSON.stringify(next));
                        return next;
                    });
                },
            );

            // 3. Nhảy emoji cảm xúc tức thì khi đối phương bấm thả cảm xúc
            socket.on(
                'locket:snap_reacted',
                (payload: { snapId: string; userId: string; emoji: string; reactions?: any[] }) => {
                    if (!isMounted || !payload?.snapId) return;
                    void Haptics.selectionAsync().catch(() => null);

                    setLocketSnaps((prev) => {
                        const next = prev.map((s) => {
                            if (s.id !== payload.snapId) return s;
                            const updatedReactions = Array.isArray(payload.reactions)
                                ? payload.reactions
                                : [
                                    ...s.reactions,
                                    {
                                        id: `${payload.userId}_${Date.now()}`,
                                        userId: payload.userId,
                                        emoji: payload.emoji,
                                        createdAt: new Date().toISOString(),
                                    },
                                ];
                            return { ...s, reactions: updatedReactions };
                        });
                        void storage.setItem(cacheKey, JSON.stringify(next));
                        return next;
                    });
                },
            );
        };

        void connectSocket();

        // Fast-Sync mỗi 2 giây để đồng bộ tức thì kể cả khi chỉ chạy qua REST API trên Render
        const pollTimer = setInterval(() => {
            if (AppState.currentState === 'active') {
                void syncLocketsFromCloud(true);
            }
        }, 2000);

        const appStateSub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void syncLocketsFromCloud(true);
            }
        });

        return () => {
            isMounted = false;
            clearInterval(pollTimer);
            appStateSub.remove();
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [cacheKey, syncLocketsFromCloud, mapCloudSnapToView]);

    // Hàm đẩy ảnh Locket từ URI (Camera trực tiếp hoặc Thư viện) lên S3 + PostgreSQL + Phát WebSocket
    const uploadAndBroadcastSnap = useCallback(
        async (localUri: string, stampBadge: string, captionText: string) => {
            const finalStamp = stampBadge || '💕 Đang nhớ đằng ấy';
            const finalCaption = captionText.trim();
            const tempId = `locket_${Date.now()}`;

            const optimisticSnap: LocketSnapView = mapCloudSnapToView({
                id: tempId,
                uri: localUri,
                remoteUrl: null,
                uploaderId: currentUserId,
                stamp: finalStamp,
                caption: finalCaption,
                createdAt: new Date().toISOString(),
                reactions: [],
            });

            prevTopSnapIdRef.current = tempId;
            setLocketSnaps((prev) => {
                const next = [optimisticSnap, ...prev];
                void storage.setItem(cacheKey, JSON.stringify(next));
                return next;
            });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            mutationInFlightRef.current += 1;
            try {
                const savedCloud = await uploadMediaToCloudAndSaveDb({
                    localUri,
                    category: 'LOCKET_SNAP',
                    mediaType: 'IMAGE',
                    stamp: finalStamp,
                    caption: finalCaption,
                    idempotencyKey: tempId,
                });

                const confirmedSnap = mapCloudSnapToView({
                    ...savedCloud,
                    uploaderId: currentUserId,
                    stamp: finalStamp,
                    caption: finalCaption,
                });

                prevTopSnapIdRef.current = confirmedSnap.id;
                setLocketSnaps((prev) => {
                    const next = prev.map((s) => (s.id === tempId ? confirmedSnap : s));
                    void storage.setItem(cacheKey, JSON.stringify(next));
                    return next;
                });

                // Phát WebSocket báo ngay cho máy đối phương hiển thị ảnh mới
                if (socketRef.current?.connected) {
                    socketRef.current.emit('locket:new_snap', confirmedSnap);
                }
            } catch (err) {
                console.warn('Lỗi đẩy Locket lên Cloud:', err);
            } finally {
                mutationInFlightRef.current -= 1;
            }
        },
        [currentUserId, cacheKey, mapCloudSnapToView],
    );

    // Chụp từ khung ngắm LocketCameraCard
    const captureFromCameraCard = useCallback(
        async (uri: string, stamp: string, caption: string) => {
            await uploadAndBroadcastSnap(uri, stamp, caption);
        },
        [uploadAndBroadcastSnap],
    );

    // Chọn ảnh từ thư viện gửi vào Locket
    const pickLocketFromGallery = useCallback(
        async (stamp: string, caption: string) => {
            const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!libPerm.granted) {
                Alert.alert(
                    'Cần quyền Thư viện ảnh',
                    'Hãy cấp quyền Thư viện ảnh trong Cài đặt để chia sẻ ảnh Locket.',
                    [
                        { text: 'Đóng', style: 'cancel' },
                        { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
                    ],
                );
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: socialPrefs.hdMediaUpload ? 0.92 : 0.75,
            });

            if (result.canceled || !result.assets?.[0]) return;
            await uploadAndBroadcastSnap(result.assets[0].uri, stamp, caption);
        },
        [socialPrefs.hdMediaUpload, uploadAndBroadcastSnap],
    );

    // Xóa Locket: Xóa ngay trên UI + Khóa Tombstone + Xóa trong PostgreSQL & S3 + Báo sang máy đối phương
    const deleteSnapRealtime = useCallback(
        async (snapId: string) => {
            const target = snapsRef.current.find((s) => s.id === snapId) as any;
            deletedIdsTombstoneRef.current.add(snapId);
            if (target?.remoteUrl) {
                deletedIdsTombstoneRef.current.add(target.remoteUrl);
            }

            setLocketSnaps((prev) => {
                const next = prev.filter((s) => s.id !== snapId);
                void storage.setItem(cacheKey, JSON.stringify(next));
                return next;
            });

            if (socketRef.current?.connected) {
                socketRef.current.emit('locket:delete_snap', {
                    snapId,
                    remoteUrl: target?.remoteUrl,
                });
            }

            if (!String(snapId).startsWith('locket_')) {
                mutationInFlightRef.current += 1;
                try {
                    await deleteCloudMediaById(snapId);
                } catch (err) {
                    console.warn('Không thể xóa Locket trên Cloud:', err);
                } finally {
                    mutationInFlightRef.current -= 1;
                }
            }
        },
        [cacheKey],
    );

    // Thả cảm xúc Locket: Nhảy số tức thì trên cả 2 máy và lưu vào cột `reactions` trong PostgreSQL
    const reactSnapRealtime = useCallback(
        async (snapId: string, emoji: string) => {
            void Haptics.selectionAsync().catch(() => null);

            const newReactionObj = {
                id: `${currentUserId}_${Date.now()}`,
                userId: currentUserId,
                emoji,
                createdAt: new Date().toISOString(),
            };

            setLocketSnaps((prev) => {
                const next = prev.map((s) => {
                    if (s.id !== snapId) return s;
                    const filtered = s.reactions.filter(
                        (r: any) =>
                            typeof r === 'string' ||
                            r.userId !== currentUserId ||
                            r.emoji !== emoji,
                    );
                    return { ...s, reactions: [...filtered, newReactionObj] };
                });
                void storage.setItem(cacheKey, JSON.stringify(next));
                return next;
            });

            if (!String(snapId).startsWith('locket_')) {
                try {
                    const res = await api.post(`/api/v1/media/${snapId}/reactions`, {
                        emoji,
                    });
                    if (socketRef.current?.connected) {
                        socketRef.current.emit('locket:react_snap', {
                            snapId,
                            emoji,
                            reactions: res.data?.reactions,
                        });
                    }
                } catch {}
            }
        },
        [currentUserId, cacheKey],
    );

    return {
        locketSnaps,
        locketLive,
        captureFromCameraCard,
        pickLocketFromGallery,
        deleteSnapRealtime,
        reactSnapRealtime,
        refreshLockets: () => syncLocketsFromCloud(false),
    };
}