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
import { Platform, Alert } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as ImageManipulator from 'expo-image-manipulator';

export type CloudMediaCategory = 'ALBUM_MEDIA' | 'LOCKET_SNAP' | 'TIME_CAPSULE';
export type CloudMediaType = 'IMAGE' | 'VIDEO';
export type MediaUploadPurpose = 'AVATAR' | 'HERO_WALLPAPER' | 'THUMBNAIL' | 'GENERAL';

export interface UploadMediaInput {
  localUri: string;
  category: CloudMediaCategory;
  mediaType: CloudMediaType;
  purpose?: MediaUploadPurpose;
  caption?: string;
  stamp?: string;
  durationSec?: number;
  idempotencyKey?: string;
  // Bỏ qua hàng đợi offline (dùng cho avatar / hình nền)
  skipOfflineQueue?: boolean;
  // Bỏ qua bước gọi /api/v1/media/confirm để KHÔNG lưu thành ảnh trong Album chung
  skipDbRecord?: boolean;
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

export interface ProfileSyncPayload {
  nickname: string;
  avatarUri?: string | null;
  birthDate?: string | null;
  updatedAt?: string | null;
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

export class CloudMediaUploadError extends Error {
  code: 'VIDEO_TOO_LARGE' | 'S3_UPLOAD_FAILED' | 'PRESIGNED_URL_FAILED' | 'CONFIRM_DB_FAILED';
  causeError?: unknown;

  constructor(
    message: string,
    code: 'VIDEO_TOO_LARGE' | 'S3_UPLOAD_FAILED' | 'PRESIGNED_URL_FAILED' | 'CONFIRM_DB_FAILED',
    causeError?: unknown,
  ) {
    super(message);
    this.name = 'CloudMediaUploadError';
    this.code = code;
    this.causeError = causeError;
  }
}

const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;
const PENDING_MEDIA_SYNC_KEY = 'lovevault_pending_cloud_media_queue_v1';
const PENDING_WORKSPACE_SNAPSHOT_KEY = 'lovevault_pending_workspace_snapshot_v1';
const MAX_RETRY_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildIdempotencyKey = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const isRemoteHttpUrl = (uri?: string | null): boolean =>
  Boolean(uri && (uri.startsWith('http://') || uri.startsWith('https://')));

export const isLocalOrBase64Uri = (uri?: string | null): boolean =>
  Boolean(
    uri &&
      (uri.startsWith('data:') ||
        uri.startsWith('file://') ||
        uri.startsWith('blob:') ||
        uri.startsWith('content://') ||
        uri.startsWith('ph://')),
  );

/**
 * Thông báo lỗi rõ ràng cho người dùng khi upload ảnh đại diện / hình nền thất bại
 * thay vì nuốt lỗi im lặng.
 */
export const notifyMediaUploadFailure = (contextLabel: string, error: unknown) => {
  const detail =
    error instanceof Error ? error.message : 'Kết nối mạng không ổn định, vui lòng thử lại.';
  console.error(`[CloudMediaService] Lỗi khi tải ${contextLabel}:`, error);

  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(`Không thể tải ${contextLabel} lên đám mây: ${detail}`);
  } else {
    Alert.alert('Lỗi đồng bộ hình ảnh', `Không thể tải ${contextLabel} lên đám mây.\n${detail}`);
  }
};

/**
 * Web: Resize và nén ảnh (đặc biệt khi nhận chuỗi Base64 hoặc blob) bằng <canvas>
 */
const resizeImageOnWeb = (
  uri: string,
  maxWidth: number,
  quality: number,
): Promise<string> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(uri);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const srcW = img.naturalWidth || img.width || maxWidth;
        const srcH = img.naturalHeight || img.height || maxWidth;
        const scale = Math.min(1, maxWidth / Math.max(srcW, srcH));
        const targetW = Math.max(1, Math.round(srcW * scale));
        const targetH = Math.max(1, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(uri);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(uri);
      }
    };
    img.onerror = () => resolve(uri);
    img.src = uri;
  });

/**
 * Web: đọc duration và chụp khung hình đầu của video bằng <video> + <canvas>
 */
const getWebVideoMeta = (
  uri: string,
): Promise<{ durationSec: number; thumbnailUri: string | null }> =>
  new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = uri;

    let durationSec = 0;
    const fail = () => resolve({ durationSec, thumbnailUri: null });

    video.onloadedmetadata = () => {
      durationSec = Math.round(video.duration) || 0;
      video.currentTime = Math.min(2, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const srcW = video.videoWidth || 640;
        const srcH = video.videoHeight || 360;
        const scale = Math.min(1, 640 / srcW);
        canvas.width = Math.round(srcW * scale);
        canvas.height = Math.round(srcH * scale);
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve({ durationSec, thumbnailUri: canvas.toDataURL('image/jpeg', 0.7) });
      } catch {
        fail();
      }
    };
    video.onerror = fail;
  });

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
 * 1A. Upload Avatar lên Cloud (S3/R2):
 * - Tự động resize về 512px, compress 0.8
 * - skipDbRecord: true -> KHÔNG lưu vào bảng Media (không bị chui vào Album chung)
 * - skipOfflineQueue: true -> Lỗi sẽ ném ra ngay để UI xử lý, không giữ Base64 nặng
 */
export const uploadAvatarToCloud = async (localUri: string): Promise<string> => {
  if (isRemoteHttpUrl(localUri)) {
    return localUri;
  }

  const record = await uploadMediaToCloudAndSaveDb({
    localUri,
    category: 'ALBUM_MEDIA',
    mediaType: 'IMAGE',
    purpose: 'AVATAR',
    caption: 'Avatar',
    skipOfflineQueue: true,
    skipDbRecord: true,
  });

  return record.remoteUrl;
};

/**
 * 1B. Upload Hình nền (Hero Wallpaper) hoặc Avatar gọi qua hàm cũ:
 * - Mặc định skipDbRecord: true để KHÔNG sinh thêm ảnh rác vào Album chung mỗi lần đổi.
 * - Có thể truyền purpose = 'AVATAR' hoặc 'HERO_WALLPAPER'.
 */
export const uploadHeroWallpaperToCloud = async (
  localUri: string,
  purpose: 'AVATAR' | 'HERO_WALLPAPER' = 'HERO_WALLPAPER',
): Promise<string> => {
  if (isRemoteHttpUrl(localUri)) {
    return localUri;
  }

  const record = await uploadMediaToCloudAndSaveDb({
    localUri,
    category: 'ALBUM_MEDIA',
    mediaType: 'IMAGE',
    purpose,
    caption: purpose === 'AVATAR' ? 'Avatar' : 'Hero Wallpaper',
    skipOfflineQueue: true,
    skipDbRecord: true,
  });

  return record.remoteUrl;
};

/**
 * Chuẩn hóa danh sách profiles trước khi gửi lên Cloud:
 * 1. Nếu avatarUri là ảnh local/Base64 chưa upload -> cố gắng upload ngay.
 *    Nếu upload thất bại -> ném lỗi hoặc loại bỏ avatarUri khỏi payload (tuyệt đối không gửi Base64 vài MB gây lỗi 413).
 * 2. Chỉ gửi những profile thực sự có `updatedAt` (hoặc bảo toàn `updatedAt` đã có),
 *    tránh gửi profile cache cũ không có `updatedAt` khiến Backend gán `updatedAt = now` và ghi đè đối phương.
 */
const sanitizeProfilesForCloudSync = async (
  profiles?: Record<string, ProfileSyncPayload>,
  options?: { strictUploadError?: boolean },
): Promise<Record<string, ProfileSyncPayload> | undefined> => {
  if (!profiles || typeof profiles !== 'object') return undefined;

  const sanitized: Record<string, ProfileSyncPayload> = {};

  for (const [userId, profile] of Object.entries(profiles)) {
    if (!profile || typeof profile !== 'object') continue;

    let cleanAvatarUri = profile.avatarUri;

    if (cleanAvatarUri && isLocalOrBase64Uri(cleanAvatarUri)) {
      try {
        cleanAvatarUri = await uploadAvatarToCloud(cleanAvatarUri);
      } catch (err) {
        if (options?.strictUploadError) {
          throw err;
        }
        // Không gửi chuỗi Base64/localUri lên DB để tránh lỗi 413 và tránh ghi đè rác;
        // đặt undefined để Backend giữ nguyên avatarUri hiện có trên DB.
        cleanAvatarUri = undefined;
      }
    }

    const entry: ProfileSyncPayload = {
      nickname: profile.nickname,
      birthDate: profile.birthDate,
      ...(cleanAvatarUri !== undefined ? { avatarUri: cleanAvatarUri } : {}),
      // Chỉ đính kèm updatedAt nếu nơi gọi truyền vào timestamp thực tế của lần sửa hồ sơ đó
      ...(profile.updatedAt ? { updatedAt: profile.updatedAt } : {}),
    };

    sanitized[userId] = entry;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

/**
 * 2. Đẩy cấu hình phòng lên PostgreSQL.
 * - Đã khắc phục lỗi đường ghi thứ 2: Không gửi `membersById` thiếu `updatedAt` hoặc chứa Base64.
 * - Nếu nơi gọi chỉ muốn đổi theme/quỹ/ngày kỷ niệm mà truyền kèm `profiles` từ cache cũ (không có `updatedAt`),
 *   hàm sẽ lọc bỏ những profile không có `updatedAt` khỏi `membersById` để Backend không tự gán `updatedAt = now`.
 */
export const pushSharedRoomSettingsToCloud = async (
  coupleId: string,
  settings: {
    heroWallpaperUri?: string | null;
    profiles?: Record<string, ProfileSyncPayload>;
    anniversaryDate?: string | null;
    momoFund?: any;
    themePreset?: string;
  },
  options?: { notifyOnError?: boolean },
): Promise<boolean> => {
  if (!coupleId) return false;

  try {
    let cleanHeroUri = settings.heroWallpaperUri;
    if (cleanHeroUri && isLocalOrBase64Uri(cleanHeroUri)) {
      try {
        cleanHeroUri = await uploadHeroWallpaperToCloud(cleanHeroUri, 'HERO_WALLPAPER');
      } catch (uploadErr) {
        if (options?.notifyOnError !== false) {
          notifyMediaUploadFailure('hình nền', uploadErr);
        }
        // Giữ nguyên trên DB thay vì đẩy Base64 gây lỗi 413
        cleanHeroUri = undefined;
      }
    }

    const sanitizedProfiles = await sanitizeProfilesForCloudSync(settings.profiles, {
      strictUploadError: false,
    });

    // Chỉ đưa vào `membersById` những profile có `updatedAt` rõ ràng để tránh Backend gán `updatedAt = now` cho cache cũ
    const explicitUpdatedMembers: Record<string, ProfileSyncPayload> = {};
    if (sanitizedProfiles) {
      for (const [uid, prof] of Object.entries(sanitizedProfiles)) {
        if (prof.updatedAt) {
          explicitUpdatedMembers[uid] = prof;
        }
      }
    }

    const hasExplicitMemberUpdates = Object.keys(explicitUpdatedMembers).length > 0;

    const cleanSettings = {
      ...settings,
      ...(cleanHeroUri !== undefined ? { heroWallpaperUri: cleanHeroUri } : {}),
      ...(hasExplicitMemberUpdates ? { profiles: explicitUpdatedMembers } : {}),
    };
    if (!hasExplicitMemberUpdates) {
      delete cleanSettings.profiles;
    }
    if (cleanHeroUri === undefined) {
      delete cleanSettings.heroWallpaperUri;
    }

    await api.patch('/api/v1/couples/shared-settings', {
      coupleId,
      ...cleanSettings,
      ...(hasExplicitMemberUpdates ? { membersById: explicitUpdatedMembers } : {}),
      sharedSettings: cleanSettings,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error('Lỗi đẩy sharedSettings lên Cloud:', error);
    if (options?.notifyOnError) {
      notifyMediaUploadFailure('cài đặt phòng', error);
    }
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
  let durationSec = input.durationSec;

  const isAvatar =
    input.purpose === 'AVATAR' || input.caption === 'Avatar';
  const isHeroWallpaper =
    input.purpose === 'HERO_WALLPAPER' || input.caption === 'Hero Wallpaper';
  const isThumbnail =
    input.purpose === 'THUMBNAIL' || input.caption === 'thumbnail';

  // Tự động bật skipDbRecord cho Avatar, Hero Wallpaper và Thumbnail video để không làm rác Album
  const shouldSkipDbRecord =
    input.skipDbRecord ?? (isAvatar || isHeroWallpaper || isThumbnail);

  // 0. Native: chuỗi Base64 (data:image/...) được ghi ra file tạm TRƯỚC khi qua bước ImageManipulator,
  //    nhờ đó cả ảnh Base64 lẫn file:// đều được resize và nén đồng nhất.
  if (Platform.OS !== 'web' && uploadUri.startsWith('data:image')) {
    try {
      const base64Body = uploadUri.split(',')[1] || '';
      if (base64Body) {
        const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        const tmpPath = `${baseDir}upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        await FileSystem.writeAsStringAsync(tmpPath, base64Body, {
          encoding: FileSystem.EncodingType.Base64,
        });
        uploadUri = tmpPath;
      }
    } catch (e) {
      console.warn('Không thể ghi ảnh Base64 ra tệp tạm:', e);
    }
  }

  // 1. Nếu là VIDEO: kiểm tra dung lượng & tạo thumbnail
  if (input.mediaType === 'VIDEO') {
    if (Platform.OS === 'web' || uploadUri.startsWith('blob:') || uploadUri.startsWith('data:')) {
      const res = await fetch(uploadUri);
      const blob = await res.blob();
      if (blob.size > MAX_VIDEO_SIZE_BYTES) {
        throw new CloudMediaUploadError(
          'VIDEO_TOO_LARGE: Video vượt quá giới hạn 200MB. Vui lòng chọn video ngắn hoặc nhẹ hơn.',
          'VIDEO_TOO_LARGE',
        );
      }
    } else {
      const fileInfo = await FileSystem.getInfoAsync(uploadUri);
      if (fileInfo.exists && typeof fileInfo.size === 'number' && fileInfo.size > MAX_VIDEO_SIZE_BYTES) {
        throw new CloudMediaUploadError(
          'VIDEO_TOO_LARGE: Video vượt quá giới hạn 200MB. Vui lòng chọn video ngắn hoặc nhẹ hơn.',
          'VIDEO_TOO_LARGE',
        );
      }
    }

    try {
      let thumbLocalUri: string | null = null;

      if (Platform.OS === 'web') {
        const meta = await getWebVideoMeta(input.localUri);
        thumbLocalUri = meta.thumbnailUri;
        if (!durationSec) durationSec = meta.durationSec;
      } else {
        const thumbTimeMs =
          durationSec && durationSec > 0
            ? Math.min(2000, Math.floor((durationSec * 1000) / 2))
            : 2000;
        const t = await VideoThumbnails.getThumbnailAsync(input.localUri, { time: thumbTimeMs });
        thumbLocalUri = t.uri;
      }

      if (thumbLocalUri) {
        const thumbRecord = await uploadMediaToCloudAndSaveDb({
          localUri: thumbLocalUri,
          category: input.category,
          mediaType: 'IMAGE',
          purpose: 'THUMBNAIL',
          caption: 'thumbnail',
          skipOfflineQueue: true,
          skipDbRecord: true, // Thumbnail của video không được lưu thành 1 ảnh riêng trong Album
        });
        thumbnailUrl = thumbRecord.remoteUrl;
      }
    } catch (e) {
      console.warn('Không thể tạo thumbnail:', e);
    }
  }

  // 2. Nếu là IMAGE: Resize & Nén theo đúng mục đích (AVATAR: 512px, HERO_WALLPAPER: 1440px)
  if (input.mediaType === 'IMAGE' && !isRemoteHttpUrl(uploadUri)) {
    if (Platform.OS === 'web') {
      const targetMaxW = isAvatar ? 512 : isHeroWallpaper ? 1600 : 1920;
      const targetQuality = isAvatar ? 0.8 : isHeroWallpaper ? 0.9 : 0.85;
      uploadUri = await resizeImageOnWeb(uploadUri, targetMaxW, targetQuality);
    } else if (!uploadUri.startsWith('blob:') && !uploadUri.startsWith('data:')) {
      try {
        const actions: ImageManipulator.Action[] = isAvatar
          ? [{ resize: { width: 512 } }]
          : isHeroWallpaper
            ? [{ resize: { width: 1440 } }]
            : [];

        const compressRatio = isAvatar ? 0.8 : isHeroWallpaper ? 0.9 : 0.85;

        const manipResult = await ImageManipulator.manipulateAsync(
          uploadUri,
          actions,
          {
            compress: compressRatio,
            format: ImageManipulator.SaveFormat.JPEG,
          },
        );
        uploadUri = manipResult.uri;
      } catch (e) {
        console.warn('Không thể resize/nén ảnh trên thiết bị:', e);
      }
    }
  }

  const isVideo = input.mediaType === 'VIDEO';
  const ext = isVideo ? 'mp4' : 'jpg';
  const contentType = isVideo ? 'video/mp4' : 'image/jpeg';
  const prefix = isAvatar
    ? 'avatar'
    : isHeroWallpaper
      ? 'wallpaper'
      : input.category.toLowerCase();
  const idempotencyKey = input.idempotencyKey || buildIdempotencyKey(prefix);
  const filename = `${prefix}_${Date.now()}.${ext}`;

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

      // Bước 2: Đẩy luồng nhị phân trực tiếp lên S3 / Cloudflare R2
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
          throw new CloudMediaUploadError(
            `S3/R2 trả về mã lỗi HTTP ${putRes.status} khi tải tệp lên.`,
            'S3_UPLOAD_FAILED',
          );
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
          throw new CloudMediaUploadError(
            `S3/R2 trả về mã lỗi HTTP ${uploadRes.status} khi tải tệp lên.`,
            'S3_UPLOAD_FAILED',
          );
        }
      }

      const finalRemoteUrl = presigned.remoteUrl || presigned.publicUrl;

      // Nếu là Avatar, Hero Wallpaper hoặc Thumbnail video: KHÔNG gọi /api/v1/media/confirm
      // để tránh sinh bản ghi ALBUM_MEDIA làm rác Album chung.
      if (shouldSkipDbRecord) {
        return {
          id: idempotencyKey,
          coupleId: '',
          uploaderId: '',
          category: input.category,
          mediaType: input.mediaType,
          fileKey: presigned.fileKey,
          remoteUrl: finalRemoteUrl,
          thumbnailUrl: thumbnailUrl ?? null,
          caption: input.caption ?? null,
          stamp: input.stamp ?? null,
          durationSec: durationSec ?? null,
          createdAt: new Date().toISOString(),
        };
      }

      // Bước 3: Lưu remoteUrl và metadata vào PostgreSQL (chỉ dành cho ảnh/video Album, Locket, Time Capsule thật)
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
          durationSec,
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

  const isTooLargeError =
    lastError instanceof Error && lastError.message.includes('VIDEO_TOO_LARGE');

  if (!input.skipOfflineQueue && !isTooLargeError) {
    try {
      await enqueuePendingMediaUpload({ ...input, idempotencyKey });
    } catch (queueError) {
      console.warn('Không thể lưu hàng đợi upload offline:', queueError);
    }
  }
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
 * Đảm bảo lọc bỏ mọi chuỗi Base64 trong `sharedSettings` trước khi PUT hoặc lưu vào AsyncStorage.
 */
export const pushCoupleRoomSnapshotToCloud = async (
  snapshot: Partial<CoupleRoomCloudSnapshot> & { coupleId: string },
): Promise<boolean> => {
  if (!snapshot.coupleId) return false;

  // Ngăn chặn chuỗi Base64 lọt vào snapshot gây lỗi 413 Payload Too Large hoặc làm đầy AsyncStorage
  const sanitizedSnapshot = { ...snapshot };
  if (sanitizedSnapshot.sharedSettings && typeof sanitizedSnapshot.sharedSettings === 'object') {
    const ss = { ...sanitizedSnapshot.sharedSettings };
    if (isLocalOrBase64Uri(ss.heroWallpaperUri)) {
      delete ss.heroWallpaperUri;
    }
    if (ss.profiles && typeof ss.profiles === 'object') {
      const cleanProfiles: Record<string, any> = {};
      for (const [uid, p] of Object.entries(ss.profiles as Record<string, any>)) {
        if (!p || typeof p !== 'object') continue;
        const copy = { ...p };
        if (isLocalOrBase64Uri(copy.avatarUri)) {
          delete copy.avatarUri;
        }
        cleanProfiles[uid] = copy;
      }
      ss.profiles = cleanProfiles;
    }
    sanitizedSnapshot.sharedSettings = ss;
  }

  try {
    await api.put('/api/v1/couples/workspace-sync', {
      ...sanitizedSnapshot,
      updatedAt: new Date().toISOString(),
    });
    await storage.removeItem(`${PENDING_WORKSPACE_SNAPSHOT_KEY}_${snapshot.coupleId}`);
    return true;
  } catch {
    await storage.setItem(
      `${PENDING_WORKSPACE_SNAPSHOT_KEY}_${snapshot.coupleId}`,
      JSON.stringify({
        ...sanitizedSnapshot,
        updatedAt: new Date().toISOString(),
      }),
    );
    return false;
  }
};

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