// src/components/home/LocketSnapCard.tsx
import React, { memo, useMemo } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { ThemeColors } from '../../constants/theme';
import {
  LOCKET_REACTION_EMOJIS,
  LocketSnapView,
  canDeleteSnap,
  formatReactionCount,
  getReactionLabel,
  summarizeReactions,
} from './locketReactions';

const MAX_VISIBLE_CHIPS = 4;

interface LocketSnapCardProps {
  snap: LocketSnapView;
  colors: ThemeColors;
  /** Mã người đang dùng app (Bắt buộc truyền prop này từ màn hình cha). Nút Xóa chỉ hiện khi trùng với snap.ownerId. */
  viewerId: string | null | undefined;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onOpenReactions: (id: string) => void;
}

const LocketSnapCardInner: React.FC<LocketSnapCardProps> = ({
  snap,
  colors,
  viewerId,
  onDelete,
  onReact,
  onOpenReactions,
}) => {
  const total = snap.reactions.length;
  const canDelete = canDeleteSnap(snap, viewerId);
  // total nằm trong deps để vẫn cập nhật nếu hook push thẳng vào mảng cũ
  const summary = useMemo(() => summarizeReactions(snap.reactions), [snap.reactions, total]);
  const visibleChips = summary.slice(0, MAX_VISIBLE_CHIPS);
  const hiddenKinds = summary.length - visibleChips.length;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
      ]}
    >
      {/* HEADER: NGƯỜI ĐĂNG + TRẠNG THÁI */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.senderBadge, { backgroundColor: colors.primaryContainer }]}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.onPrimaryContainer }}>
              {snap.senderName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text
                style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 }}
                numberOfLines={1}
              >
                {snap.senderName}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: colors.primaryContainer }]}>
                <Text
                  style={{ fontSize: 11, fontWeight: '700', color: colors.onPrimaryContainer }}
                  numberOfLines={1}
                >
                  {snap.stampBadge || 'Đang hoạt động'}
                </Text>
              </View>
            </View>
            {Boolean(snap.createdAtTime) && (
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                {snap.createdAtTime}
              </Text>
            )}
          </View>
        </View>

        {canDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xóa ảnh Locket này"
            onPress={() => {
              if (canDeleteSnap(snap, viewerId)) onDelete(snap.id);
            }}
            hitSlop={12}
            style={styles.deleteBtn}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.error }}>Xóa</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ẢNH VUÔNG 1:1 */}
      <View style={styles.imageWrap}>
        <Image source={{ uri: snap.uri }} style={styles.image} />

        {Boolean(snap.stampBadge) && (
          <View style={styles.overlayStamp}>
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
              📌 {snap.stampBadge}
            </Text>
          </View>
        )}

        {Boolean(snap.caption) && (
          <View style={styles.overlayCaptionBar}>
            <Text style={styles.overlayCaptionText}>{snap.caption}</Text>
          </View>
        )}
      </View>

      {Boolean(snap.caption) && (
        <Text
          style={{
            fontSize: 13,
            fontWeight: '500',
            color: colors.textPrimary,
            marginTop: 10,
            paddingHorizontal: 4,
          }}
        >
          "{snap.caption}"
        </Text>
      )}

      {/* KHỐI CẢM XÚC: TÓM TẮT (MỚI NHẤT TRƯỚC) + HÀNG THẢ NHANH */}
      <View style={[styles.reactionPanel, { backgroundColor: colors.surfaceVariant }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            total === 0 ? 'Chưa có cảm xúc nào' : `${total} lượt cảm xúc, mở chi tiết`
          }
          disabled={total === 0}
          onPress={() => onOpenReactions(snap.id)}
          style={styles.summaryRow}
        >
          {total === 0 ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>Chưa có cảm xúc nào</Text>
          ) : (
            <>
              <View style={styles.chipRow}>
                {visibleChips.map((item, idx) => {
                  const isNewest = idx === 0;
                  return (
                    <View
                      key={item.emoji}
                      style={[
                        styles.chip,
                        { backgroundColor: isNewest ? colors.primaryContainer : colors.surface },
                      ]}
                    >
                      <Text style={{ fontSize: 13 }}>{item.emoji}</Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: isNewest ? colors.onPrimaryContainer : colors.textPrimary,
                        }}
                      >
                        {formatReactionCount(item.count)}
                      </Text>
                    </View>
                  );
                })}
                {hiddenKinds > 0 && (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>
                    +{hiddenKinds}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                Chi tiết
              </Text>
            </>
          )}
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

        <View style={styles.reactRow}>
          {LOCKET_REACTION_EMOJIS.map((em) => (
            <Pressable
              key={em}
              accessibilityRole="button"
              accessibilityLabel={`Thả cảm xúc ${getReactionLabel(em).toLowerCase()}`}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => onReact(snap.id, em)}
              style={({ pressed }) => [
                styles.reactBtn,
                pressed && { backgroundColor: colors.surface, transform: [{ scale: 0.86 }] },
              ]}
            >
              <Text style={styles.reactEmoji}>{em}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
};

export const LocketSnapCard = memo(LocketSnapCardInner);

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  deleteBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  senderBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 1,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    justifyContent: 'space-between',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlayStamp: {
    alignSelf: 'flex-start',
    margin: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    zIndex: 10,
    elevation: 5,
  },
  overlayCaptionBar: {
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    zIndex: 10,
    elevation: 5,
  },
  overlayCaptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  reactionPanel: {
    borderRadius: 14,
    marginTop: 10,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 6,
  },
  summaryRow: {
    minHeight: 40,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chipRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  reactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reactBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactEmoji: { fontSize: 20 },
});