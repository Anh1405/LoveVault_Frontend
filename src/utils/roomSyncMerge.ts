// src/utils/roomSyncMerge.ts
// Hợp nhất lịch hẹn/mục tiêu giữa máy này và Cloud theo từng mục (id + updatedAt).
// Xóa mục được ghi nhận bằng tombstone để máy kia biết mà xóa theo.

export interface SyncItem {
  id: string;
  updatedAt?: string;
  deletedAt?: string | null;
  syncStatus?: string;
  notificationId?: string | null;
  [key: string]: unknown;
}

/** id -> thời điểm xóa (ISO) */
export type TombMap = Record<string, string>;

const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const toMs = (value: unknown): number => {
  if (typeof value !== 'string') return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
};

// Các trường chỉ có nghĩa trên từng máy, không tính là "nội dung đã sửa"
const LOCAL_ONLY_KEYS = new Set([
  'updatedAt',
  'deletedAt',
  'syncStatus',
  'notificationId',
  'endNotificationId',
]);

const contentSignature = (item: unknown): string =>
  JSON.stringify(item, (key, value) => (LOCAL_ONLY_KEYS.has(key) ? undefined : value));

const pruneTombs = (tombs: TombMap, nowMs: number): TombMap => {
  const out: TombMap = {};
  for (const [id, at] of Object.entries(tombs)) {
    if (nowMs - toMs(at) <= TOMBSTONE_TTL_MS) out[id] = at;
  }
  return out;
};

/**
 * So `next` với `prev`: mục mới hoặc đổi nội dung được gắn updatedAt mới,
 * mục biến mất được ghi vào tombstone.
 */
export function diffAndStamp<T extends SyncItem>(
  prev: T[],
  next: T[],
  tombs: TombMap,
  nowMs: number = Date.now(),
): { items: T[]; tombs: TombMap } {
  const prevMap = new Map(prev.map((p) => [p.id, p]));
  const nextIds = new Set(next.map((n) => n.id));
  const outTombs: TombMap = { ...tombs };

  const items = next.map((item) => {
    delete outTombs[item.id];
    const before = prevMap.get(item.id);
    if (before && contentSignature(before) === contentSignature(item)) return item;
    const stamp = Math.max(nowMs, toMs(before?.updatedAt) + 1);
    return { ...item, updatedAt: new Date(stamp).toISOString() };
  });

  for (const p of prev) {
    if (nextIds.has(p.id)) continue;
    outTombs[p.id] = new Date(Math.max(nowMs, toMs(p.updatedAt) + 1)).toISOString();
  }

  return { items, tombs: pruneTombs(outTombs, nowMs) };
}

/** Ghép tombstone vào danh sách để đẩy lên server (server nhận cả hai loại trong cùng một mảng). */
export function withTombstones<T extends SyncItem>(items: T[], tombs: TombMap): T[] {
  const tombItems = Object.entries(tombs).map(([id, deletedAt]) => ({
    id,
    deletedAt,
    updatedAt: deletedAt,
  }));
  return [...items, ...tombItems] as unknown as T[];
}

// Id thông báo cục bộ thuộc về từng máy, không lấy của máy kia
const adoptCloud = <T extends SyncItem>(cloud: T, local?: T): T => {
  const next: any = {
    ...cloud,
    deletedAt: null,
    syncStatus: 'SYNCED',
    notificationId: local?.notificationId ?? null,
  };
  const plan: any = (cloud as any).datePlan;
  if (plan && typeof plan === 'object') {
    next.datePlan = {
      ...plan,
      endNotificationId: (local as any)?.datePlan?.endNotificationId ?? null,
    };
  }
  return next as T;
};

export interface MergeResult<T> {
  items: T[];
  tombs: TombMap;
  /** Có mục nào ở máy này mới hơn Cloud, hoặc Cloud chưa có */
  toPush: T[];
  /** Có tombstone ở máy này mà Cloud chưa biết */
  tombsToPush: boolean;
  changed: boolean;
}

export function mergeWithCloud<T extends SyncItem>(
  local: T[],
  cloud: T[],
  localTombs: TombMap,
): MergeResult<T> {
  const cloudLive = new Map<string, T>();
  const cloudTombs: TombMap = {};
  for (const c of cloud) {
    if (!c || typeof c.id !== 'string') continue;
    if (c.deletedAt) cloudTombs[c.id] = c.deletedAt;
    else cloudLive.set(c.id, c);
  }

  const tombs: TombMap = { ...localTombs };
  for (const [id, at] of Object.entries(cloudTombs)) {
    if (!tombs[id] || toMs(at) > toMs(tombs[id])) tombs[id] = at;
  }

  const localIds = new Set(local.map((l) => l.id));
  const items: T[] = [];
  const toPush: T[] = [];

  for (const loc of local) {
    const tombMs = toMs(tombs[loc.id]);
    const locMs = toMs(loc.updatedAt);

    if (tombMs > 0) {
      if (tombMs >= locMs) continue; // đã bị xóa ở nơi khác
      delete tombs[loc.id]; // sửa sau khi xóa: giữ lại và đẩy lên
      items.push(loc);
      toPush.push(loc);
      continue;
    }

    const cl = cloudLive.get(loc.id);
    if (!cl) {
      items.push(loc);
      toPush.push(loc); // Cloud chưa có mục này
      continue;
    }
    const clMs = toMs(cl.updatedAt);
    if (clMs > locMs) {
      items.push(adoptCloud(cl, loc));
    } else {
      items.push(loc);
      if (locMs > clMs) toPush.push(loc);
    }
  }

  const fresh: T[] = [];
  for (const [id, cl] of cloudLive) {
    if (localIds.has(id)) continue;
    const tombMs = toMs(tombs[id]);
    if (tombMs > 0 && tombMs >= toMs(cl.updatedAt)) continue; // mình vừa xóa, Cloud chưa kịp nhận
    if (tombMs > 0) delete tombs[id];
    fresh.push(adoptCloud(cl));
  }
  const merged = [...fresh, ...items];

  const tombsToPush = Object.keys(tombs).some(
    (id) => !cloudTombs[id] || toMs(cloudTombs[id]) < toMs(tombs[id]),
  );
  const changed =
    JSON.stringify(merged) !== JSON.stringify(local) ||
    JSON.stringify(tombs) !== JSON.stringify(localTombs);

  return { items: merged, tombs, toPush, tombsToPush, changed };
}
