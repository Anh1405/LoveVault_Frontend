// src/components/home/locketReactions.ts

export const LOCKET_REACTION_EMOJIS = ['❤️', '😍', '😂', '🔥', '🥺', '😡'] as const;

/** Dạng tối thiểu của một ảnh Locket mà thẻ ảnh và bảng chi tiết cần. */
export interface LocketSnapView {
  id: string;
  /**
   * Mã người đăng ảnh (Bắt buộc). Phải điền khi tạo ảnh mới hoặc map dữ liệu từ store.
   */
  ownerId: string;
  uri: string;
  senderName: string;
  stampBadge?: string;
  createdAtTime?: string;
  caption?: string;
  /** Thứ tự thả cảm xúc, phần tử cuối là lượt mới nhất. */
  reactions: string[];
}

/**
 * Chỉ người đăng ảnh mới được xóa.
 * Chuẩn hóa chuỗi (String + trim) để tránh lỗi lệch kiểu dữ liệu hoặc dư khoảng trắng.
 */
export function canDeleteSnap(
  snap: Pick<LocketSnapView, 'ownerId'> | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  const owner = snap?.ownerId ? String(snap.ownerId).trim() : '';
  const viewer = viewerId ? String(viewerId).trim() : '';
  if (!owner || !viewer) return false;
  return owner === viewer;
}

/** Tự động điều chỉnh số chip cảm xúc hiển thị trên thanh tóm tắt tùy độ rộng màn hình */
export function getResponsiveMaxVisibleChips(screenWidth: number): number {
  if (screenWidth < 350) return 3;
  if (screenWidth >= 520) return 6;
  return 4;
}

/** Bỏ ký tự chọn biến thể emoji (U+FE0F) để "❤" và "❤️" được tính là một. */
export const normalizeEmoji = (emoji: unknown): string =>
  toEmojiString(emoji).replace(/\uFE0F/g, '');

/**
 * Ép một phần tử reaction bất kỳ về chuỗi emoji.
 * Chấp nhận chuỗi, hoặc object dạng { emoji } từ server / cache cũ; mọi thứ khác thành ''.
 */
export function toEmojiString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const candidate = (value as { emoji?: unknown }).emoji;
    if (typeof candidate === 'string') return candidate;
  }
  return '';
}

const REACTION_LABELS: Record<string, string> = {
  '❤': 'Yêu thích',
  '😍': 'Mê tít',
  '😂': 'Buồn cười',
  '🔥': 'Quá đỉnh',
  '🥺': 'Cảm động',
  '😡': 'Tức giận',
};

export const getReactionLabel = (emoji: unknown): string =>
  REACTION_LABELS[normalizeEmoji(emoji)] ?? 'Cảm xúc khác';

export const formatReactionCount = (count: number): string =>
  count > 99 ? '99+' : String(count);

export interface ReactionSummaryItem {
  emoji: string;
  count: number;
  /** Vị trí lượt thả gần nhất trong mảng reactions. */
  lastIndex: number;
}

/**
 * Gom theo loại cảm xúc, loại nào vừa được thả gần đây nhất đứng đầu.
 * Tối đa 6 loại nên thanh tóm tắt không bao giờ tràn, dù có hàng trăm lượt thả.
 */
export function summarizeReactions(reactions: readonly unknown[]): ReactionSummaryItem[] {
  const byKey = new Map<string, ReactionSummaryItem>();
  (Array.isArray(reactions) ? reactions : []).forEach((raw, index) => {
    const emoji = toEmojiString(raw);
    if (!emoji) return;
    const key = normalizeEmoji(emoji);
    const prev = byKey.get(key);
    if (prev) {
      prev.count += 1;
      prev.lastIndex = index;
      prev.emoji = emoji;
    } else {
      byKey.set(key, { emoji, count: 1, lastIndex: index });
    }
  });
  return Array.from(byKey.values()).sort((a, b) => b.lastIndex - a.lastIndex);
}

export interface ReactionRun {
  key: string;
  emoji: string;
  /** Số lượt thả liên tiếp cùng một loại. */
  count: number;
}

/** Lịch sử mới nhất trước, các lượt thả liên tiếp cùng loại gộp thành một dòng. */
export function buildReactionRuns(reactions: readonly unknown[]): ReactionRun[] {
  const runs: ReactionRun[] = [];
  const list = Array.isArray(reactions) ? reactions : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const emoji = toEmojiString(list[i]);
    if (!emoji) continue;
    const last = runs[runs.length - 1];
    if (last && normalizeEmoji(last.emoji) === normalizeEmoji(emoji)) {
      last.count += 1;
    } else {
      runs.push({ key: `run_${i}`, emoji, count: 1 });
    }
  }
  return runs;
}