// src/services/cloudMediaService.ts
import * as FileSystem from 'expo-file-system/legacy';
import { api } from './api';
import { storage } from './storage';
import type {
  ImportantEvent,
  CoupleGoalItem,
  DailyQAItem,
  CoupleMediaItem,
  LocketSnapItem,
} from '../hooks/useCoupleWorkspace';
import { Platform } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as ImageManipulator from 'expo-image-manipulator';
export type CloudMediaCategory = 'ALBUM_MEDIA' | 'LOCKET_SNAP' | 'TIME_CAPSULE';
export type CloudMediaType = 'IMAGE' | 'VIDEO';

export interface UploadMediaInput {
  localUri: string;
  category: CloudMediaCategory;
  mediaType: CloudMediaType;
  caption?: string;
  stamp?: string;
  durationSec?: number;
  idempotencyKey?: string;
}

export interface CloudMediaRecord {
  id: string;
  coupleId: string;
  uploaderId: string;
  category: CloudMediaCategory;
  mediaType: CloudMediaType;
  fileKey: string;
  remoteUrl: string;
  thumbnailUrl?: string | null;
  caption?: string | null;
  stamp?: string | null;
  durationSec?: number | null;
  reactions?: Array<{
    id: string;
    userId: string;
    emoji: string;
    createdAt: string;
  }>;
  createdAt: string;
}

export interface PendingMediaQueueItem extends UploadMediaInput {
  idempotencyKey: string;
  retryCount: number;
  createdAtIso: string;
}

export interface CoupleRoomCloudSnapshot {
  coupleId: string;
  anniversaryDate?: string | null;
  events: ImportantEvent[];
  goals: CoupleGoalItem[];
  dailyQA?: DailyQAItem | null;
  qaHistory: DailyQAItem[];
  albumMedia?: CloudMediaRecord[];
  locketSnaps?: CloudMediaRecord[];
  sharedSettings?: Record<string, any> | null;
  updatedAt?: string;
}

const PENDING_MEDIA_SYNC_KEY = 'lovevault_pending_cloud_media_queue_v1';
const PENDING_WORKSPACE_SNAPSHOT_KEY = 'lovevault_pending_workspace_snapshot_v1';
const MAX_RETRY_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildIdempotencyKey = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const readPendingQueue = async (): Promise<PendingMediaQueueItem[]> => {
  try {
    const raw = await storage.getItem(PENDING_MEDIA_SYNC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writePendingQueue = async (queue: PendingMediaQueueItem[]): Promise<void> => {
  await storage.setItem(PENDING_MEDIA_SYNC_KEY, JSON.stringify(queue));
};

/**
 * 1. Upload ảnh nền cục bộ (file://) lên Cloud (S3/R2) 
 * để lấy link online (https://) chia sẻ được cho đối phương.
 */
export const uploadHeroWallpaperToCloud = async (localUri: string): Promise<string> => {
  // Nếu đã là đường link online thì không cần upload lại
  if (localUri.startsWith('http://') || localUri.startsWith('https://')) {
    return localUri;
  }

  const record = await uploadMediaToCloudAndSaveDb({
    localUri,
    category: 'ALBUM_MEDIA',
    mediaType: 'IMAGE',
    caption: 'Hero Wallpaper',
  });

  return record.remoteUrl;
};

/**
 * 2. Đẩy toàn bộ cấu hình phòng (Hình nền online, Profile 2 đứa, Ngày sinh, MoMo) lên PostgreSQL
 */
export const pushSharedRoomSettingsToCloud = async (
  coupleId: string,
  settings: {
    heroWallpaperUri?: string | null;
    profiles?: Record<string, { nickname: string; avatarUri?: string | null; birthDate?: string | null }>;
    anniversaryDate?: string | null;
    momoFund?: any;
    themePreset?: string;
  },
): Promise<boolean> => {
  if (!coupleId) return false;
  try {
    await api.patch('/api/v1/couples/shared-settings', {
      coupleId,
      sharedSettings: settings,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error('Lỗi đẩy sharedSettings lên Cloud:', error);
    return false;
  }
};
export const enqueuePendingMediaUpload = async (
  input: UploadMediaInput,
): Promise<PendingMediaQueueItem> => {
  const queue = await readPendingQueue();
  const idempotencyKey =
    input.idempotencyKey || buildIdempotencyKey(input.category.toLowerCase());

  const existing = queue.find((item) => item.idempotencyKey === idempotencyKey);
  if (existing) return existing;

  const newItem: PendingMediaQueueItem = {
    ...input,
    idempotencyKey,
    retryCount: 0,
    createdAtIso: new Date().toISOString(),
  };

  queue.push(newItem);
  await writePendingQueue(queue);
  return newItem;
};

export const uploadMediaToCloudAndSaveDb = async (
  input: UploadMediaInput,
): Promise<CloudMediaRecord> => {
  let uploadUri = input.localUri;
  let thumbnailUrl: string | undefined = undefined;

  // 1. Nếu là VIDEO: Tạo thumbnail từ localUri và upload thumbnail trước
  if (input.mediaType === 'VIDEO' && Platform.OS !== 'web') {
    try {
      const { uri: thumbLocalUri } = await VideoThumbnails.getThumbnailAsync(input.localUri, {
        time: 1000,
      });
      // Upload ảnh thumbnail này lên Cloud (gọi đệ quy với mediaType = IMAGE)
      const thumbRecord = await uploadMediaToCloudAndSaveDb({
        localUri: thumbLocalUri,
        category: input.category,
        mediaType: 'IMAGE',
        caption: 'thumbnail',
      });
      thumbnailUrl = thumbRecord.remoteUrl;
    } catch (e) {
      console.warn('Không thể tạo thumbnail cho video:', e);
    }
  }

  // 2. Nếu là IMAGE: Nén giảm kích thước ảnh xuống tối đa 1920px để tối ưu dung lượng
  if (
    input.mediaType === 'IMAGE' &&
    Platform.OS !== 'web' &&
    !uploadUri.startsWith('http') &&
    !uploadUri.startsWith('blob:') &&
    !uploadUri.startsWith('data:')
  ) {
    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        uploadUri,
        [{ resize: { width: 1920 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      uploadUri = manipResult.uri;
    } catch (e) {
      console.warn('Không thể nén ảnh:', e);
    }
  }

  const isVideo = input.mediaType === 'VIDEO';
  const ext = isVideo ? 'mp4' : 'jpg';
  const contentType = isVideo ? 'video/mp4' : 'image/jpeg';
  const idempotencyKey =
    input.idempotencyKey || buildIdempotencyKey(input.category.toLowerCase());
  const filename = `${input.category.toLowerCase()}_${Date.now()}.${ext}`;

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      // Bước 1: Xin Presigned URL từ Backend (/api/v1/media/presigned-url)
      const { data: presigned } = await api.post<{
        uploadUrl: string;
        fileKey: string;
        publicUrl: string;
        remoteUrl?: string;
      }>('/api/v1/media/presigned-url', {
        filename,
        contentType,
      });

      // Bước 2: Đẩy luồng nhị phân trực tiếp lên S3 / Cloudflare R2 (dùng uploadUri đã nén)
      if (Platform.OS === 'web' || uploadUri.startsWith('blob:') || uploadUri.startsWith('data:')) {
        const fileResponse = await fetch(uploadUri);
        const fileBlob = await fileResponse.blob();
        const putRes = await fetch(presigned.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
          },
          body: fileBlob,
        });
        if (!putRes.ok) {
          throw new Error(`S3/R2 trả về mã lỗi HTTP ${putRes.status} khi tải tệp lên.`);
        }
      } else {
        const uploadRes = await FileSystem.uploadAsync(
          presigned.uploadUrl,
          uploadUri,
          {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: {
              'Content-Type': contentType,
            },
          },
        );

        if (uploadRes.status < 200 || uploadRes.status >= 300) {
          throw new Error(
            `S3/R2 trả về mã lỗi HTTP ${uploadRes.status} khi tải tệp lên.`,
          );
        }
      }

      const finalRemoteUrl = presigned.remoteUrl || presigned.publicUrl;

      // Bước 3: Lưu remoteUrl và metadata vào PostgreSQL qua Prisma kèm idempotencyKey & thumbnailUrl
      const { data: savedRecord } = await api.post<CloudMediaRecord>(
        '/api/v1/media/confirm',
        {
          category: input.category,
          mediaType: input.mediaType,
          fileKey: presigned.fileKey,
          remoteUrl: finalRemoteUrl,
          thumbnailUrl,
          caption: input.caption || undefined,
          stamp: input.stamp || undefined,
          durationSec: input.durationSec,
          idempotencyKey,
        },
      );

      return savedRecord;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        await sleep(800 * Math.pow(2, attempt));
      }
    }
  }

  // Nếu rớt mạng hoàn toàn sau 3 lần thử, đẩy vào hàng đợi Offline để đồng bộ bù sau
  await enqueuePendingMediaUpload({ ...input, idempotencyKey });
  throw lastError;
};

export const flushPendingCloudMediaQueue = async (): Promise<CloudMediaRecord[]> => {
  const queue = await readPendingQueue();
  if (queue.length === 0) return [];

  const syncedRecords: CloudMediaRecord[] = [];
  const remainingQueue: PendingMediaQueueItem[] = [];

  for (const item of queue) {
    try {
      if (Platform.OS !== 'web' && !item.localUri.startsWith('blob:') && !item.localUri.startsWith('data:')) {
        const info = await FileSystem.getInfoAsync(item.localUri);
        if (!info.exists) {
          continue;
        }
      }
      const record = await uploadMediaToCloudAndSaveDb(item);
      syncedRecords.push(record);
    } catch {
      remainingQueue.push({
        ...item,
        retryCount: item.retryCount + 1,
      });
    }
  }

  await writePendingQueue(remainingQueue);
  return syncedRecords;
};

export const fetchCloudWorkspaceMedia = async (limit = 150) => {
  const { data } = await api.get<{
    albumMedia: CloudMediaRecord[];
    locketSnaps: CloudMediaRecord[];
    timeCapsules: CloudMediaRecord[];
    syncedAt: string;
  }>('/api/v1/media/workspace', {
    params: { limit },
  });
  return data;
};

export const deleteCloudMediaById = async (mediaId: string) => {
  const { data } = await api.delete<{ deleted: boolean; id: string }>(
    `/api/v1/media/${mediaId}`,
  );
  return data;
};

// ============================================================================
// ĐỒNG BỘ TOÀN BỘ DỮ LIỆU PHÒNG CẶP ĐÔI (EVENTS, GOALS, MOMO, QA, SETTINGS)
// ============================================================================

/**
 * Tải toàn bộ dữ liệu của 1 coupleId từ PostgreSQL khi người dùng cài lại app hoặc đổi máy.
 * Hỗ trợ gọi endpoint tổng hợp `/api/v1/couples/workspace-sync` hoặc gom từ các endpoint thành phần.
 */
export const fetchFullCoupleRoomFromCloud = async (
  coupleId: string,
): Promise<CoupleRoomCloudSnapshot | null> => {
  if (!coupleId) return null;

  try {
    const { data } = await api.get<CoupleRoomCloudSnapshot>(
      '/api/v1/couples/workspace-sync',
      { params: { coupleId } },
    );
    if (data && typeof data === 'object') {
      return data;
    }
  } catch {
    // Fallback: Nếu backend tách riêng từng endpoint (milestones, goals, daily-answers)
    try {
      const [milestonesRes, goalsRes, qaRes] = await Promise.allSettled([
        api.get<ImportantEvent[]>('/api/v1/milestones'),
        api.get<CoupleGoalItem[]>('/api/v1/couples/goals'),
        api.get<{ dailyQA?: DailyQAItem; qaHistory?: DailyQAItem[] }>(
          '/api/v1/daily-answers/history',
        ),
      ]);

      const events =
        milestonesRes.status === 'fulfilled' && Array.isArray(milestonesRes.value.data)
          ? milestonesRes.value.data
          : [];
      const goals =
        goalsRes.status === 'fulfilled' && Array.isArray(goalsRes.value.data)
          ? goalsRes.value.data
          : [];
      const dailyQA =
        qaRes.status === 'fulfilled' ? qaRes.value.data?.dailyQA || null : null;
      const qaHistory =
        qaRes.status === 'fulfilled' && Array.isArray(qaRes.value.data?.qaHistory)
          ? qaRes.value.data.qaHistory
          : [];

      if (events.length > 0 || goals.length > 0 || dailyQA || qaHistory.length > 0) {
        return {
          coupleId,
          events,
          goals,
          dailyQA,
          qaHistory,
        };
      }
    } catch {
      return null;
    }
  }

  return null;
};

/**
 * Đẩy bản chụp (Snapshot) toàn bộ dữ liệu của phòng lên PostgreSQL.
 * Nếu mất mạng, tự động lưu vào hàng đợi Offline để đẩy bù ngay khi có mạng.
 */
export const pushCoupleRoomSnapshotToCloud = async (
  snapshot: Partial<CoupleRoomCloudSnapshot> & { coupleId: string },
): Promise<boolean> => {
  if (!snapshot.coupleId) return false;

  try {
    await api.put('/api/v1/couples/workspace-sync', {
      ...snapshot,
      updatedAt: new Date().toISOString(),
    });
    await storage.removeItem(`${PENDING_WORKSPACE_SNAPSHOT_KEY}_${snapshot.coupleId}`);
    return true;
  } catch {
    await storage.setItem(
      `${PENDING_WORKSPACE_SNAPSHOT_KEY}_${snapshot.coupleId}`,
      JSON.stringify({
        ...snapshot,
        updatedAt: new Date().toISOString(),
      }),
    );
    return false;
  }
};

/**
 * Đẩy bù bản chụp dữ liệu phòng đang chờ trong hàng đợi Offline lên PostgreSQL
 */
export const flushPendingRoomSnapshot = async (
  coupleId?: string | null,
): Promise<boolean> => {
  if (!coupleId) return false;
  try {
    const key = `${PENDING_WORKSPACE_SNAPSHOT_KEY}_${coupleId}`;
    const raw = await storage.getItem(key);
    if (!raw) return true;

    const pendingSnapshot = JSON.parse(raw);
    await api.put('/api/v1/couples/workspace-sync', pendingSnapshot);
    await storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};