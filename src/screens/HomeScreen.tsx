// src/screens/HomeScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RedesignedAlbumSection } from '../components/home/RedesignedAlbumSection';
import { DatePlanTicketCard } from '../components/home/DatePlanTicketCard';
import { useRealtimeDailyQA } from '../hooks/useRealtimeDailyQA';
import { DailyQASection } from '../components/home/DailyQASection';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Platform,
  RefreshControl,
  Alert,
  FlatList,
  Image,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  LayoutChangeEvent,
  useColorScheme,
  useWindowDimensions,
  Linking,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { storage } from '../services/storage';
import {
  flushPendingCloudMediaQueue,
  fetchCloudWorkspaceMedia,
  deleteCloudMediaById,
} from '../services/cloudMediaService';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getThemeColors, METRICS, ThemeColors } from '../constants/theme';
import { LocketCameraCard, LocketStampItem } from '../components/home/LocketCameraCard';
import { LocketSnapCard } from '../components/home/LocketSnapCard';
import { LocketReactionSheet } from '../components/home/LocketReactionSheet';
import type { LocketSnapView } from '../components/home/locketReactions';
import {
  useCoupleWorkspace,
  ImportantEvent,
  CoupleGoalItem,
  CoupleMediaItem,
  QuestionCategory,
  computeDaysUntilNextOccurrence,
  parseMomoTransactionText,
  openAddressInGoogleMaps,
} from '../hooks/useCoupleWorkspace';
import { CoupleHeroCard } from '../components/home/CoupleHeroCard';
import {
  ProfileModal,
  SettingsModal,
  EventAndGoalFormModal,
  DATE_ACTIVITY_OPTIONS,
  TRANSPORT_OPTIONS,
} from '../components/home/ModalsAndSheets';

type DashboardSection = 'EVENTS' | 'GOALS' | 'DAILY_QA' | 'MEDIA';

export type AlbumMediaWithCategory = CoupleMediaItem & {
  albumCategory?: string;
};

const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

const getAnniversaryCacheKey = (coupleId?: string | null, userId?: string | null) =>
  `lovevault_anniversary_override_v2_${coupleId || userId || 'guest'}`;

const ALBUM_CATEGORIES_STORAGE_KEY = (coupleId?: string | null, userId?: string | null) =>
  `lovevault_album_categories_v1_${coupleId || userId || 'guest'}`;

const ALBUM_ITEM_CATEGORY_MAP_KEY = (coupleId?: string | null, userId?: string | null) =>
  `lovevault_album_item_cat_map_v1_${coupleId || userId || 'guest'}`;

const COUPLE_LOCKET_STAMPS: LocketStampItem[] = [
  { id: '1', icon: '💕', label: 'Đang nhớ đằng ấy' },
  { id: '2', icon: '🍕', label: 'Báo cáo bữa ăn' },
  { id: '3', icon: '👀', label: 'Góc nhìn hiện tại' },
  { id: '4', icon: '🧋', label: 'Thèm trà sữa' },
  { id: '5', icon: '💻', label: 'Đang làm việc' },
  { id: '6', icon: '😴', label: 'Chuẩn bị đi ngủ' },
];

const PAGE_LABELS = ['Locket', 'Không gian'] as const;
const PAGE_SWITCH_PADDING = 3;

const locketSnapKeyExtractor = (snap: { id: string }) => snap.id;

// Web: MediaLibrary và FileSystem không dùng được, nên tải qua blob + thẻ <a download>
const downloadMediaOnWeb = async (mediaItem: CoupleMediaItem) => {
  const url = mediaItem.remoteUrl || mediaItem.uri;
  const ext = mediaItem.mediaType === 'VIDEO' ? 'mp4' : 'jpg';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `lovevault_${Date.now()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  } catch (error) {
    console.warn('Tải trực tiếp thất bại (thường do CORS), mở tab mới:', error);
    window.open(url, '_blank', 'noopener');
  }
};

const handleDownloadMedia = async (mediaItem: CoupleMediaItem) => {
  if (Platform.OS === 'web') {
    await downloadMediaOnWeb(mediaItem);
    return;
  }
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') {
      Alert.alert(
        'Quyền truy cập bị từ chối',
        'Vui lòng cấp quyền truy cập Thư viện ảnh trong Cài đặt hệ thống để lưu tệp.',
      );
      return;
    }

    let targetUri = mediaItem.remoteUrl || mediaItem.uri;

    if (targetUri.startsWith('http://') || targetUri.startsWith('https://')) {
      const ext = mediaItem.mediaType === 'VIDEO' ? 'mp4' : 'jpg';
      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      const fileUri = `${baseDir}lovevault_media_${Date.now()}.${ext}`;
      const downloadRes = await FileSystem.downloadAsync(targetUri, fileUri);
      targetUri = downloadRes.uri;
    }

    await MediaLibrary.createAssetAsync(targetUri);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Thành công', 'Đã lưu ảnh/video vào bộ sưu tập của bạn!');
  } catch (error: any) {
    console.error('Lỗi khi tải về:', error);
    Alert.alert('Không thể lưu tệp', 'Có lỗi xảy ra khi lưu tệp về thiết bị. Hãy thử lại.');
  }
};

const InlineVideoPlayer: React.FC<{ uri: string }> = ({ uri }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.inlineVideoBox}
      nativeControls
      contentFit="contain"
      allowsFullscreen
    />
  );
};


export const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const systemScheme = useColorScheme();
  const queryClient = useQueryClient();
  const { logout, coupleId, user, syncCoupleStatusFromServer } = useAuthStore();
  const currentUserId = user?.id || null;

  const {
    themePreset,
    colorMode,
    myProfile,
    partnerProfile,
    isAppLocked,
    hydrateSettings,
    pullSharedRoomSettingsFromServer,
    heroWallpaperUri,
    loveCoupons,
    streakDays,
    heartTapTotal,
    membersById,
    unlockAppWithPin,
    recordInteractionStreak,
    momoFund,
    recordMomoContribution,
  } = useSettingsStore();

  const anniversaryCacheKey = React.useMemo(
    () => getAnniversaryCacheKey(coupleId, currentUserId),
    [coupleId, currentUserId],
  );

  const albumCategoriesKey = React.useMemo(
    () => ALBUM_CATEGORIES_STORAGE_KEY(coupleId, currentUserId),
    [coupleId, currentUserId],
  );

  const itemCategoryMapKey = React.useMemo(
    () => ALBUM_ITEM_CATEGORY_MAP_KEY(coupleId, currentUserId),
    [coupleId, currentUserId],
  );

  const isMomoFundEnabled = (momoFund as any)?.enabled !== false;

  const isDark =
    colorMode === 'DARK' || (colorMode === 'SYSTEM' && systemScheme === 'dark');
  const colors = React.useMemo(
    () => getThemeColors(themePreset, isDark),
    [themePreset, isDark],
  );

  const {
    events,
    goals,
    mediaList,
    locketSnaps,
    uploadingMedia,
    dailyQA,
    qaFilter,
    qaHistory,
    saveEvent,
    deleteEvent,
    saveGoal,
    toggleGoalCompletion,
    deleteGoal,
    pickAndSaveMedia,
    deleteMedia,
    captureCoupleLocket,
    reactToLocketSnap,
    deleteLocketSnap,
    submitDailyAnswer,
    rollRandomQuestion,
    retryPendingSync,
    saveCapturedLocketUri,
    forceTestGeminiOnEvent,
    recordGoalMomoTransaction,
    restoreWorkspaceBackup,
  } = useCoupleWorkspace();
  const {
    activeQA,
    qaFilter,
    qaHistory,
    socketConnected,
    partnerTypingName,
    totalQuestionsCount,
    completedBothCount,
    notifyTyping,
    submitAnswer,
    rollQuestion,
    selectQuestionFromHistory,
    refreshQa,
  } = useRealtimeDailyQA();
  // State quản lý Danh mục Album (Folders)
  const [albumCategories, setAlbumCategories] = useState<string[]>([
    'Kỷ niệm hẹn hò',
    'Du lịch cùng nhau',
    'Ẩm thực & Trà sữa',
  ]);
  const [itemCategoryMap, setItemCategoryMap] = useState<Record<string, string>>({});
  const [selectedAlbumCategory, setSelectedAlbumCategory] = useState<string>('ALL');
  const [createCategoryModalVisible, setCreateCategoryModalVisible] = useState(false);
  const [newCategoryNameInput, setNewCategoryNameInput] = useState('');
  const pendingTargetCategoryRef = useRef<string | null>(null);

  useEffect(() => {
    storage.getItem(albumCategoriesKey).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAlbumCategories(parsed);
        }
      } catch {}
    });
    storage.getItem(itemCategoryMapKey).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setItemCategoryMap(parsed);
        }
      } catch {}
    });
  }, [albumCategoriesKey, itemCategoryMapKey]);

  const saveAlbumCategoriesList = useCallback(
    async (nextList: string[]) => {
      setAlbumCategories(nextList);
      await storage.setItem(albumCategoriesKey, JSON.stringify(nextList));
    },
    [albumCategoriesKey],
  );

  const assignMediaToCategory = useCallback(
    async (mediaId: string, categoryName: string, remoteUrl?: string) => {
      setItemCategoryMap((prev) => {
        const next = { ...prev };
        if (!categoryName || categoryName === 'ALL') {
          delete next[mediaId];
          if (remoteUrl) delete next[remoteUrl];
        } else {
          next[mediaId] = categoryName;
          if (remoteUrl) next[remoteUrl] = categoryName;
        }
        void storage.setItem(itemCategoryMapKey, JSON.stringify(next));
        return next;
      });
    },
    [itemCategoryMapKey],
  );

  const handleCreateAlbumCategory = useCallback(async () => {
    const trimmed = newCategoryNameInput.trim();
    if (!trimmed) {
      Alert.alert('Thiếu tên danh mục', 'Vui lòng nhập tên danh mục bạn muốn tạo.');
      return;
    }
    if (albumCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Đã tồn tại', 'Danh mục này đã có trong Album của bạn.');
      return;
    }
    const next = [...albumCategories, trimmed];
    await saveAlbumCategoriesList(next);
    setSelectedAlbumCategory(trimmed);
    setNewCategoryNameInput('');
    setCreateCategoryModalVisible(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newCategoryNameInput, albumCategories, saveAlbumCategoriesList]);

  const handleDeleteAlbumCategory = useCallback(
    (categoryName: string) => {
      Alert.alert(
        'Xóa danh mục',
        `Bạn muốn xóa danh mục "${categoryName}"? (Các ảnh bên trong sẽ không bị mất mà chuyển về mục Tất cả).`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Xóa danh mục',
            style: 'destructive',
            onPress: async () => {
              const next = albumCategories.filter((c) => c !== categoryName);
              await saveAlbumCategoriesList(next);
              if (selectedAlbumCategory === categoryName) {
                setSelectedAlbumCategory('ALL');
              }
            },
          },
        ],
      );
    },
    [albumCategories, selectedAlbumCategory, saveAlbumCategoriesList],
  );

  // Đồng bộ Cloud Object Storage (S3/R2) & PostgreSQL qua useQuery
  const {
    data: cloudMediaPayload,
    refetch: refetchCloudMedia,
  } = useQuery({
    queryKey: ['cloudWorkspaceMedia', coupleId, currentUserId],
    enabled: Boolean(coupleId),
    queryFn: async () => {
      await flushPendingCloudMediaQueue().catch(() => null);
      return fetchCloudWorkspaceMedia(150);
    },
    staleTime: 1000 * 30,
    retry: 2,
  });

  // Tự động đồng bộ thêm tên danh mục từ Cloud nếu đối phương có tạo danh mục mới trên trường stamp
  useEffect(() => {
    const cloudAlbum = cloudMediaPayload?.albumMedia;
    if (!Array.isArray(cloudAlbum) || cloudAlbum.length === 0) return;
    const discoveredCategories = new Set(albumCategories);
    let hasNew = false;
    for (const m of cloudAlbum) {
      if (
        m.stamp &&
        m.caption !== 'thumbnail' &&
        m.caption !== 'Hero Wallpaper' &&
        !discoveredCategories.has(m.stamp)
      ) {
        discoveredCategories.add(m.stamp);
        hasNew = true;
      }
    }
    if (hasNew) {
      void saveAlbumCategoriesList(Array.from(discoveredCategories));
    }
  }, [cloudMediaPayload?.albumMedia, albumCategories, saveAlbumCategoriesList]);

  // Gộp dữ liệu từ Cloud Server (PostgreSQL + S3/R2) với dữ liệu Local trên thiết bị
  // ĐÃ LỌC BỎ 'thumbnail' VÀ 'Hero Wallpaper' ĐỂ ẢNH NỀN KHÔNG BỊ TRỘN VÀO ALBUM
  const mergedMediaList = React.useMemo<AlbumMediaWithCategory[]>(() => {
    const cloudItems: AlbumMediaWithCategory[] = (cloudMediaPayload?.albumMedia || [])
      .filter((m) => m.caption !== 'thumbnail' && m.caption !== 'Hero Wallpaper')
      .map((m) => ({
        id: m.id,
        uri: m.remoteUrl,
        remoteUrl: m.remoteUrl,
        thumbnailUri: m.thumbnailUrl || undefined,
        mediaType: m.mediaType,
        caption: m.caption || 'Kỷ niệm của hai đứa',
        createdAt: new Date(m.createdAt).toLocaleDateString('vi-VN'),
        durationSec: m.durationSec ?? undefined,
        albumCategory:
          itemCategoryMap[m.id] ||
          (m.remoteUrl ? itemCategoryMap[m.remoteUrl] : undefined) ||
          m.stamp ||
          undefined,
      }));

    const validLocalMedia: AlbumMediaWithCategory[] = mediaList
      .filter((loc) => loc.caption !== 'thumbnail' && loc.caption !== 'Hero Wallpaper')
      .map((loc) => ({
        ...loc,
        albumCategory:
          itemCategoryMap[loc.id] ||
          (loc.remoteUrl ? itemCategoryMap[loc.remoteUrl] : undefined) ||
          (loc as AlbumMediaWithCategory).albumCategory,
      }));

    if (cloudItems.length === 0) return validLocalMedia;

    const seenUrls = new Set(cloudItems.map((i) => i.remoteUrl || i.uri));
    const seenIds = new Set(cloudItems.map((i) => i.id));
    const localOnly = validLocalMedia.filter(
      (loc) => !seenIds.has(loc.id) && !seenUrls.has(loc.remoteUrl || loc.uri),
    );
    return [...cloudItems, ...localOnly];
  }, [cloudMediaPayload?.albumMedia, mediaList, itemCategoryMap]);

  const mergedLocketSnaps = React.useMemo<LocketSnapView[]>(() => {
    const cloudSnaps: LocketSnapView[] = (cloudMediaPayload?.locketSnaps || []).map(
      (s) =>
        ({
          id: s.id,
          uri: s.remoteUrl,
          remoteUrl: s.remoteUrl,
          ownerId: s.uploaderId,
          senderId: s.uploaderId,
          senderName:
            String(s.uploaderId) === String(currentUserId)
              ? myProfile.nickname
              : partnerProfile.nickname,
          stampBadge: s.stamp || '💕 Đang nhớ đằng ấy',
          caption: s.caption || '',
          createdAtTime: new Date(s.createdAt).toLocaleString('vi-VN'),
          reactions: Array.isArray(s.reactions) ? s.reactions : [],
        }) as unknown as LocketSnapView,
    );

    if (cloudSnaps.length === 0) return locketSnaps;

    const seenUrls = new Set(cloudSnaps.map((i: any) => i.remoteUrl || i.uri));
    const seenIds = new Set(cloudSnaps.map((i) => i.id));
    const localOnly = locketSnaps.filter(
      (loc: any) => !seenIds.has(loc.id) && !seenUrls.has(loc.remoteUrl || loc.uri),
    );
    return [...cloudSnaps, ...localOnly];
  }, [
    cloudMediaPayload?.locketSnaps,
    locketSnaps,
    currentUserId,
    myProfile.nickname,
    partnerProfile.nickname,
  ]);

  // Lưu bản sao từ Cloud xuống Local Storage để xem ngoại tuyến khi mất mạng
  useEffect(() => {
    if (!cloudMediaPayload || uploadingMedia) return;
    const hasCloudAlbum =
      Array.isArray(cloudMediaPayload.albumMedia) && cloudMediaPayload.albumMedia.length > 0;
    const hasCloudLocket =
      Array.isArray(cloudMediaPayload.locketSnaps) && cloudMediaPayload.locketSnaps.length > 0;

    if (
      (hasCloudAlbum && mergedMediaList.length > mediaList.length) ||
      (hasCloudLocket && mergedLocketSnaps.length > locketSnaps.length)
    ) {
      void restoreWorkspaceBackup({
        mediaList: mergedMediaList,
        locketSnaps: mergedLocketSnaps,
      });
    }
  }, [
    cloudMediaPayload,
    uploadingMedia,
    mergedMediaList,
    mergedLocketSnaps,
    mediaList.length,
    locketSnaps.length,
    restoreWorkspaceBackup,
  ]);

  const [momoTxModal, setMomoTxModal] = useState<{
    visible: boolean;
    goal: CoupleGoalItem | null;
    type: 'IN' | 'OUT';
  }>({ visible: false, goal: null, type: 'IN' });
  const [txAmountInput, setTxAmountInput] = useState('');
  const [txNoteInput, setTxNoteInput] = useState('');

  const [eventFilter, setEventFilter] = useState<'ALL' | 'DATE_PLAN' | 'MILESTONE'>('ALL');
  const [mediaFilter, setMediaFilter] = useState<'ALL' | 'IMAGE' | 'VIDEO'>('ALL');


  const filteredEvents = React.useMemo(() => {
    if (eventFilter === 'DATE_PLAN') {
      return events.filter((e) => e.category === 'DATE_PLAN');
    }
    if (eventFilter === 'MILESTONE') {
      return events.filter((e) => e.category !== 'DATE_PLAN');
    }
    return events;
  }, [events, eventFilter]);


  const horizontalPagerRef = useRef<ScrollView | null>(null);
  const [currentPage, setCurrentPage] = useState<0 | 1>(0);

  const [activeTab, setActiveTab] = useState<DashboardSection>('EVENTS');
  const [refreshing, setRefreshing] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [testingAiEventId, setTestingAiEventId] = useState<string | null>(null);

  const [formModal, setFormModal] = useState<{
    visible: boolean;
    mode: 'EVENT' | 'GOAL';
    initialEventCategory?: 'ANNIVERSARY' | 'BIRTHDAY' | 'DATE_PLAN';
    editingEvent?: ImportantEvent | null;
    editingGoal?: CoupleGoalItem | null;
  }>({ visible: false, mode: 'EVENT', initialEventCategory: 'ANNIVERSARY' });

  const [cachedAnniversaryIso, setCachedAnniversaryIso] = useState<string | null>(null);
  const [showAnnivPicker, setShowAnnivPicker] = useState(false);
  const [tempAnnivDate, setTempAnnivDate] = useState<Date>(new Date());

  const [qaInput, setQaInput] = useState('');
  const [qaSubmitting, setQaSubmitting] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const hasMyAnswer = Boolean(dailyQA.myAnswer?.trim());
  const hasPartnerAnswer = Boolean(dailyQA.partnerAnswer?.trim());
  const bothAnswered = hasMyAnswer && hasPartnerAnswer;

  const handleSubmitDailyAnswer = async () => {
    const text = qaInput.trim();
    if (!text || qaSubmitting) return;
    setQaSubmitting(true);
    setQaError(null);
    try {
      await submitDailyAnswer(text);
      setQaInput('');
    } catch {
      setQaError('Chưa gửi được câu trả lời. Kiểm tra mạng rồi thử lại nhé.');
    } finally {
      setQaSubmitting(false);
    }
  };

  const [selectedMedia, setSelectedMedia] = useState<AlbumMediaWithCategory | null>(null);
  const [pinUnlockInput, setPinUnlockInput] = useState('');

  const handleAutoScanMomoClipboard = useCallback(
    async (targetGoal: CoupleGoalItem) => {
      const clipText = await Clipboard.getStringAsync();
      const parsed = parseMomoTransactionText(clipText);

      if (!parsed) {
        Alert.alert(
          'Chưa tìm thấy giao dịch MoMo trong bộ nhớ tạm',
          'Hãy sao chép tin nhắn hoặc thông báo biến động số dư từ MoMo (VD: "+500.000đ" hoặc "Chuyển 200.000đ") rồi bấm lại nút này để ứng dụng tự động cập nhật phần trăm.',
        );
        return;
      }

      const actionLabel = parsed.type === 'IN' ? 'CỘNG VÀO (+)' : 'TRỪ RA (-)';
      Alert.alert(
        'Phát hiện biến động MoMo',
        `Hệ thống đọc được giao dịch ${actionLabel} ${parsed.amount.toLocaleString('vi-VN')}đ từ thông báo: "${parsed.rawSummary}". Áp dụng ngay vào mục tiêu "${targetGoal.title}"?`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Cập nhật ngay',
            onPress: async () => {
              await recordGoalMomoTransaction(
                targetGoal.id,
                parsed.type,
                parsed.amount,
                parsed.rawSummary,
              );
            },
          },
        ],
      );
    },
    [recordGoalMomoTransaction],
  );

  const importBackupJson = useCallback(
    async (rawJson: string) => {
      const parsed = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('INVALID_BACKUP');
      }

      if (parsed.anniversaryDate && typeof parsed.anniversaryDate === 'string') {
        setCachedAnniversaryIso(parsed.anniversaryDate);
        await storage.setItem(anniversaryCacheKey, parsed.anniversaryDate);
      }

      if (Array.isArray(parsed.albumCategories)) {
        await saveAlbumCategoriesList(parsed.albumCategories);
      }

      if (parsed.itemCategoryMap && typeof parsed.itemCategoryMap === 'object') {
        setItemCategoryMap(parsed.itemCategoryMap);
        await storage.setItem(itemCategoryMapKey, JSON.stringify(parsed.itemCategoryMap));
      }

      const exportedByUserId = parsed.exportedByUserId || parsed.myProfile?.userId;
      const isExportedByPartner =
        Boolean(exportedByUserId) &&
        Boolean(currentUserId) &&
        String(exportedByUserId) !== String(currentUserId);

      if (parsed.myProfile || parsed.partnerProfile) {
        if (isExportedByPartner) {
          await useSettingsStore
            .getState()
            .updateProfiles(
              { ...(parsed.partnerProfile || {}), userId: currentUserId },
              { ...(parsed.myProfile || {}), userId: String(exportedByUserId) },
            );
        } else {
          await useSettingsStore
            .getState()
            .updateProfiles(parsed.myProfile, parsed.partnerProfile);
        }
      }

      await useSettingsStore.getState().syncIdentityFromAuth({
        userId: currentUserId || 'local_me',
        coupleId,
        sharedRoomPayload: {
          membersById: useSettingsStore.getState().membersById,
          heroWallpaperUri: parsed.heroWallpaperUri,
          themePreset: parsed.themePreset,
          loveCoupons: parsed.loveCoupons,
          momoFund: parsed.momoFund,
          streakDays: parsed.streakDays,
          heartTapTotal: parsed.heartTapTotal,
        },
      });

      await restoreWorkspaceBackup({
        events: parsed.events,
        goals: parsed.goals,
        locketSnaps: parsed.locketSnaps,
        mediaList: parsed.mediaList,
      });
    },
    [
      anniversaryCacheKey,
      coupleId,
      currentUserId,
      itemCategoryMapKey,
      restoreWorkspaceBackup,
      saveAlbumCategoriesList,
    ],
  );

  const handleOpenMomoAndContribute = useCallback(
    async (amount: number, targetGoal?: CoupleGoalItem) => {
      if (!momoFund?.holderPhone && !momoFund?.momoPaymentLink) {
        Alert.alert(
          'Chưa thiết lập Quỹ MoMo',
          'Hãy vào mục Tùy chỉnh để nhập SĐT MoMo giữ quỹ hoặc dán link Quỹ nhóm MoMo của hai bạn.',
          [
            { text: 'Đóng', style: 'cancel' },
            { text: 'Mở Tùy chỉnh', onPress: () => setSettingsVisible(true) },
          ],
        );
        return;
      }

      const transferNote = targetGoal
        ? `Gop quy ${targetGoal.title}`
        : `Gop quy chung LoveVault`;

      if (momoFund.holderPhone) {
        await Clipboard.setStringAsync(momoFund.holderPhone);
      }

      const candidateUrl = momoFund.momoPaymentLink?.trim()
        ? momoFund.momoPaymentLink.trim()
        : `momo://`;

      try {
        const supported = await Linking.canOpenURL(candidateUrl);
        if (supported) {
          await Linking.openURL(candidateUrl);
        } else if (momoFund.holderPhone) {
          await Linking.openURL(`https://me.momo.vn/${momoFund.holderPhone}`);
        }
      } catch {
        // Bỏ qua nếu chưa cài App MoMo
      }

      Alert.alert(
        'Xác nhận nạp Quỹ chung MoMo',
        `Đã sao chép SĐT chủ quỹ (${momoFund.holderPhone || momoFund.holderName}). Sau khi chuyển ${amount.toLocaleString('vi-VN')}đ trên MoMo với nội dung "${transferNote}", bấm Xác nhận để cộng vào tiến độ mục tiêu.`,
        [
          { text: 'Để sau', style: 'cancel' },
          {
            text: 'Đã chuyển xong',
            onPress: async () => {
              await recordMomoContribution(
                myProfile.nickname,
                amount,
                targetGoal?.title || momoFund.holderName,
              );
              if (targetGoal) {
                await recordGoalMomoTransaction(
                  targetGoal.id,
                  'IN',
                  amount,
                  `Nạp nhanh qua MoMo`,
                );
              }
            },
          },
        ],
      );
    },
    [momoFund, myProfile.nickname, recordMomoContribution, recordGoalMomoTransaction],
  );

  useEffect(() => {
    void hydrateSettings(currentUserId, coupleId).then(() => {
      if (coupleId) {
        void pullSharedRoomSettingsFromServer();
      }
    });
    storage.getItem(anniversaryCacheKey).then((saved) => {
      setCachedAnniversaryIso(saved || null);
    });
  }, [
    hydrateSettings,
    pullSharedRoomSettingsFromServer,
    currentUserId,
    coupleId,
    anniversaryCacheKey,
  ]);

  const { data: counterData, isLoading, refetch } = useQuery({
    queryKey: ['dayCounter', coupleId, currentUserId],
    queryFn: async () => {
      const res = await api.get('/api/v1/couples/day-counter');
      void syncCoupleStatusFromServer();
      return res.data;
    },
    retry: 1,
    refetchInterval: 30000,
  });

  const effectiveAnniversaryIso: string | null =
    cachedAnniversaryIso ||
    counterData?.anniversaryDate ||
    counterData?.startDate ||
    null;

  const switchHorizontalPage = useCallback(
    (pageIndex: 0 | 1) => {
      void Haptics.selectionAsync().catch(() => {});
      setCurrentPage(pageIndex);
      horizontalPagerRef.current?.scrollTo({
        x: pageIndex * screenWidth,
        animated: true,
      });
    },
    [screenWidth],
  );

  // Mỗi khi server trả ngày kỷ niệm mới thì cập nhật bản lưu trong máy theo server
  useEffect(() => {
    const serverAnniv = counterData?.anniversaryDate || counterData?.startDate;
    if (serverAnniv) {
      setCachedAnniversaryIso(serverAnniv);
      void storage.setItem(anniversaryCacheKey, serverAnniv);
    }
  }, [counterData?.anniversaryDate, counterData?.startDate, anniversaryCacheKey]);

  const handleHorizontalMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const nextIndex: 0 | 1 = Math.round(offsetX / Math.max(1, screenWidth)) >= 1 ? 1 : 0;
      if (nextIndex !== currentPage) {
        setCurrentPage(nextIndex);
      }
    },
    [screenWidth, currentPage],
  );

  const handleSaveAnniversary = async (dateObj: Date) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;

    setCachedAnniversaryIso(iso);
    await storage.setItem(anniversaryCacheKey, iso);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
      await api.patch('/api/v1/couples/anniversary', {
        anniversaryDate: iso,
        timezone: tz,
      });
      await queryClient.invalidateQueries({ queryKey: ['dayCounter'] });
    } catch {
      Alert.alert(
        'Chưa đồng bộ được',
        'Ngày kỷ niệm mới chỉ lưu trên máy này. Thiết bị còn lại sẽ chưa thấy ngày này cho đến khi lưu lại thành công.',
      );
    }
  };

  const onAnnivPickerChange = (ev: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowAnnivPicker(false);
      if (ev.type === 'set' && selected) {
        void handleSaveAnniversary(selected);
      }
    } else if (selected) {
      setTempAnnivDate(selected);
    }
  };

  const handleTestAiOnEvent = async (item: ImportantEvent) => {
    if (testingAiEventId) return;
    try {
      setTestingAiEventId(item.id);
      const { freshMessage, elapsedMs } = await forceTestGeminiOnEvent(item);
      Alert.alert(`Đã làm mới lời nhắc (${elapsedMs}ms)`, freshMessage);
    } catch (err: any) {
      Alert.alert(
        'Không thể tạo lời nhắc mới',
        err?.message || 'Vui lòng kiểm tra lại kết nối mạng hoặc khóa Gemini API.',
      );
    } finally {
      setTestingAiEventId(null);
    }
  };

  const handleSendMissYou = async () => {
    await recordInteractionStreak();
    api
      .post('/api/v1/couples/miss-you', {
        senderId: currentUserId,
        senderNickname: myProfile.nickname,
        sentAt: new Date().toISOString(),
      })
      .catch(() => null);

    Alert.alert(
      'Đã gửi tín hiệu',
      `${partnerProfile.nickname} sẽ nhận được thông báo từ bạn.`,
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        refetchCloudMedia(),
        retryPendingSync(),
        syncCoupleStatusFromServer(),
        pullSharedRoomSettingsFromServer(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    refetch,
    refetchCloudMedia,
    retryPendingSync,
    syncCoupleStatusFromServer,
    pullSharedRoomSettingsFromServer,
  ]);

  // Tự kéo thiết lập chung (hồ sơ, hình nền...) khi mở lại app và định kỳ lúc đang dùng
  useEffect(() => {
    if (!coupleId) return;

    const pullQuietly = () => {
      pullSharedRoomSettingsFromServer().catch(() => null);
    };

    pullQuietly();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') pullQuietly();
    }, 20000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') pullQuietly();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [coupleId, pullSharedRoomSettingsFromServer]);

  const exportBackupJson = async () => {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        exportedByUserId: currentUserId,
        coupleId,
        anniversaryDate: effectiveAnniversaryIso,
        heroWallpaperUri,
        themePreset,
        membersById,
        myProfile: { ...myProfile, userId: currentUserId },
        partnerProfile,
        loveCoupons,
        momoFund,
        streakDays,
        heartTapTotal,
        events,
        goals,
        albumCategories,
        itemCategoryMap,
        locketSnaps: mergedLocketSnaps,
        mediaList: mergedMediaList,
        locketCount: mergedLocketSnaps.length,
        mediaCount: mergedMediaList.length,
      },
      null,
      2,
    );
  };

  const scrollX = useRef(new Animated.Value(0)).current;
  const [switchWidth, setSwitchWidth] = useState(0);
  const [pagerScrollEnabled, setPagerScrollEnabled] = useState(true);
  const [pagerHeight, setPagerHeight] = useState(0);
  const handlePagerLayout = useCallback((e: LayoutChangeEvent) => {
    setPagerHeight(Math.round(e.nativeEvent.layout.height));
  }, []);
  const pageStyle = React.useMemo(
    () =>
      pagerHeight > 0
        ? { width: screenWidth, height: pagerHeight }
        : { width: screenWidth, flex: 1 },
    [screenWidth, pagerHeight],
  );
  const [reactionSnapId, setReactionSnapId] = useState<string | null>(null);

  const switchSegWidth = Math.max(0, (switchWidth - PAGE_SWITCH_PADDING * 2) / 2);
  const thumbTranslateX = React.useMemo(
    () =>
      scrollX.interpolate({
        inputRange: [0, Math.max(1, screenWidth)],
        outputRange: [0, switchSegWidth],
        extrapolate: 'clamp',
      }),
    [scrollX, screenWidth, switchSegWidth],
  );
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    [],
  );
  const syncPageFromOffset = useCallback(
    (x: number) => {
      const idx: 0 | 1 = x > screenWidth / 2 ? 1 : 0;
      setCurrentPage((prev) => (prev === idx ? prev : idx));

      // Web: nếu dừng kéo giữa hai trang thì tự căn về trang gần nhất
      if (Platform.OS === 'web') {
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        settleTimerRef.current = setTimeout(() => {
          const target = idx * screenWidth;
          if (Math.abs(x - target) > 2) {
            horizontalPagerRef.current?.scrollTo({ x: target, animated: true });
          }
        }, 150);
      }
    },
    [screenWidth],
  );
  const onPagerScroll = React.useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: Platform.OS !== 'web',
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) =>
          syncPageFromOffset(e.nativeEvent.contentOffset.x),
      }),
    [scrollX, syncPageFromOffset],
  );
  const handleSwitchLayout = useCallback((e: LayoutChangeEvent) => {
    setSwitchWidth(e.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    if (isAppLocked) {
      scrollX.setValue(0);
      setCurrentPage(0);
    }
  }, [isAppLocked, scrollX]);

  const handlePagerLock = useCallback((locked: boolean) => {
    setPagerScrollEnabled(!locked);
  }, []);

  // Chụp Locket: lưu Local trước để hiển thị tức thì, sau đó đẩy thẳng lên S3/R2 + PostgreSQL
const handleCapturePhotoUri = useCallback(
    async (uri: string, stamp: string, cap: string) => {
      await saveCapturedLocketUri(uri, stamp, cap);
      if (coupleId) {
        await queryClient.invalidateQueries({
          queryKey: ['cloudWorkspaceMedia', coupleId],
        });
      }
    },
    [saveCapturedLocketUri, coupleId, queryClient],
  );

  const handlePickFromGallery = useCallback(
    async (stamp: string, cap: string) => {
      await captureCoupleLocket('GALLERY', stamp, cap);
      if (coupleId) {
        void queryClient.invalidateQueries({
          queryKey: ['cloudWorkspaceMedia', coupleId],
        });
      }
    },
    [captureCoupleLocket, coupleId, queryClient],
  );

  // Thêm nhanh ảnh/video vào đúng Danh mục đang chọn
  const handlePickAndSaveAlbumMedia = useCallback(
    async (type: 'IMAGE' | 'VIDEO', targetCategoryOverride?: string) => {
      const activeCat =
        targetCategoryOverride ??
        (selectedAlbumCategory !== 'ALL' && selectedAlbumCategory !== 'UNCATEGORIZED'
          ? selectedAlbumCategory
          : null);

      pendingTargetCategoryRef.current = activeCat;
      const prevIds = new Set(mergedMediaList.map((m) => m.id));

      await pickAndSaveMedia(type, activeCat || undefined);

      if (coupleId) {
        const refreshed = await refetchCloudMedia();
        const newestCloud = refreshed.data?.albumMedia?.find(
          (m) => m.caption !== 'thumbnail' && m.caption !== 'Hero Wallpaper',
        );
        if (activeCat && newestCloud && !prevIds.has(newestCloud.id)) {
          await assignMediaToCategory(newestCloud.id, activeCat, newestCloud.remoteUrl);
        }
      }
    },
    [
      selectedAlbumCategory,
      mergedMediaList,
      pickAndSaveMedia,
      coupleId,
      refetchCloudMedia,
      assignMediaToCategory,
    ],
  );

  // Tự động gán danh mục cho ảnh mới vừa thêm ở Local
  useEffect(() => {
    const targetCat = pendingTargetCategoryRef.current;
    if (!targetCat || mediaList.length === 0) return;
    const newestLocal = mediaList.find(
      (m) => m.caption !== 'thumbnail' && m.caption !== 'Hero Wallpaper',
    );
    if (newestLocal && !itemCategoryMap[newestLocal.id]) {
      void assignMediaToCategory(newestLocal.id, targetCat, newestLocal.remoteUrl);
      pendingTargetCategoryRef.current = null;
    }
  }, [mediaList, itemCategoryMap, assignMediaToCategory]);

  const handleSwipeToDashboard = useCallback(() => {
    switchHorizontalPage(1);
  }, [switchHorizontalPage]);

  // Xóa Locket ở cả Local + Cache + Supabase Database & S3 Storage
  // 2. Sửa handleDeleteLocketSnap (khoảng dòng 705) - XÓA lệnh gọi deleteCloudMediaById bị trùng lần 2:
  const handleDeleteLocketSnap = useCallback(
    async (id: string) => {
      const targetSnap = mergedLocketSnaps.find((s) => s.id === id);

      // 1. Xóa khỏi React Query Cache ngay lập tức
      queryClient.setQueryData(
        ['cloudWorkspaceMedia', coupleId, currentUserId],
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            locketSnaps: Array.isArray(oldData.locketSnaps)
              ? oldData.locketSnaps.filter(
                  (s: any) =>
                    s.id !== id &&
                    (!targetSnap?.remoteUrl || s.remoteUrl !== targetSnap.remoteUrl),
                )
              : [],
          };
        },
      );

      // 2. Cập nhật lại bản backup Local
      const updatedSnaps = mergedLocketSnaps.filter((s) => s.id !== id);
      void restoreWorkspaceBackup({
        mediaList: mergedMediaList,
        locketSnaps: updatedSnaps,
      });

      // 3. Gọi deleteLocketSnap (hàm này đã bao gồm xóa Local + gọi API xóa Database PostgreSQL & S3)
      try {
        await deleteLocketSnap(id);
        if (coupleId) {
          await queryClient.invalidateQueries({
            queryKey: ['cloudWorkspaceMedia', coupleId],
          });
        }
      } catch (err) {
        console.warn('Không thể xóa Locket trên Cloud:', err);
        Alert.alert('Lỗi xóa ảnh', 'Chưa xóa được ảnh trên Database, vui lòng thử lại.');
      }
    },
    [
      mergedLocketSnaps,
      mergedMediaList,
      deleteLocketSnap,
      queryClient,
      coupleId,
      currentUserId,
      restoreWorkspaceBackup,
    ],
  );

  // 3. Tương tự cho handleDeleteAlbumMedia (khoảng dòng 750) - Tránh gọi deleteCloudMediaById 2 lần:
  const handleDeleteAlbumMedia = useCallback(
    async (id: string) => {
      const targetItem = mergedMediaList.find((m) => m.id === id);

      queryClient.setQueryData(
        ['cloudWorkspaceMedia', coupleId, currentUserId],
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            albumMedia: Array.isArray(oldData.albumMedia)
              ? oldData.albumMedia.filter(
                  (m: any) =>
                    m.id !== id &&
                    (!targetItem?.remoteUrl || m.remoteUrl !== targetItem.remoteUrl),
                )
              : [],
          };
        },
      );

      const updatedMedia = mergedMediaList.filter((m) => m.id !== id);
      void restoreWorkspaceBackup({
        mediaList: updatedMedia,
        locketSnaps: mergedLocketSnaps,
      });

      try {
        await deleteMedia(id); // Đã gọi deleteCloudMediaById bên trong
        if (coupleId) {
          await queryClient.invalidateQueries({
            queryKey: ['cloudWorkspaceMedia', coupleId],
          });
        }
      } catch (err) {
        console.warn('Không thể xóa media trên Cloud:', err);
      }
    },
    [
      mergedMediaList,
      mergedLocketSnaps,
      deleteMedia,
      queryClient,
      coupleId,
      currentUserId,
      restoreWorkspaceBackup,
    ],
  );

  const handleReactLocketSnap = useCallback(
    (id: string, emoji: string) => {
      void Haptics.selectionAsync().catch(() => {});
      void reactToLocketSnap(id, emoji);
      if (coupleId) {
        api
          .post(`/api/v1/media/${id}/reactions`, { emoji })
          .then(() => {
            void queryClient.invalidateQueries({
              queryKey: ['cloudWorkspaceMedia', coupleId],
            });
          })
          .catch(() => null);
      }
    },
    [reactToLocketSnap, coupleId, queryClient],
  );

  const reactionSnap = React.useMemo(
    () => mergedLocketSnaps.find((s) => s.id === reactionSnapId) ?? null,
    [mergedLocketSnaps, reactionSnapId],
  );
  const closeReactionSheet = useCallback(() => setReactionSnapId(null), []);

  const renderLocketSnap = useCallback(
    ({ item }: { item: LocketSnapView }) => (
      <LocketSnapCard
        snap={item}
        colors={colors}
        viewerId={currentUserId}
        onDelete={handleDeleteLocketSnap}
        onReact={handleReactLocketSnap}
        onOpenReactions={setReactionSnapId}
      />
    ),
    [colors, currentUserId, handleDeleteLocketSnap, handleReactLocketSnap],
  );

  if (isAppLocked) {
    return (
      <View
        style={[
          styles.lockScreen,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <Text style={[styles.lockTitle, { color: colors.textPrimary }]}>
          Khóa bảo mật
        </Text>
        <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>
          Nhập mã PIN 4 chữ số để mở
        </Text>
        <TextInput
          style={[
            styles.pinInputBox,
            {
              borderColor: colors.primary,
              color: colors.textPrimary,
              backgroundColor: colors.surface,
            },
          ]}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
          value={pinUnlockInput}
          onChangeText={(txt) => {
            setPinUnlockInput(txt);
            if (txt.length === 4) {
              const ok = unlockAppWithPin(txt);
              if (!ok) {
                Alert.alert('Mã PIN không đúng', 'Vui lòng thử lại.');
                setPinUnlockInput('');
              }
            }
          }}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.surface}
      />

      {/* TOP BAR */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle },
        ]}
      >
        <View style={styles.topBarRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở hồ sơ"
            style={styles.topBarProfileBtn}
            onPress={() => setProfileVisible(true)}
          >
            <View style={[styles.miniAvatar, { backgroundColor: colors.surfaceVariant }]}>
              {myProfile.avatarUri ? (
                <Image source={{ uri: myProfile.avatarUri }} style={styles.miniAvatarImg} />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                  {myProfile.nickname.slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.brandTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                LoveVault
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }} numberOfLines={1}>
                {myProfile.nickname} & {partnerProfile.nickname}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở cài đặt"
            hitSlop={6}
            style={[styles.settingsBtn, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => setSettingsVisible(true)}
          >
            <Text style={[styles.settingsBtnText, { color: colors.textPrimary }]}>Tùy chỉnh</Text>
          </Pressable>
        </View>

        <View
          accessibilityRole="tablist"
          style={[styles.pageSwitchTrack, { backgroundColor: colors.surfaceVariant }]}
          onLayout={handleSwitchLayout}
        >
          {switchWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pageSwitchThumb,
                {
                  width: switchSegWidth,
                  backgroundColor: colors.primary,
                  transform: [{ translateX: thumbTranslateX }],
                },
              ]}
            />
          )}
          {PAGE_LABELS.map((label, idx) => {
            const active = currentPage === idx;
            return (
              <Pressable
                key={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={styles.pageSwitchItem}
                onPress={() => switchHorizontalPage(idx as 0 | 1)}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: active ? '#FFFFFF' : colors.textSecondary,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* PAGER SWIPE TRÁI PHẢI */}
      <Animated.ScrollView
        ref={horizontalPagerRef}
        horizontal
        pagingEnabled
        scrollEnabled={pagerScrollEnabled}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToInterval={screenWidth}
        snapToAlignment="start"
        onScroll={onPagerScroll}
        onMomentumScrollEnd={handleHorizontalMomentumEnd}
        scrollEventThrottle={16}
        onLayout={handlePagerLayout}
        directionalLockEnabled
        style={{ flex: 1 }}
      >
        {/* PAGE 0: LOCKET */}
        <View style={pageStyle}>
          <FlatList
            data={mergedLocketSnaps}
            keyExtractor={locketSnapKeyExtractor}
            renderItem={renderLocketSnap}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            initialNumToRender={3}
            maxToRenderPerBatch={4}
            windowSize={5}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
            ListHeaderComponent={
              <View>
                <LocketCameraCard
                  colors={colors}
                  isPageActive={currentPage === 0}
                  stamps={COUPLE_LOCKET_STAMPS}
                  onCapturePhotoUri={handleCapturePhotoUri}
                  onPickFromGallery={handlePickFromGallery}
                  onSwipeToDashboard={handleSwipeToDashboard}
                  onPagerLockChange={handlePagerLock}
                />

                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    Nhật ký Locket ({mergedLocketSnaps.length})
                  </Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  Chưa có ảnh Locket
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                  Chụp trực tiếp từ khung ngắm phía trên để gửi khoảnh khắc kèm trạng thái.
                </Text>
              </View>
            }
          />
        </View>

        {/* PAGE 1: KHÔNG GIAN CẶP ĐÔI */}
        <View style={pageStyle}>
          <ScrollView
            style={{ flex: 1 }}
            nestedScrollEnabled
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <CoupleHeroCard
              colors={colors}
              anniversaryIso={effectiveAnniversaryIso}
              isLoading={isLoading}
              onPressEditAnniversary={() => {
                if (effectiveAnniversaryIso) {
                  const [y, m, d] = effectiveAnniversaryIso.split('-').map(Number);
                  if (y && m && d) setTempAnnivDate(new Date(y, m - 1, d));
                }
                setShowAnnivPicker(true);
              }}
              onPressOpenProfile={() => setProfileVisible(true)}
              onSendMissYou={handleSendMissYou}
            />

            {/* THANH 4 TAB */}
            <View style={[styles.gridTabBar, { backgroundColor: colors.surfaceVariant }]}>
              {(
                [
                  { key: 'EVENTS', label: 'Lịch hẹn' },
                  { key: 'GOALS', label: 'Mục tiêu' },
                  { key: 'DAILY_QA', label: 'Hỏi đáp' },
                  { key: 'MEDIA', label: 'Album' },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={[
                      styles.gridTabItem,
                      active && [styles.gridTabItemActive, { backgroundColor: colors.surface }],
                    ]}
                    onPress={() => setActiveTab(tab.key)}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: active ? '700' : '500',
                        color: active ? colors.textPrimary : colors.textSecondary,
                      }}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* TAB 1: LỊCH HẸN & LẬP KẾ HOẠCH ĐI CHƠI (CÓ GOOGLE MAPS) */}
            {activeTab === 'EVENTS' && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    Lịch hẹn ({filteredEvents.length})
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      style={[
                        styles.addBtn,
                        { backgroundColor: colors.primaryContainer, paddingHorizontal: 12 },
                      ]}
                      onPress={() =>
                        setFormModal({
                          visible: true,
                          mode: 'EVENT',
                          initialEventCategory: 'DATE_PLAN',
                          editingEvent: null,
                        })
                      }
                    >
                      <Text
                        style={{
                          color: colors.onPrimaryContainer,
                          fontSize: 12,
                          fontWeight: '700',
                        }}
                      >
                        🥂 + Lên kèo đi chơi
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.addBtn,
                        { backgroundColor: colors.primary, paddingHorizontal: 12 },
                      ]}
                      onPress={() =>
                        setFormModal({
                          visible: true,
                          mode: 'EVENT',
                          initialEventCategory: 'ANNIVERSARY',
                          editingEvent: null,
                        })
                      }
                    >
                      <Text style={styles.addBtnText}>+ Sự kiện</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.mediaFilterRow}>
                  {(
                    [
                      { key: 'ALL', label: `Tất cả (${events.length})` },
                      {
                        key: 'DATE_PLAN',
                        label: `🥂 Kế hoạch đi chơi (${events.filter((e) => e.category === 'DATE_PLAN').length})`,
                      },
                      {
                        key: 'MILESTONE',
                        label: `💍 Kỷ niệm & Sinh nhật (${events.filter((e) => e.category !== 'DATE_PLAN').length})`,
                      },
                    ] as const
                  ).map((f) => {
                    const active = eventFilter === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        style={[
                          styles.mediaFilterChip,
                          { backgroundColor: active ? colors.primary : colors.surfaceVariant },
                        ]}
                        onPress={() => setEventFilter(f.key)}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: active ? '#FFFFFF' : colors.textSecondary,
                          }}
                        >
                          {f.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {filteredEvents.length === 0 ? (
                  <View
                    style={[
                      styles.emptyCard,
                      { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                    ]}
                  >
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                      Chưa có lịch hẹn nào
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                      Bấm "+ Lên kèo đi chơi" để lập kế hoạch đi ăn, đi uống kèm địa chỉ Google Maps.
                    </Text>
                  </View>
                ) : (
                  filteredEvents.map((item) => {
  const isDatePlan = item.category === 'DATE_PLAN';

  if (isDatePlan) {
    return (
      <DatePlanTicketCard
        key={item.id}
        item={item}
        colors={colors}
        onEdit={(editedItem) =>
          setFormModal({
            visible: true,
            mode: 'EVENT',
            initialEventCategory: 'DATE_PLAN',
            editingEvent: editedItem,
          })
        }
        onDelete={(id) => deleteEvent(id)}
      />
    );
  }

  // Giữ nguyên giao diện card cho Kỷ niệm & Sinh nhật
  const daysLeft = computeDaysUntilNextOccurrence(item.eventDate, true);
  const isTestingThis = testingAiEventId === item.id;

  return (
    <Pressable
      key={item.id}
      style={[
        styles.itemCard,
        { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
      ]}
      onPress={() =>
        setFormModal({
          visible: true,
          mode: 'EVENT',
          initialEventCategory: item.category as any,
          editingEvent: item,
        })
      }
    >
      <View style={styles.eventMainRow}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={[styles.cardMainTitle, { color: colors.textPrimary }]}>
            {item.category === 'BIRTHDAY' ? '🎂 ' : '💍 '}
            {item.title}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3 }}>
            📅 {item.eventDate}  •  ⏰ Nhắc lúc {item.notifyAtTime}
          </Text>
        </View>

        <View style={[styles.daysLeftBadge, { backgroundColor: colors.primaryContainer }]}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.onPrimaryContainer }}>
            {daysLeft === 0 ? 'Hôm nay' : `${daysLeft} ngày`}
          </Text>
        </View>
      </View>

      {Boolean(item.customMessage) && (
        <Text style={[styles.subtleReminderNote, { color: colors.textSecondary, borderTopColor: colors.borderSubtle }]}>
          {item.customMessage}
        </Text>
      )}

      <View style={styles.cardBottomActions}>
        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
          {item.category === 'BIRTHDAY' ? 'Sinh nhật hàng năm' : 'Kỷ niệm'}
        </Text>
        <View style={styles.eventActionBtnGroup}>
          <Pressable hitSlop={10} disabled={isTestingThis} onPress={() => void handleTestAiOnEvent(item)}>
            {isTestingThis ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Thử lời nhắc AI</Text>
            )}
          </Pressable>
          <Pressable hitSlop={10} onPress={() => deleteEvent(item.id)}>
            <Text style={{ color: colors.error, fontSize: 12, fontWeight: '600' }}>Xóa</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
})
                )}
              </View>
            )}

            {/* TAB 2: MỤC TIÊU & QUỸ CHUNG MOMO */}
            {activeTab === 'GOALS' && (
              <View style={styles.sectionWrap}>
                {isMomoFundEnabled && (
                  <View
                    style={[
                      styles.itemCard,
                      {
                        backgroundColor: '#FFF0F6',
                        borderColor: '#F472B6',
                        marginBottom: 16,
                      },
                    ]}
                  >
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#A50064' }}>
                          QUỸ CHUNG MOMO CẶP ĐÔI
                        </Text>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: '800',
                            color: '#1E293B',
                            marginTop: 2,
                          }}
                        >
                          {momoFund?.holderName || 'Quỹ chung hai đứa'}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                          {momoFund?.holderPhone
                            ? `Chủ quỹ: ${momoFund.holderPhone}`
                            : 'Chưa gắn SĐT MoMo • Bấm Cấu hình để liên kết'}
                        </Text>
                      </View>

                      <Pressable
                        style={{
                          backgroundColor: '#A50064',
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 14,
                        }}
                        onPress={() => setSettingsVisible(true)}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                          Cấu hình / Tắt
                        </Text>
                      </Pressable>
                    </View>

                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: '#831843',
                        marginTop: 8,
                        marginBottom: 6,
                      }}
                    >
                      Nạp nhanh vào mục tiêu đầu tiên qua App MoMo:
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {(momoFund?.quickAmounts || [50000, 100000, 200000, 500000]).map((amt) => (
                        <Pressable
                          key={amt}
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: '#F472B6',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 10,
                          }}
                          onPress={() => void handleOpenMomoAndContribute(amt, goals[0])}
                        >
                          <Text style={{ color: '#A50064', fontSize: 12, fontWeight: '700' }}>
                            +{amt / 1000}k MoMo
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    Kế hoạch chung ({goals.length})
                  </Text>
                  <Pressable
                    style={[styles.addBtn, { backgroundColor: colors.primary }]}
                    onPress={() =>
                      setFormModal({ visible: true, mode: 'GOAL', editingGoal: null })
                    }
                  >
                    <Text style={styles.addBtnText}>Thêm mục tiêu</Text>
                  </Pressable>
                </View>

                {goals.length === 0 ? (
                  <View
                    style={[
                      styles.emptyCard,
                      { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                    ]}
                  >
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                      Chưa có mục tiêu nào
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                      Đặt mục tiêu tiết kiệm hoặc chuyến đi sắp tới của hai bạn.
                    </Text>
                  </View>
                ) : (
                  goals.map((goal) => {
                    const safeTarget = Math.max(1, goal.targetAmount);
                    const rawPercent = (goal.currentAmount / safeTarget) * 100;
                    const clampedPercent = Math.min(100, Math.max(0, rawPercent));
                    const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
                    const isMomoGoal = isMomoFundEnabled && goal.isMomoLinked !== false;

                    return (
                      <View
                        key={goal.id}
                        style={[
                          styles.itemCard,
                          { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                          goal.isCompleted && { opacity: 0.72 },
                        ]}
                      >
                        <View style={styles.cardTopRow}>
                          <Pressable
                            style={styles.goalCheckRow}
                            onPress={() => toggleGoalCompletion(goal.id)}
                          >
                            <View
                              style={[
                                styles.checkbox,
                                { borderColor: isMomoGoal ? '#A50064' : colors.primary },
                                goal.isCompleted && {
                                  backgroundColor: isMomoGoal ? '#A50064' : colors.primary,
                                },
                              ]}
                            >
                              {goal.isCompleted && (
                                <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800' }}>
                                  ✓
                                </Text>
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.cardMainTitle,
                                  { color: colors.textPrimary },
                                  goal.isCompleted && { textDecorationLine: 'line-through' },
                                ]}
                              >
                                {goal.title}
                              </Text>
                              {isMomoGoal && (
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#A50064',
                                    marginTop: 2,
                                  }}
                                >
                                  Quỹ tiết kiệm MoMo • Còn thiếu{' '}
                                  {remainingAmount.toLocaleString('vi-VN')}đ
                                </Text>
                              )}
                            </View>
                          </Pressable>

                          <View style={{ flexDirection: 'row', gap: 14 }}>
                            <Pressable
                              hitSlop={8}
                              onPress={() =>
                                setFormModal({
                                  visible: true,
                                  mode: 'GOAL',
                                  editingGoal: goal,
                                })
                              }
                            >
                              <Text
                                style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}
                              >
                                Sửa
                              </Text>
                            </Pressable>

                            <Pressable hitSlop={8} onPress={() => deleteGoal(goal.id)}>
                              <Text
                                style={{ color: colors.error, fontSize: 12, fontWeight: '600' }}
                              >
                                Xóa
                              </Text>
                            </Pressable>
                          </View>
                        </View>

                        <View style={styles.goalProgressSection}>
                          <View style={styles.cardTopRow}>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: '600',
                                color: colors.textSecondary,
                              }}
                            >
                              {goal.currentAmount.toLocaleString('vi-VN')} /{' '}
                              {goal.targetAmount.toLocaleString('vi-VN')} {goal.unitLabel}
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: '800',
                                color: isMomoGoal ? '#A50064' : colors.textPrimary,
                              }}
                            >
                              {clampedPercent.toFixed(1)}%
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.progressBarBg,
                              {
                                backgroundColor: colors.surfaceVariant,
                                height: 8,
                                borderRadius: 4,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  backgroundColor: goal.isCompleted
                                    ? colors.success
                                    : isMomoGoal
                                      ? '#A50064'
                                      : colors.primary,
                                  width: `${clampedPercent}%`,
                                },
                              ]}
                            />
                          </View>
                        </View>

                        {isMomoGoal && (
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                            <Pressable
                              style={{
                                flex: 1,
                                minHeight: 36,
                                borderRadius: 10,
                                backgroundColor: '#DCFCE7',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}
                              onPress={() => {
                                setTxAmountInput('');
                                setTxNoteInput('');
                                setMomoTxModal({ visible: true, goal, type: 'IN' });
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#15803D' }}>
                                + Chuyển vào
                              </Text>
                            </Pressable>

                            <Pressable
                              style={{
                                flex: 1,
                                minHeight: 36,
                                borderRadius: 10,
                                backgroundColor: '#FEE2E2',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}
                              onPress={() => {
                                setTxAmountInput('');
                                setTxNoteInput('');
                                setMomoTxModal({ visible: true, goal, type: 'OUT' });
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#B91C1C' }}>
                                - Rút chi tiêu
                              </Text>
                            </Pressable>

                            <Pressable
                              style={{
                                flex: 1.2,
                                minHeight: 36,
                                borderRadius: 10,
                                backgroundColor: '#FCE7F3',
                                justifyContent: 'center',
                                alignItems: 'center',
                                paddingHorizontal: 6,
                              }}
                              onPress={() => void handleAutoScanMomoClipboard(goal)}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#A50064' }}>
                                Quét GD MoMo
                              </Text>
                            </Pressable>
                          </View>
                        )}

                        {isMomoGoal &&
                          goal.momoTransactions &&
                          goal.momoTransactions.length > 0 && (
                            <View
                              style={{
                                marginTop: 10,
                                paddingTop: 8,
                                borderTopWidth: StyleSheet.hairlineWidth,
                                borderTopColor: colors.borderSubtle,
                              }}
                            >
                              {goal.momoTransactions.slice(0, 3).map((tx) => (
                                <View
                                  key={tx.id}
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    marginTop: 4,
                                  }}
                                >
                                  <Text
                                    style={{ fontSize: 11, color: colors.textSecondary, flex: 1 }}
                                    numberOfLines={1}
                                  >
                                    {tx.actor}: {tx.note}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontWeight: '700',
                                      color: tx.type === 'IN' ? '#16A34A' : '#DC2626',
                                    }}
                                  >
                                    {tx.type === 'IN' ? '+' : '-'}
                                    {tx.amount.toLocaleString('vi-VN')}đ
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}

                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 8 }}>
                          Hạn định: {goal.targetDate}
                        </Text>

                        {isMomoGoal && !goal.isCompleted && (
                          <View
                            style={{
                              flexDirection: 'row',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: 6,
                              marginTop: 10,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#A50064' }}>
                              Nạp MoMo:
                            </Text>
                            {(momoFund?.quickAmounts || [50000, 100000, 200000, 500000])
                              .slice(0, 4)
                              .map((amt) => (
                                <Pressable
                                  key={`${goal.id}_${amt}`}
                                  style={{
                                    backgroundColor: '#FFF0F6',
                                    borderWidth: 1,
                                    borderColor: '#F472B6',
                                    paddingHorizontal: 9,
                                    paddingVertical: 4,
                                    borderRadius: 10,
                                  }}
                                  onPress={() => void handleOpenMomoAndContribute(amt, goal)}
                                >
                                  <Text
                                    style={{ color: '#A50064', fontSize: 11, fontWeight: '700' }}
                                  >
                                    +{amt / 1000}k
                                  </Text>
                                </Pressable>
                              ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* TAB 3: HỎI ĐÁP REALTIME WEBSOCKET */}
            {activeTab === 'DAILY_QA' && (
              <DailyQASection
                colors={colors}
                myNickname={myProfile.nickname}
                partnerNickname={partnerProfile.nickname}
                activeQA={activeQA}
                qaFilter={qaFilter}
                qaHistory={qaHistory}
                socketConnected={socketConnected}
                partnerTypingName={partnerTypingName}
                totalQuestionsCount={totalQuestionsCount}
                completedBothCount={completedBothCount}
                onTyping={notifyTyping}
                onSubmitAnswer={submitAnswer}
                onRollQuestion={rollQuestion}
                onSelectHistoryItem={selectQuestionFromHistory}
              />
            )}

            {/* TAB 4: ALBUM ẢNH & VIDEO CÓ DANH MỤC & NÚT THÊM NHANH */}
            {activeTab === 'MEDIA' && (
  <RedesignedAlbumSection
    colors={colors}
    mediaList={mergedMediaList}
    categories={albumCategories}
    selectedCategory={selectedAlbumCategory}
    mediaFilter={mediaFilter}
    uploading={uploadingMedia}
    onSelectCategory={setSelectedAlbumCategory}
    onChangeFilter={setMediaFilter}
    onCreateCategory={() => setCreateCategoryModalVisible(true)}
    onPickMedia={(type) => void handlePickAndSaveAlbumMedia(type)}
    onOpenMedia={setSelectedMedia}
    onDeleteCategory={handleDeleteAlbumCategory}
  />
)}
          </ScrollView>
        </View>
      </Animated.ScrollView>

      {Platform.OS === 'android' && showAnnivPicker && (
        <DateTimePicker
          value={tempAnnivDate}
          mode="date"
          maximumDate={new Date()}
          onChange={onAnnivPickerChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={showAnnivPicker} transparent animationType="slide">
          <View style={[styles.iosSheetBackdrop, { backgroundColor: colors.backdrop }]}>
            <View style={[styles.iosSheetBox, { backgroundColor: colors.surface }]}>
              <View style={styles.iosSheetHeader}>
                <Pressable onPress={() => setShowAnnivPicker(false)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Hủy</Text>
                </Pressable>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  Ngày bắt đầu
                </Text>
                <Pressable
                  onPress={() => {
                    setShowAnnivPicker(false);
                    void handleSaveAnniversary(tempAnnivDate);
                  }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Lưu</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempAnnivDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={onAnnivPickerChange}
              />
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'web' && (
        <Modal
          visible={showAnnivPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAnnivPicker(false)}
        >
          <View style={[styles.iosSheetBackdrop, { backgroundColor: colors.backdrop }]}>
            <View style={[styles.iosSheetBox, { backgroundColor: colors.surface }]}>
              <View style={styles.iosSheetHeader}>
                <Pressable onPress={() => setShowAnnivPicker(false)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Hủy</Text>
                </Pressable>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  Ngày bắt đầu
                </Text>
                <Pressable
                  onPress={() => {
                    setShowAnnivPicker(false);
                    void handleSaveAnniversary(tempAnnivDate);
                  }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Lưu</Text>
                </Pressable>
              </View>
              {React.createElement('input', {
                type: 'date',
                value: toLocalIsoDate(tempAnnivDate),
                max: toLocalIsoDate(new Date()),
                onChange: (e: any) => {
                  const value: string = e?.target?.value || '';
                  if (!value) return;
                  const [y, m, d] = value.split('-').map(Number);
                  if (y && m && d) setTempAnnivDate(new Date(y, m - 1, d));
                },
                style: {
                  margin: 16,
                  padding: 12,
                  fontSize: 18,
                  borderRadius: 12,
                  border: `1px solid ${colors.textSecondary}`,
                  backgroundColor: 'transparent',
                  color: colors.textPrimary,
                },
              })}
            </View>
          </View>
        </Modal>
      )}

      <ProfileModal
        visible={profileVisible}
        colors={colors}
        coupleId={coupleId}
        onClose={() => setProfileVisible(false)}
      />

      <SettingsModal
        visible={settingsVisible}
        colors={colors}
        onClose={() => setSettingsVisible(false)}
        onOpenFullProfile={() => setProfileVisible(true)}
        onLogout={logout}
        onExportBackup={exportBackupJson}
        onImportBackup={importBackupJson}
      />

      {/* MODAL GHI NHẬN CHUYỂN VÀO / RÚT RA QUỸ MỤC TIÊU MOMO */}
      <Modal
        visible={momoTxModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setMomoTxModal({ visible: false, goal: null, type: 'IN' })}
      >
        <View style={[styles.mediaModalBackdrop, { backgroundColor: colors.backdrop }]}>
          <View style={[styles.mediaModalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardMainTitle, { color: colors.textPrimary, marginBottom: 4 }]}>
              {momoTxModal.type === 'IN'
                ? 'Chuyển tiền vào Quỹ mục tiêu'
                : 'Rút tiền từ Quỹ mục tiêu'}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
              Mục tiêu: {momoTxModal.goal?.title}
            </Text>

            <TextInput
              style={[
                styles.qaInput,
                { borderColor: colors.outline, color: colors.textPrimary, marginBottom: 10 },
              ]}
              keyboardType="numeric"
              placeholder="Nhập số tiền (VD: 200000)"
              placeholderTextColor={colors.textSecondary}
              value={txAmountInput}
              onChangeText={(t) => setTxAmountInput(t.replace(/[^0-9]/g, ''))}
            />

            <TextInput
              style={[styles.qaInput, { borderColor: colors.outline, color: colors.textPrimary }]}
              placeholder="Nội dung giao dịch (VD: Góp quỹ tháng 10)"
              placeholderTextColor={colors.textSecondary}
              value={txNoteInput}
              onChangeText={setTxNoteInput}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.surfaceVariant, flex: 1 }]}
                onPress={() => setMomoTxModal({ visible: false, goal: null, type: 'IN' })}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 12 }}>
                  Hủy
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.addBtn,
                  {
                    backgroundColor: momoTxModal.type === 'IN' ? '#A50064' : colors.error,
                    flex: 1.5,
                  },
                ]}
                onPress={async () => {
                  const num = Number(txAmountInput);
                  if (!momoTxModal.goal || !num || num <= 0) {
                    Alert.alert('Số tiền chưa hợp lệ', 'Vui lòng nhập số tiền lớn hơn 0.');
                    return;
                  }
                  await recordGoalMomoTransaction(
                    momoTxModal.goal.id,
                    momoTxModal.type,
                    num,
                    txNoteInput,
                  );
                  setMomoTxModal({ visible: false, goal: null, type: 'IN' });
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                  {momoTxModal.type === 'IN' ? 'Cộng vào mục tiêu' : 'Trừ khỏi mục tiêu'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <EventAndGoalFormModal
        visible={formModal.visible}
        mode={formModal.mode}
        initialEventCategory={formModal.initialEventCategory}
        colors={colors}
        editingEvent={formModal.editingEvent}
        editingGoal={formModal.editingGoal}
        onClose={() => setFormModal((prev) => ({ ...prev, visible: false }))}
        onSaveEvent={saveEvent}
        onSaveGoal={saveGoal}
      />

      <LocketReactionSheet
        visible={Boolean(reactionSnap)}
        snap={reactionSnap}
        colors={colors}
        viewerId={currentUserId}
        onDeleteSnap={handleDeleteLocketSnap}
        onClose={closeReactionSheet}
      />

      {/* MODAL TẠO DANH MỤC ALBUM MỚI */}
      <Modal
        visible={createCategoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateCategoryModalVisible(false)}
      >
        <View style={[styles.mediaModalBackdrop, { backgroundColor: colors.backdrop }]}>
          <View style={[styles.mediaModalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardMainTitle, { color: colors.textPrimary, marginBottom: 4 }]}>
              📁 Tạo danh mục Album mới
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
              Đặt tên danh mục để phân loại ảnh & video kỷ niệm (VD: Đi Đà Lạt, Kỷ niệm 1 năm...).
            </Text>

            <TextInput
              style={[
                styles.qaInput,
                { borderColor: colors.outline, color: colors.textPrimary },
              ]}
              placeholder="Nhập tên danh mục..."
              placeholderTextColor={colors.textSecondary}
              value={newCategoryNameInput}
              onChangeText={setNewCategoryNameInput}
              autoFocus
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.surfaceVariant, flex: 1 }]}
                onPress={() => {
                  setNewCategoryNameInput('');
                  setCreateCategoryModalVisible(false);
                }}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 12 }}>
                  Hủy
                </Text>
              </Pressable>

              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.primary, flex: 1.5 }]}
                onPress={() => void handleCreateAlbumCategory()}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                  Tạo danh mục
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL XEM CHI TIẾT ẢNH / VIDEO & CHUYỂN DANH MỤC */}
      <Modal
        visible={!!selectedMedia}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMedia(null)}
      >
        <View style={[styles.mediaModalBackdrop, { backgroundColor: colors.backdrop }]}>
          <View style={[styles.mediaModalCard, { backgroundColor: colors.surface }]}>
            {selectedMedia?.mediaType === 'IMAGE' && (
              <ExpoImage
                source={{ uri: selectedMedia.remoteUrl || selectedMedia.uri }}
                style={styles.fullPreviewImage}
                contentFit="contain"
                allowDownscaling={false}
                transition={200}
                cachePolicy="memory-disk"
              />
            )}

            {selectedMedia?.mediaType === 'VIDEO' && (
              <InlineVideoPlayer uri={selectedMedia.remoteUrl || selectedMedia.uri} />
            )}

            <Text
              style={[
                styles.cardMainTitle,
                { color: colors.textPrimary, textAlign: 'center', marginTop: 12 },
              ]}
            >
              {selectedMedia?.caption}
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                textAlign: 'center',
                marginTop: 4,
              }}
            >
              {selectedMedia?.createdAt}
            </Text>

            {/* CHỌN / ĐỔI DANH MỤC CHO TỆP NÀY */}
            <View style={{ marginTop: 12 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.textSecondary,
                  marginBottom: 6,
                }}
              >
                📁 Chuyển vào danh mục:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6 }}
              >
                {albumCategories.map((cat) => {
                  const currentCat = selectedMedia
                    ? itemCategoryMap[selectedMedia.id] ||
                      (selectedMedia.remoteUrl
                        ? itemCategoryMap[selectedMedia.remoteUrl]
                        : undefined) ||
                      selectedMedia.albumCategory
                    : undefined;
                  const isAssigned = currentCat === cat;
                  return (
                    <Pressable
                      key={cat}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 12,
                        backgroundColor: isAssigned ? colors.primary : colors.surfaceVariant,
                      }}
                      onPress={() => {
                        if (selectedMedia) {
                          const nextCat = isAssigned ? 'ALL' : cat;
                          void assignMediaToCategory(
                            selectedMedia.id,
                            nextCat,
                            selectedMedia.remoteUrl,
                          );
                          setSelectedMedia((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  albumCategory: nextCat === 'ALL' ? undefined : nextCat,
                                }
                              : null,
                          );
                        }
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: isAssigned ? '#FFFFFF' : colors.textPrimary,
                        }}
                      >
                        {isAssigned ? `✓ ${cat}` : cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => {
                  if (selectedMedia) {
                    void handleDownloadMedia(selectedMedia);
                  }
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 12 }}>
                  ⬇ Tải về
                </Text>
              </Pressable>

              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.errorContainer, flex: 1 }]}
                onPress={() => {
                  if (selectedMedia) {
                    void handleDeleteAlbumMedia(selectedMedia.id);
                    setSelectedMedia(null);
                  }
                }}
              >
                <Text style={{ color: colors.error, fontWeight: '600', fontSize: 12 }}>
                  Xóa vĩnh viễn
                </Text>
              </Pressable>

              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.surfaceVariant, flex: 1 }]}
                onPress={() => setSelectedMedia(null)}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 12 }}>
                  Đóng
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  lockScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  lockTitle: { fontSize: 19, fontWeight: '700', marginBottom: 6 },
  pinInputBox: {
    width: 170,
    height: 52,
    borderWidth: 1.5,
    borderRadius: 12,
    fontSize: 26,
    textAlign: 'center',
    letterSpacing: 12,
    fontWeight: '700',
  },
  topBar: {
    paddingHorizontal: METRICS.paddingHorizontal,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarProfileBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  miniAvatarImg: { width: '100%', height: '100%' },
  brandTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  pageSwitchTrack: {
    flexDirection: 'row',
    height: 34,
    borderRadius: 14,
    padding: PAGE_SWITCH_PADDING,
  },
  pageSwitchThumb: {
    position: 'absolute',
    top: PAGE_SWITCH_PADDING,
    bottom: PAGE_SWITCH_PADDING,
    left: PAGE_SWITCH_PADDING,
    borderRadius: 11,
  },
  pageSwitchItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 11,
  },
  settingsBtn: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtnText: { fontSize: 12, fontWeight: '600' },
  scrollContent: {
    paddingHorizontal: METRICS.paddingHorizontal,
    paddingTop: 12,
    paddingBottom: 32,
  },
  gridTabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginBottom: 18,
  },
  gridTabItem: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridTabItemActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  sectionWrap: { marginBottom: 28 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mediaButtonGroup: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  quickUploadBar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  quickUploadBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  quickUploadBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  folderScrollContainer: {
    gap: 8,
    paddingBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  emptyCard: {
    borderRadius: METRICS.radiusMd,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  itemCard: {
    borderRadius: METRICS.radiusMd,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  eventMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  daysLeftBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: 96,
  },
  subtleReminderNote: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardBottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  eventActionBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexShrink: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardMainTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  goalCheckRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalProgressSection: { marginTop: 10 },
  progressBarBg: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  qaFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  qaTopicChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  randomRollBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  qaQuestionText: { fontSize: 15, fontWeight: '600', marginTop: 6, lineHeight: 22 },
  qaBubble: { padding: 12, borderRadius: 10 },
  qaInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  iosSheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
  iosSheetBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  iosSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  mediaModalBackdrop: { flex: 1, justifyContent: 'center', padding: 18 },
  mediaModalCard: { borderRadius: 18, padding: 16 },
  fullPreviewImage: {
    width: '100%',
    height: 420,
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  inlineVideoBox: {
    width: '100%',
    height: 360,
    borderRadius: 12,
    backgroundColor: '#000000',
  },
  mediaFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  mediaFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
});