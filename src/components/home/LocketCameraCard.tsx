// src/components/home/LocketCameraCard.tsx
import React, { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  AppState,
  AppStateStatus,
  Linking,
  ActivityIndicator,
  Image,
  Alert,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ThemeColors, METRICS } from '../../constants/theme';
import { useSettingsStore } from '../../store/useSettingsStore';
import {
  ChevronDownIcon,
  CloseIcon,
  FlashIcon,
  FlipIcon,
  GalleryIcon,
  HeartIcon,
  PencilIcon,
  SendIcon,
} from './LocketIcons';

type FlashChoice = 'off' | 'auto' | 'on';

const FLASH_CYCLE: ReadonlyArray<FlashChoice> = ['off', 'auto', 'on'];
const FLASH_LABEL: Record<FlashChoice, string> = {
  off: 'Flash đang tắt, chạm để chuyển sang tự động',
  auto: 'Flash tự động, chạm để bật',
  on: 'Flash đang bật, chạm để tắt',
};

const GLASS = 'rgba(24, 14, 18, 0.42)';
const CAPTION_MAX = 80;
const FRAME_PAD = 5;
const FRAME_BORDER = 1.5;
const SIDE_BTN = 56;
const HALO = 100;
const RING = 84;
const CORE = 66;

export interface LocketStampItem {
  id: string;
  icon: string;
  label: string;
}

interface LocketCameraCardProps {
  colors: ThemeColors;
  isPageActive: boolean;
  stamps: Array<LocketStampItem | string>;
  onCapturePhotoUri: (uri: string, stamp: string, caption: string) => Promise<void>;
  onPickFromGallery: (stamp: string, caption: string) => Promise<void>;
  onSwipeToDashboard: () => void;
  onPagerLockChange?: (locked: boolean) => void;
  /** Chiều cao header + tab + inset đáy của trang cha. Dùng để khung camera chiếm đủ màn hình đầu. */
  reservedHeight?: number;
  /** Nếu truyền vào, chạm dòng "Nhật ký Locket" sẽ gọi hàm này (ví dụ scrollTo của trang cha). */
  onScrollToJournal?: () => void;
}

/* ------------------------------------------------------------------ */
/* Nút kính mờ đặt trên khung camera                                    */
/* ------------------------------------------------------------------ */

interface GlassButtonProps {
  onPress: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}

const GlassButton = memo(function GlassButton({
  onPress,
  label,
  disabled = false,
  children,
}: GlassButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.glassBtn,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Nút tròn hai bên nút chụp                                            */
/* ------------------------------------------------------------------ */

interface SideButtonProps {
  onPress: () => void;
  label: string;
  bg: string;
  disabled?: boolean;
  children: React.ReactNode;
}

const SideButton = memo(function SideButton({
  onPress,
  label,
  bg,
  disabled = false,
  children,
}: SideButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sideBtn,
        { backgroundColor: bg },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
});

interface FlipButtonProps {
  facing: CameraType;
  onPress: () => void;
  bg: string;
  color: string;
  disabled: boolean;
}

// Icon xoay nửa vòng mỗi lần đổi camera. Chỉ dùng transform nên chạy trên native driver.
const FlipButton = memo(function FlipButton({
  facing,
  onPress,
  bg,
  color,
  disabled,
}: FlipButtonProps) {
  const turns = useRef(new Animated.Value(facing === 'back' ? 1 : 0)).current;

  useEffect(() => {
    const spring = Animated.spring(turns, {
      toValue: facing === 'back' ? 1 : 0,
      speed: 14,
      bounciness: 6,
      useNativeDriver: true,
    });
    spring.start();
    return () => spring.stop();
  }, [facing, turns]);

  const rotate = turns.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <SideButton
      onPress={onPress}
      disabled={disabled}
      bg={bg}
      label={facing === 'front' ? 'Đổi sang camera sau' : 'Đổi sang camera trước'}
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <FlipIcon size={28} color={color} />
      </Animated.View>
    </SideButton>
  );
});

/* ------------------------------------------------------------------ */
/* Nút chụp / gửi: quầng hồng, vành đậm, lõi tim                         */
/* ------------------------------------------------------------------ */

interface ShutterButtonProps {
  variant: 'capture' | 'send';
  busy: boolean;
  disabled: boolean;
  color: string;
  halo: string;
  label: string;
  onPress: () => void;
}

const ShutterButton = memo(function ShutterButton({
  variant,
  busy,
  disabled,
  color,
  halo,
  label,
  onPress,
}: ShutterButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (to: number) => {
      Animated.spring(scale, {
        toValue: to,
        speed: 30,
        bounciness: 4,
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  useEffect(() => {
    return () => scale.stopAnimation();
  }, [scale]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animateTo(0.9)}
      onPressOut={() => animateTo(1)}
    >
      <Animated.View
        style={[
          styles.halo,
          { backgroundColor: halo, opacity: disabled && !busy ? 0.55 : 1 },
          { transform: [{ scale }] },
        ]}
      >
        <View style={[styles.ring, { borderColor: color }]}>
          <View style={[styles.core, { backgroundColor: color }]}>
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : variant === 'send' ? (
              <SendIcon size={28} color="#FFFFFF" />
            ) : (
              <HeartIcon size={30} color="#FFFFFF" />
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Màn hình chính                                                       */
/* ------------------------------------------------------------------ */
/**
 * Trên Web (Mobile Chrome / Safari), tự động:
 * 1. Đưa mức phần cứng zoom của track về mức nhỏ nhất / 1x (tránh bị kẹt zoom 2x).
 * 2. Yêu cầu tỷ lệ khung hình 1:1 từ cảm biến để không bị crop phóng to bởi object-fit: cover.
 */
async function normalizeWebCameraStreamTo1x(facingMode: CameraType) {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !navigator?.mediaDevices) {
    return;
  }

  try {
    const videos = Array.from(document.querySelectorAll('video'));
    const activeVideo = videos.find((v) => v.srcObject instanceof MediaStream);
    if (!activeVideo) return;

    // Đảm bảo thẻ video hiển thị mượt và không bị phóng đại thừa
    activeVideo.style.objectFit = 'cover';
    activeVideo.style.transform = facingMode === 'front' ? 'scaleX(-1)' : 'none';

    const currentStream = activeVideo.srcObject as MediaStream | null;
    const currentTrack = currentStream?.getVideoTracks?.()[0];

    // Nếu đang ở camera sau, kiểm tra danh sách thiết bị để tránh chọn nhầm ống kính Tele / Macro
    if (facingMode === 'back' && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const backCameras = devices.filter(
        (d) =>
          d.kind === 'videoinput' &&
          /(back|rear|environment|sau|0)/i.test(d.label) &&
          !/(tele|zoom|macro|depth)/i.test(d.label),
      );

      // Ống kính chính (1x) trên Android/iOS luôn là camera sau đầu tiên trong danh sách chuẩn
      const preferredMainCam = backCameras[0];
      const currentDeviceId = currentTrack?.getSettings?.().deviceId;

      if (preferredMainCam && currentDeviceId && preferredMainCam.deviceId !== currentDeviceId) {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: { exact: preferredMainCam.deviceId },
            aspectRatio: { ideal: 1 },
            width: { ideal: 1080 },
            height: { ideal: 1080 },
          },
        });
        currentStream?.getTracks().forEach((t) => t.stop());
        activeVideo.srcObject = newStream;
        await activeVideo.play().catch(() => null);
        return;
      }
    }

    // Nếu đã đúng ống kính chính, ép mức zoom phần cứng về 1x và khung hình 1:1
    if (currentTrack && typeof currentTrack.applyConstraints === 'function') {
      const caps = (currentTrack.getCapabilities?.() || {}) as Record<string, any>;
      const advanced: Record<string, any> = {};
      if (caps.zoom) {
        advanced.zoom = caps.zoom.min <= 1 && caps.zoom.max >= 1 ? 1 : caps.zoom.min || 1;
      }

      await currentTrack.applyConstraints({
        aspectRatio: { ideal: 1 },
        width: { ideal: 1080 },
        height: { ideal: 1080 },
        ...(Object.keys(advanced).length > 0 ? { advanced: [advanced] } : {}),
      } as MediaTrackConstraints);
    }
  } catch {
    // Bỏ qua nếu trình duyệt chặn quyền enumerateDevices
  }
}
const LocketCameraCardInner: React.FC<LocketCameraCardProps> = ({
  colors,
  isPageActive,
  stamps,
  onCapturePhotoUri,
  onPickFromGallery,
  onSwipeToDashboard,
  onPagerLockChange,
  reservedHeight = 150,
  onScrollToJournal,
}) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const frameInset = (FRAME_PAD + FRAME_BORDER) * 2;
  const viewportSize = Math.max(
    260,
    Math.round(screenWidth - METRICS.paddingHorizontal * 2 - frameInset),
  );
  const stageMinHeight = Math.max(560, screenHeight - reservedHeight);

  const { myProfile, partnerProfile, updateProfiles } = useSettingsStore();

  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [flash, setFlash] = useState<FlashChoice>('off');
  const [isAppActive, setIsAppActive] = useState<boolean>(AppState.currentState === 'active');
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const initialStampText = useMemo(() => {
    if (myProfile.customStatusText) return myProfile.customStatusText;
    const first = stamps[0];
    if (typeof first === 'object') return `${first.icon} ${first.label}`;
    return first || '💕 Đang nhớ đằng ấy';
  }, [myProfile.customStatusText, stamps]);

  const [selectedStamp, setSelectedStamp] = useState<string>(initialStampText);
  const [caption, setCaption] = useState<string>('');

  const cameraRef = useRef<CameraView | null>(null);
  const pagerLockRef = useRef(onPagerLockChange);
  const autoAskedRef = useRef(false);
  const grantedRef = useRef(false);
  grantedRef.current = Boolean(permission?.granted);

  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pagerLockRef.current = onPagerLockChange;
  }, [onPagerLockChange]);

  useEffect(() => {
    return () => {
      pagerLockRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    if (!isPageActive) pagerLockRef.current?.(false);
  }, [isPageActive]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      setIsAppActive(nextState === 'active');
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // Tự hỏi quyền đúng một lần. Những lần sau người dùng chạm nút trong khung camera.
  useEffect(() => {
    if (autoAskedRef.current) return;
    if (isPageActive && permission && !permission.granted && permission.canAskAgain) {
      autoAskedRef.current = true;
      void requestPermission();
    }
  }, [isPageActive, permission, requestPermission]);

  // Quay lại từ Cài đặt hệ thống: đọc lại trạng thái quyền, hook không tự làm việc này.
  useEffect(() => {
    if (isAppActive && !grantedRef.current) void getPermission();
  }, [isAppActive, getPermission]);

  // Mũi tên nhún nhẹ chỉ chạy khi trang đang hiện và app ở foreground.
  useEffect(() => {
    if (!isPageActive || !isAppActive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 3, duration: 700, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      bounce.setValue(0);
    };
  }, [isPageActive, isAppActive, bounce]);

  const shouldMountCamera = Boolean(
    permission?.granted && isPageActive && isAppActive && !previewUri && !cameraError,
  );

  useEffect(() => {
    if (!shouldMountCamera) setIsCameraReady(false);
  }, [shouldMountCamera]);

  const lockPager = useCallback(() => {
    pagerLockRef.current?.(true);
  }, []);

  const unlockPager = useCallback(() => {
    pagerLockRef.current?.(false);
  }, []);

  const handleSelectStatusStamp = useCallback(
    (stampText: string) => {
      void Haptics.selectionAsync().catch(() => {});
      setSelectedStamp(stampText);
      void updateProfiles({
        customStatusText: stampText,
        lastActiveAt: 'Vừa cập nhật',
      });
    },
    [updateProfiles],
  );

  const handleFlipCamera = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    setIsCameraReady(false);
    setFacing((cur) => (cur === 'front' ? 'back' : 'front'));
  }, []);

  const handleFlashCycle = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    setFlash((cur) => FLASH_CYCLE[(FLASH_CYCLE.indexOf(cur) + 1) % FLASH_CYCLE.length]);
  }, []);

  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
    if (Platform.OS === 'web') {
      void normalizeWebCameraStreamTo1x(facing);
    }
  }, [facing]);

  const handleMountError = useCallback((e: { message?: string }) => {
    setIsCameraReady(false);
    setCameraError(e?.message || 'Không mở được ống kính.');
  }, []);

  const handleTakePicture = useCallback(async () => {
    if (!cameraRef.current || isCapturing || !isCameraReady) return;
    try {
      setIsCapturing(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        setPreviewUri(photo.uri);
      }
    } catch {
      Alert.alert('Chưa chụp được ảnh', 'Ống kính đang bận hoặc bị gián đoạn. Hãy thử chụp lại.');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, isCameraReady]);

  const handleRetake = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    setPreviewUri(null);
  }, []);

  const handleConfirmSendPreview = useCallback(async () => {
    if (!previewUri || isSending) return;
    setIsSending(true);
    try {
      await updateProfiles({
        customStatusText: selectedStamp,
        lastActiveAt: 'Vừa đăng Locket',
      });
      await onCapturePhotoUri(previewUri, selectedStamp, caption);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPreviewUri(null);
      setCaption('');
    } catch {
      Alert.alert('Chưa gửi được Locket', 'Ảnh vẫn còn ở khung xem trước, bạn thử gửi lại nhé.');
    } finally {
      setIsSending(false);
    }
  }, [previewUri, isSending, onCapturePhotoUri, selectedStamp, caption, updateProfiles]);

  const handlePickGallery = useCallback(async () => {
    try {
      await updateProfiles({ customStatusText: selectedStamp });
      await onPickFromGallery(selectedStamp, caption);
      setCaption('');
    } catch {
      Alert.alert('Chưa mở được thư viện', 'Hãy kiểm tra quyền truy cập ảnh rồi thử lại.');
    }
  }, [onPickFromGallery, selectedStamp, caption, updateProfiles]);

  const granted = Boolean(permission?.granted);
  const cameraWarmingUp = shouldMountCamera && !isCameraReady;
  const showCameraChrome = granted && !previewUri && !cameraError;
  const bounceStyle = { transform: [{ translateY: bounce }] };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, minHeight: stageMinHeight }]}>
      {/* Hàng trạng thái hai người */}
      <View style={styles.coupleStrip}>
        <View style={styles.personBox}>
          <View style={[styles.avatar, { backgroundColor: colors.primaryContainer }]}>
            <Text style={styles.avatarEmoji}>{myProfile.moodEmoji}</Text>
          </View>
          <View style={styles.personText}>
            <Text style={[styles.personName, { color: colors.textPrimary }]} numberOfLines={1}>
              {myProfile.nickname}
            </Text>
            <Text style={[styles.personStatus, { color: colors.primary }]} numberOfLines={1}>
              {selectedStamp}
            </Text>
          </View>
        </View>

        <HeartIcon size={14} color={colors.primary} />

        <View style={styles.personBox}>
          <View style={[styles.avatar, { backgroundColor: colors.surfaceVariant }]}>
            <Text style={styles.avatarEmoji}>{partnerProfile.moodEmoji}</Text>
          </View>
          <View style={styles.personText}>
            <Text style={[styles.personName, { color: colors.textPrimary }]} numberOfLines={1}>
              {partnerProfile.nickname}
            </Text>
            <Text
              style={[styles.personStatus, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {partnerProfile.customStatusText || 'Trực tuyến'}
            </Text>
          </View>
        </View>
      </View>

      {/* Khung camera */}
      <View
        style={[
          styles.frame,
          {
            backgroundColor: colors.surface,
            borderColor: colors.primaryContainer,
            shadowColor: colors.primary,
          },
        ]}
      >
        <View
          style={[
            styles.viewport,
            { width: viewportSize, height: viewportSize, backgroundColor: colors.surfaceVariant },
          ]}
        >
          {!permission ? (
            <View style={styles.fallback}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : !permission.granted ? (
            <View style={styles.fallback}>
              <Text style={[styles.fallbackTitle, { color: colors.textPrimary }]}>
                Chưa cấp quyền Máy ảnh
              </Text>
              <Text style={[styles.fallbackDesc, { color: colors.textSecondary }]}>
                Cấp quyền máy ảnh để chụp và gửi khoảnh khắc trực tiếp.
              </Text>
              <Pressable
                accessibilityRole="button"
                style={[styles.fallbackBtn, { backgroundColor: colors.primary }]}
                onPress={() =>
                  permission.canAskAgain ? void requestPermission() : void Linking.openSettings()
                }
              >
                <Text style={styles.fallbackBtnText}>
                  {permission.canAskAgain ? 'Cho phép truy cập Máy ảnh' : 'Mở Cài đặt hệ thống'}
                </Text>
              </Pressable>
            </View>
          ) : previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={{ width: viewportSize, height: viewportSize }}
              resizeMode="cover"
              resizeMethod="resize"
              fadeDuration={0}
            />
          ) : cameraError ? (
            <View style={styles.fallback}>
              <Text style={[styles.fallbackTitle, { color: colors.textPrimary }]}>
                Không mở được ống kính
              </Text>
              <Text style={[styles.fallbackDesc, { color: colors.textSecondary }]}>
                {cameraError}
              </Text>
              <Pressable
                accessibilityRole="button"
                style={[styles.fallbackBtn, { backgroundColor: colors.primary }]}
                onPress={() => setCameraError(null)}
              >
                <Text style={styles.fallbackBtnText}>Thử mở lại</Text>
              </Pressable>
            </View>
          ) : shouldMountCamera ? (
            <CameraView
              ref={cameraRef}
              style={{ width: viewportSize, height: viewportSize }}
              facing={facing}
              flash={flash}
               zoom={0}
              mirror={facing === 'front'}
              mode="picture"
              onCameraReady={handleCameraReady}
              onMountError={handleMountError}
            />
          ) : (
            <View style={styles.fallback}>
              <Text style={[styles.fallbackDesc, { color: colors.textSecondary }]}>
                Đang tạm dừng ống kính
              </Text>
            </View>
          )}

          {/* Lớp phủ phía trên: nhãn trạng thái bên trái, flash bên phải */}
          {granted && (
            <View style={styles.overlayTop} pointerEvents="box-none">
              <View
                style={[
                  styles.stampBadge,
                  { backgroundColor: colors.primary, maxWidth: viewportSize - 12 * 2 - 44 - 10 },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.stampBadgeText} numberOfLines={1}>
                  {selectedStamp}
                </Text>
              </View>

              {showCameraChrome && (
                <GlassButton onPress={handleFlashCycle} label={FLASH_LABEL[flash]}>
                  <FlashIcon mode={flash} size={24} />
                </GlassButton>
              )}
            </View>
          )}

          {/* Lời nhắn đè trực tiếp lên ảnh */}
          {granted && (
            <View style={styles.overlayBottom} pointerEvents="box-none">
              <View style={styles.captionPill}>
                <PencilIcon size={14} color="#FFFFFF" />
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="Thêm lời nhắn"
                  placeholderTextColor="rgba(255, 255, 255, 0.65)"
                  maxLength={CAPTION_MAX}
                  returnKeyType="done"
                  blurOnSubmit
                  style={styles.captionInlineInput}
                  selectionColor={colors.primary}
                />
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Hàng nút: thư viện, chụp, đổi camera (hoặc chụp lại, gửi) */}
      <View style={styles.shutterSection}>
        <View style={styles.shutterRow}>
          {previewUri ? (
            <SideButton
              onPress={handleRetake}
              disabled={isSending}
              bg={colors.surfaceVariant}
              label="Chụp lại"
            >
              <CloseIcon size={24} color={colors.textPrimary} />
            </SideButton>
          ) : (
            <SideButton
              onPress={() => void handlePickGallery()}
              bg={colors.surfaceVariant}
              label="Chọn ảnh từ thư viện"
            >
              <GalleryIcon size={28} color={colors.textPrimary} />
            </SideButton>
          )}

          {previewUri ? (
            <ShutterButton
              variant="send"
              busy={isSending}
              disabled={isSending}
              color={colors.primary}
              halo={colors.primaryContainer}
              label="Gửi Locket"
              onPress={() => void handleConfirmSendPreview()}
            />
          ) : (
            <ShutterButton
              variant="capture"
              busy={isCapturing || cameraWarmingUp}
              disabled={!granted || isCapturing || !isCameraReady}
              color={colors.primary}
              halo={colors.primaryContainer}
              label={isCameraReady ? 'Chụp ảnh' : 'Đang mở ống kính'}
              onPress={() => void handleTakePicture()}
            />
          )}

          {previewUri ? (
            <View style={styles.sideSpacer} />
          ) : (
            <FlipButton
              facing={facing}
              onPress={handleFlipCamera}
              disabled={!granted}
              bg={colors.surfaceVariant}
              color={colors.textPrimary}
            />
          )}
        </View>

        {previewUri ? (
          <Text style={[styles.sendLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            Gửi cho {partnerProfile.nickname}
          </Text>
        ) : null}
      </View>

      {/* Chọn trạng thái đính lên ảnh */}
      <Text style={[styles.fieldHintLabel, { color: colors.textSecondary }]}>
        Trạng thái đính lên ảnh
      </Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.stampScrollOuter}
        contentContainerStyle={styles.stampScroll}
        onTouchStart={lockPager}
        onTouchEnd={unlockPager}
        onTouchCancel={unlockPager}
        onScrollEndDrag={unlockPager}
        onMomentumScrollEnd={unlockPager}
      >
        {stamps.map((st) => {
          const icon = typeof st === 'object' ? st.icon : '';
          const label = typeof st === 'object' ? st.label : st;
          const key = typeof st === 'object' ? st.id : st;
          const fullText = icon ? `${icon} ${label}` : label;
          const active = selectedStamp === fullText || selectedStamp === label;

          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.stampChip,
                { backgroundColor: active ? colors.primary : colors.surfaceVariant },
              ]}
              onPress={() => handleSelectStatusStamp(fullText)}
            >
              <Text
                style={[styles.stampChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}
              >
                {fullText}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Chân trang: gợi ý kéo xuống xem nhật ký, đường sang Ngày yêu */}
      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole={onScrollToJournal ? 'button' : undefined}
          accessibilityLabel="Kéo xuống để xem Nhật ký Locket"
          disabled={!onScrollToJournal}
          onPress={onScrollToJournal}
          style={styles.footerItem}
        >
          <Animated.View style={bounceStyle}>
            <ChevronDownIcon size={16} color={colors.textSecondary} />
          </Animated.View>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>Nhật ký Locket</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Xem Ngày yêu và Lịch hẹn"
          onPress={onSwipeToDashboard}
          style={styles.footerItem}
        >
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Ngày yêu & Lịch hẹn ›
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

export const LocketCameraCard = memo(LocketCameraCardInner);

const styles = StyleSheet.create({
  root: {
    marginHorizontal: -METRICS.paddingHorizontal,
    paddingHorizontal: METRICS.paddingHorizontal,
    paddingTop: 10,
    paddingBottom: 8,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },

  coupleStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  personBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: { fontSize: 16 },
  personText: { flex: 1 },
  personName: { fontSize: 12, fontWeight: '700' },
  personStatus: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  frame: {
    alignSelf: 'center',
    padding: FRAME_PAD,
    borderWidth: FRAME_BORDER,
    borderRadius: 34,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  viewport: {
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },

  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fallbackTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  fallbackDesc: { fontSize: 13, textAlign: 'center', marginBottom: 14, lineHeight: 18 },
  fallbackBtn: {
    minHeight: METRICS.minTouchTarget,
    paddingHorizontal: 18,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  overlayTop: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 10,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stampBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  stampBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GLASS,
    justifyContent: 'center',
    alignItems: 'center',
  },

  overlayBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 10,
    elevation: 6,
    alignItems: 'center',
  },
  captionPill: {
    maxWidth: '90%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
    borderRadius: 20,
    backgroundColor: GLASS,
  },
  captionInlineInput: {
    flexShrink: 1,
    minWidth: 100,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
  },

  shutterSection: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
  },
  shutterRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  sideBtn: {
    width: SIDE_BTN,
    height: SIDE_BTN,
    borderRadius: SIDE_BTN / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideSpacer: { width: SIDE_BTN, height: SIDE_BTN },
  halo: {
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  core: {
    width: CORE,
    height: CORE,
    borderRadius: CORE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendLabel: { marginTop: 8, fontSize: 12, fontWeight: '600' },

  fieldHintLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  stampScrollOuter: { alignSelf: 'stretch', flexGrow: 0 },
  stampScroll: { gap: 8, paddingVertical: 4, paddingRight: 4 },
  stampChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stampChipText: { fontSize: 12, fontWeight: '700' },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  footerItem: {
    minHeight: METRICS.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: { fontSize: 12, fontWeight: '600' },
});