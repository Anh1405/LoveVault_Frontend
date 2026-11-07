// src/components/home/RedesignedAlbumSection.tsx
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { ThemeColors, METRICS } from '../../constants/theme';
import { AlbumMediaWithCategory } from '../../screens/HomeScreen';

const GRID_GAP = 12;

interface RedesignedAlbumSectionProps {
  colors: ThemeColors;
  mediaList: AlbumMediaWithCategory[];
  categories: string[];
  selectedCategory: string;
  mediaFilter: 'ALL' | 'IMAGE' | 'VIDEO';
  uploading: boolean;
  onSelectCategory: (cat: string) => void;
  onChangeFilter: (filter: 'ALL' | 'IMAGE' | 'VIDEO') => void;
  onCreateCategory: () => void;
  onPickMedia: (type: 'IMAGE' | 'VIDEO') => void;
  onOpenMedia: (item: AlbumMediaWithCategory) => void;
  onDeleteCategory: (cat: string) => void;
}

export const RedesignedAlbumSection: React.FC<RedesignedAlbumSectionProps> = ({
  colors,
  mediaList,
  categories,
  selectedCategory,
  mediaFilter,
  uploading,
  onSelectCategory,
  onChangeFilter,
  onCreateCategory,
  onPickMedia,
  onOpenMedia,
  onDeleteCategory,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'FOLDERS' | 'GRID'>('GRID');

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0) {
      setMeasuredWidth((prev) => (Math.abs(prev - w) <= 1 ? prev : w));
    }
  }, []);

  // Tính toán chiều rộng thực tế của vùng chứa (hỗ trợ cả điện thoại nhỏ, xoay ngang và Tablet/Web)
  const fallbackWidth = Math.min(680, windowWidth) - METRICS.paddingHorizontal * 2;
  const effectiveWidth = measuredWidth > 0 ? measuredWidth : Math.max(260, fallbackWidth);

  // Tự động chia 3 cột khi vùng hiển thị >= 520px (Tablet / Landscape / Web), 2 cột trên điện thoại
  const numColumns = effectiveWidth >= 520 ? 3 : 2;
  const gridItemWidth = Math.floor(
    (effectiveWidth - GRID_GAP * (numColumns - 1)) / numColumns,
  );
  const folderCoverHeight = Math.max(96, Math.round(gridItemWidth * 0.68));

  const filteredMedia = useMemo(() => {
    return mediaList.filter((m) => {
      const matchType = mediaFilter === 'ALL' ? true : m.mediaType === mediaFilter;
      const matchCat =
        selectedCategory === 'ALL'
          ? true
          : selectedCategory === 'UNCATEGORIZED'
            ? !m.albumCategory
            : m.albumCategory === selectedCategory;
      return matchType && matchCat;
    });
  }, [mediaList, mediaFilter, selectedCategory]);

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {/* HEADER & CHUYỂN CHẾ ĐỘ XEM */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Album kỷ niệm
          </Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            {filteredMedia.length} khoảnh khắc đã lưu giữ
          </Text>
        </View>

        <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceVariant }]}>
          <Pressable
            style={[
              styles.segmentBtn,
              viewMode === 'GRID' && [styles.segmentActive, { backgroundColor: colors.surface }],
            ]}
            onPress={() => setViewMode('GRID')}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: viewMode === 'GRID' ? colors.primary : colors.textSecondary,
              }}
            >
              🖼️ Tất cả
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.segmentBtn,
              viewMode === 'FOLDERS' && [styles.segmentActive, { backgroundColor: colors.surface }],
            ]}
            onPress={() => setViewMode('FOLDERS')}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: viewMode === 'FOLDERS' ? colors.primary : colors.textSecondary,
              }}
            >
              📁 Bộ sưu tập
            </Text>
          </Pressable>
        </View>
      </View>

      {/* THANH THAO TÁC TẢI NHANH */}
      <View style={styles.actionToolBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          <Pressable
            style={[styles.quickAddPill, { backgroundColor: colors.primary }]}
            onPress={() => onPickMedia('IMAGE')}
            disabled={uploading}
          >
            <Text style={styles.quickAddPillText}>
              {uploading ? 'Đang tải...' : '📸 + Ảnh mới'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.quickAddPill, { backgroundColor: colors.primaryContainer }]}
            onPress={() => onPickMedia('VIDEO')}
            disabled={uploading}
          >
            <Text style={[styles.quickAddPillText, { color: colors.onPrimaryContainer }]}>
              🎬 + Video
            </Text>
          </Pressable>

          <Pressable
            style={[styles.quickAddPill, { backgroundColor: colors.surfaceVariant }]}
            onPress={onCreateCategory}
          >
            <Text style={[styles.quickAddPillText, { color: colors.textPrimary }]}>
              📁 + Tạo Album
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* VIEW MODE 1: XEM THEO DANH SÁCH BỘ SƯU TẬP (FOLDERS) */}
      {viewMode === 'FOLDERS' ? (
        <View style={styles.folderGrid}>
          <Pressable
            style={[
              styles.folderCard,
              {
                width: gridItemWidth,
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
              },
            ]}
            onPress={() => {
              onSelectCategory('ALL');
              setViewMode('GRID');
            }}
          >
            <View
              style={[
                styles.folderCoverStack,
                { height: folderCoverHeight, backgroundColor: colors.surfaceVariant },
              ]}
            >
              <Text style={{ fontSize: 28 }}>🗂️</Text>
            </View>
            <Text style={[styles.folderTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              Tất cả ảnh & video
            </Text>
            <Text style={[styles.folderCount, { color: colors.textSecondary }]}>
              {mediaList.length} mục
            </Text>
          </Pressable>

          {categories.map((cat) => {
            const itemsInCat = mediaList.filter((m) => m.albumCategory === cat);
            const coverImage = itemsInCat[0]?.remoteUrl || itemsInCat[0]?.uri;

            return (
              <Pressable
                key={cat}
                style={[
                  styles.folderCard,
                  {
                    width: gridItemWidth,
                    backgroundColor: colors.surface,
                    borderColor: colors.borderSubtle,
                  },
                ]}
                onPress={() => {
                  onSelectCategory(cat);
                  setViewMode('GRID');
                }}
                onLongPress={() => onDeleteCategory(cat)}
              >
                <View
                  style={[
                    styles.folderCoverStack,
                    { height: folderCoverHeight, backgroundColor: colors.surfaceVariant },
                  ]}
                >
                  {coverImage ? (
                    <ExpoImage
                      source={{ uri: coverImage }}
                      style={styles.folderCoverImg}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={{ fontSize: 28 }}>📁</Text>
                  )}
                </View>
                <Text style={[styles.folderTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {cat}
                </Text>
                <Text style={[styles.folderCount, { color: colors.textSecondary }]}>
                  {itemsInCat.length} tệp
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        /* VIEW MODE 2: LƯỚI ẢNH BỘ SƯU TẬP (GRID VIEW) */
        <View>
          {/* FILTER FORMAT BAR */}
          <View style={styles.filterChipRow}>
            {(
              [
                { key: 'ALL', label: 'Tất cả' },
                { key: 'IMAGE', label: '🖼️ Ảnh' },
                { key: 'VIDEO', label: '🎥 Video' },
              ] as const
            ).map((f) => {
              const active = mediaFilter === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? colors.textPrimary : colors.surface,
                      borderColor: active ? colors.textPrimary : colors.borderSubtle,
                    },
                  ]}
                  onPress={() => onChangeFilter(f.key)}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: active ? colors.surface : colors.textSecondary,
                    }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}

            {selectedCategory !== 'ALL' && (
              <Pressable
                style={[styles.activeFolderTag, { backgroundColor: colors.primaryContainer }]}
                onPress={() => onSelectCategory('ALL')}
              >
                <Text
                  style={{ fontSize: 11, fontWeight: '700', color: colors.onPrimaryContainer }}
                  numberOfLines={1}
                >
                  📁 {selectedCategory} ✕
                </Text>
              </Pressable>
            )}
          </View>

          {/* GRID MEDIA ITEMS */}
          <View style={styles.mediaGrid}>
            {filteredMedia.map((item) => (
              <Pressable
                key={item.id}
                style={[
                  styles.mediaCard,
                  {
                    width: gridItemWidth,
                    height: Math.round(gridItemWidth * 1.15),
                    backgroundColor: colors.surfaceVariant,
                  },
                ]}
                onPress={() => onOpenMedia(item)}
              >
                <ExpoImage
                  source={{ uri: item.thumbnailUri || item.remoteUrl || item.uri }}
                  style={styles.mediaImage}
                  contentFit="cover"
                  transition={150}
                />

                {item.mediaType === 'VIDEO' && (
                  <View style={styles.videoBadge}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>▶ VIDEO</Text>
                  </View>
                )}

                <View style={styles.cardGradientFooter}>
                  <Text style={styles.cardCaptionText} numberOfLines={1}>
                    {item.caption}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 20, width: '100%' },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subTitle: { fontSize: 12, marginTop: 2 },
  segmentedControl: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
  },
  segmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  segmentActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionToolBar: { marginBottom: 14 },
  quickAddPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAddPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  folderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  folderCard: {
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
  },
  folderCoverStack: {
    width: '100%',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  folderCoverImg: { width: '100%', height: '100%' },
  folderTitle: { fontSize: 13, fontWeight: '700' },
  folderCount: { fontSize: 11, marginTop: 2 },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  activeFolderTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    maxWidth: '100%',
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  mediaCard: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaImage: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardGradientFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  cardCaptionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
});