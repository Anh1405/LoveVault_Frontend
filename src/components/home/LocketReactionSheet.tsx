// src/components/home/LocketReactionSheet.tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ListRenderItemInfo,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../constants/theme';
import {
  LocketSnapView,
  ReactionRun,
  buildReactionRuns,
  canDeleteSnap,
  getReactionLabel,
  summarizeReactions,
} from './locketReactions';

const DANGER = '#D92D20';

interface LocketReactionSheetProps {
  visible: boolean;
  snap: LocketSnapView | null;
  colors: ThemeColors;
  onClose: () => void;
  /** Mã người đang dùng app. Nút xóa chỉ hiện khi trùng với ownerId của ảnh. */
  viewerId?: string | null;
  /** Gọi khi chủ ảnh xác nhận xóa. Không truyền thì sheet không có nút xóa. */
  onDeleteSnap?: (snapId: string) => Promise<void> | void;
}

const keyExtractor = (item: ReactionRun) => item.key;

export const LocketReactionSheet: React.FC<LocketReactionSheetProps> = ({
  visible,
  snap,
  colors,
  onClose,
  viewerId,
  onDeleteSnap,
}) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLargeScreen = screenWidth >= 600;

  const [isDeleting, setIsDeleting] = useState(false);

  const lastSnapRef = useRef<LocketSnapView | null>(null);
  if (snap) lastSnapRef.current = snap;
  const shown = snap ?? lastSnapRef.current;

  const reactions = shown?.reactions;
  const total = reactions?.length ?? 0;
  const summary = useMemo(
    () => (reactions ? summarizeReactions(reactions) : []),
    [reactions, total],
  );
  const runs = useMemo(() => (reactions ? buildReactionRuns(reactions) : []), [reactions, total]);
  const maxCount = summary.reduce((max, item) => Math.max(max, item.count), 1);

  const canDelete = Boolean(onDeleteSnap) && canDeleteSnap(shown, viewerId);

  const performDelete = useCallback(
    async (snapId: string) => {
      if (!onDeleteSnap) return;
      setIsDeleting(true);
      try {
        await onDeleteSnap(snapId);
        onClose();
      } catch {
        if (Platform.OS === 'web') {
          window.alert('Chưa xóa được ảnh. Hãy kiểm tra kết nối mạng rồi thử lại.');
        } else {
          Alert.alert('Chưa xóa được ảnh', 'Hãy kiểm tra kết nối mạng rồi thử lại.');
        }
      } finally {
        setIsDeleting(false);
      }
    },
    [onDeleteSnap, onClose],
  );

  const handleDelete = useCallback(() => {
    if (!shown || !onDeleteSnap || isDeleting) return;
    if (!canDeleteSnap(shown, viewerId)) return;

    const snapId = shown.id;

    if (Platform.OS === 'web') {
      const ok = window.confirm(
        'Xóa ảnh này?\nẢnh sẽ bị xóa khỏi nhật ký Locket và không khôi phục được.',
      );
      if (ok) void performDelete(snapId);
      return;
    }

    Alert.alert('Xóa ảnh này?', 'Ảnh sẽ bị xóa khỏi nhật ký Locket và không khôi phục được.', [
      { text: 'Giữ lại', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => void performDelete(snapId),
      },
    ]);
  }, [shown, onDeleteSnap, viewerId, isDeleting, performDelete]);

  const renderRun = useCallback(
    ({ item, index }: ListRenderItemInfo<ReactionRun>) => (
      <View style={[styles.runRow, { borderBottomColor: colors.borderSubtle }]}>
        <Text style={styles.runEmoji}>{item.emoji}</Text>
        <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary }}>
          {item.count > 1 ? `Thả ${item.count} lần liên tiếp` : 'Thả 1 lần'}
        </Text>
        {index === 0 && (
          <View style={[styles.newestPill, { backgroundColor: colors.primaryContainer }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.onPrimaryContainer }}>
              Mới nhất
            </Text>
          </View>
        )}
      </View>
    ),
    [colors],
  );

  const header = (
    <View>
      <View style={styles.headerRow}>
        {shown ? <Image source={{ uri: shown.uri }} style={styles.thumb} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            Cảm xúc trên ảnh của {shown?.senderName}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
            {total} lượt thả
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng chi tiết cảm xúc"
          onPress={onClose}
          style={styles.closeBtn}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>Đóng</Text>
        </Pressable>
      </View>

      {summary.map((item) => {
        const ratio = item.count / maxCount;
        return (
          <View key={item.emoji} style={styles.breakRow}>
            <Text style={styles.breakEmoji}>{item.emoji}</Text>
            <View style={{ flex: 1 }}>
              <View style={styles.breakTextRow}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
                  {getReactionLabel(item.emoji)}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                  {item.count}
                </Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: colors.surfaceVariant }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.max(6, Math.round(ratio * 100))}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Gần đây nhất</Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          isLargeScreen && { justifyContent: 'center', padding: 16 },
        ]}
      >
        <Pressable
          accessibilityLabel="Đóng chi tiết cảm xúc"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }]}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              maxHeight: Math.round(screenHeight * 0.82),
              paddingBottom: isLargeScreen ? 16 : Math.max(insets.bottom, 12),
              borderBottomLeftRadius: isLargeScreen ? 22 : 0,
              borderBottomRightRadius: isLargeScreen ? 22 : 0,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.borderSubtle }]} />
          <FlatList
            data={runs}
            keyExtractor={keyExtractor}
            renderItem={renderRun}
            ListHeaderComponent={header}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            style={styles.list}
          />

          {canDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xóa ảnh này"
              accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
              disabled={isDeleting}
              onPress={handleDelete}
              style={({ pressed }) => [
                styles.deleteBtn,
                { borderColor: DANGER },
                (pressed || isDeleting) && styles.deleteBtnPressed,
              ]}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={DANGER} />
              ) : (
                <Text style={[styles.deleteText, { color: DANGER }]}>Xóa ảnh này</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  list: { flexGrow: 0 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  thumb: { width: 46, height: 46, borderRadius: 10, backgroundColor: '#0F172A' },
  title: { fontSize: 15, fontWeight: '700' },
  closeBtn: {
    minWidth: 48,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 46,
  },
  breakEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
  breakTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 4,
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  runEmoji: { fontSize: 20, width: 32, textAlign: 'center' },
  newestPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  deleteBtn: {
    minHeight: 48,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnPressed: { opacity: 0.6 },
  deleteText: { fontSize: 14, fontWeight: '700' },
});