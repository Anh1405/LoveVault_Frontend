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

const GLASS = 'rgba(24, 14, 18, 0.44)';
const CAPTION_MAX = 80;
const SIDE_BTN = 54;
const HALO = 94;
const RING = 82;
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
  reservedHeight?: number;
  onScrollToJournal?: () => void;
}

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
      hitSlop={6}
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

interface WebLensConfig {
  allBackCams: MediaDeviceInfo[];
  activeCamId: string | null;
  modeLabel: '0.5x' | '1x';
}

async function applySafeWebCamera(
  facingMode: CameraType,
  requestedMode: '0.5x' | '1x',
): Promise<WebLensConfig> {
  const fallback: WebLensConfig = { allBackCams: [], activeCamId: null, modeLabel: '1x' };

  if (Platform.OS !== 'web' || typeof document === 'undefined' || !navigator?.mediaDevices) {
    return fallback;
  }

  await new Promise((r) => setTimeout(r, 150));

  try {
    const videos = Array.from(document.querySelectorAll('video'));
    const activeVideo = videos.find((v) => v.srcObject instanceof MediaStream);
    if (!activeVideo) return fallback;

    activeVideo.style.objectFit = 'cover';
    activeVideo.style.width = '100%';
    activeVideo.style.height = '100%';
    activeVideo.style.transform = facingMode === 'front' ? 'scaleX(-1)' : 'none';

    const currentStream = activeVideo.srcObject as MediaStream | null;

    let videoDevices: MediaDeviceInfo[] = [];
    if (navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter((d) => d.kind === 'videoinput');
    }

    const backCams = videoDevices.filter(
      (d) =>
        /(back|rear|environment|sau)/i.test(d.label) && !/(tele|depth|mono)/i.test(d.label),
    );
    const availableCams = backCams.length > 0 ? backCams : videoDevices;

    if (facingMode === 'back' && availableCams.length > 0) {
      let targetCam = availableCams[0];
      if (requestedMode === '0.5x' && availableCams.length > 1) {
        targetCam =
          availableCams.find((d) => /(ultra|0\.5|wide angle|back 1)/i.test(d.label)) ||
          availableCams[1];
      } else if (requestedMode === '1x') {
        targetCam =
          availableCams.find((d) => /(main|primary|back 0| 0 )/i.test(d.label)) ||
          availableCams[0];
      }

      const currentTrack = currentStream?.getVideoTracks()?.[0];
      const currentId = currentTrack?.getSettings?.().deviceId;

      if (targetCam && targetCam.deviceId && targetCam.deviceId !== currentId) {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              deviceId: { exact: targetCam.deviceId },
            },
          });
          currentStream?.getTracks().forEach((t) => t.stop());
          activeVideo.srcObject = newStream;
          await activeVideo.play().catch(() => null);
        } catch {
          // Bỏ qua lỗi đổi phần cứng để tránh crash app
        }
      }
    }

    const finalTrack = (activeVideo.srcObject as MediaStream)?.getVideoTracks()?.[0];
    const finalId = finalTrack?.getSettings?.().deviceId || null;
    const isUltra = availableCams.find((d) => d.deviceId === finalId && /(ultra|0\.5)/i.test(d.label));

    return {
      allBackCams: availableCams,
      activeCamId: finalId,
      modeLabel: isUltra ? '0.5x' : requestedMode,
    };
  } catch {
    return fallback;
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

  const sideMargin = 8;
  const viewportSize = Math.min(440, Math.max(300, Math.round(screenWidth - sideMargin * 2)));
  const nativeSensorHeight = Math.round((viewportSize * 4) / 3);
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

  const [webCamList, setWebCamList] = useState<MediaDeviceInfo[]>([]);
  const [lensMode, setLensMode] = useState<'0.5x' | '1x'>('1x');

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

  useEffect(() => {
    if (autoAskedRef.current) return;
    if (isPageActive && permission && !permission.granted && permission.canAskAgain) {
      autoAskedRef.current = true;
      void requestPermission();
    }
  }, [isPageActive, permission, requestPermission]);

  useEffect(() => {
    if (isAppActive && !grantedRef.current) void getPermission();
  }, [isAppActive, getPermission]);

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
    setCameraError(null);
    setFacing((cur) => (cur === 'front' ? 'back' : 'front'));
  }, []);

  const handleFlashCycle = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    setFlash((cur) => FLASH_CYCLE[(FLASH_CYCLE.indexOf(cur) + 1) % FLASH_CYCLE.length]);
  }, []);

  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
    setCameraError(null);
    if (Platform.OS === 'web') {
      void applySafeWebCamera(facing, lensMode).then((res) => {
        if (res.allBackCams.length > 0) setWebCamList(res.allBackCams);
        setLensMode(res.modeLabel);
      });
    }
  }, [facing, lensMode]);

  const handleToggleZoomLens = useCallback(async () => {
    if (Platform.OS !== 'web' || facing === 'front') return;
    void Haptics.selectionAsync().catch(() => {});
    const nextMode = lensMode === '1x' ? '0.5x' : '1x';
    setLensMode(nextMode);

    const res = await applySafeWebCamera('back', nextMode);
    if (res.allBackCams.length > 0) setWebCamList(res.allBackCams);
    setLensMode(res.modeLabel);
  }, [facing, lensMode]);

  const handleMountError = useCallback((e: { message?: string }) => {
    setIsCameraReady(false);
    setCameraError(e?.message || 'Không mở được ống kính.');
  }, []);

  const handleTakePicture = useCallback(async () => {
    if (!cameraRef.current || isCapturing || !isCameraReady) return;
    try {
      setIsCapturing(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const videos = Array.from(document.querySelectorAll('video'));
        const activeVideo = videos.find(
          (v) => v.srcObject instanceof MediaStream && v.videoWidth > 0,
        );
        if (activeVideo) {
          const vw = activeVideo.videoWidth;
          const vh = activeVideo.videoHeight;
          const side = Math.min(vw, vh);
          const sx = Math.floor((vw - side) / 2);
          const sy = Math.floor((vh - side) / 2);

          const canvas = document.createElement('canvas');
          canvas.width = side;
          canvas.height = side;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (facing === 'front') {
              ctx.translate(side, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(activeVideo, sx, sy, side, side, 0, 0, side, side);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
            if (dataUrl) {
              setPreviewUri(dataUrl);
              return;
            }
          }
        }
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setPreviewUri(photo.uri);
      }
    } catch {
      Alert.alert('Chưa chụp được ảnh', 'Ống kính đang bận hoặc bị gián đoạn. Hãy thử chụp lại.');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, isCameraReady, facing]);

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

      <View
        style={[
          styles.viewport,
          {
            width: viewportSize,
            height: viewportSize,
            backgroundColor: '#121214',
            shadowColor: colors.primary,
          },
        ]}
      >
        {!permission ? (
          <View style={styles.fallback}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : !permission.granted ? (
          <View style={styles.fallback}>
            <Text style={[styles.fallbackTitle, { color: '#FFFFFF' }]}>
              Chưa cấp quyền Máy ảnh
            </Text>
            <Text style={[styles.fallbackDesc, { color: 'rgba(255,255,255,0.72)' }]}>
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
            <Text style={[styles.fallbackTitle, { color: '#FFFFFF' }]}>
              Không mở được ống kính
            </Text>
            <Text style={[styles.fallbackDesc, { color: 'rgba(255,255,255,0.72)' }]}>
              {cameraError}
            </Text>
            <Pressable
              accessibilityRole="button"
              style={[styles.fallbackBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setCameraError(null);
                setIsCameraReady(false);
              }}
            >
              <Text style={styles.fallbackBtnText}>Thử mở lại</Text>
            </Pressable>
          </View>
        ) : shouldMountCamera ? (
          <View style={styles.sensorCenterWrap}>
            <CameraView
              ref={cameraRef}
              style={
                Platform.OS === 'web'
                  ? { width: viewportSize, height: viewportSize }
                  : { width: viewportSize, height: nativeSensorHeight }
              }
              facing={facing}
              flash={flash}
              zoom={0}
              ratio="4:3"
              mirror={facing === 'front'}
              mode="picture"
              onCameraReady={handleCameraReady}
              onMountError={handleMountError}
            />
          </View>
        ) : (
          <View style={styles.fallback}>
            <Text style={[styles.fallbackDesc, { color: 'rgba(255,255,255,0.72)' }]}>
              Đang tạm dừng ống kính
            </Text>
          </View>
        )}

        {granted && (
          <View style={styles.overlayTop} pointerEvents="box-none">
            <View style={styles.topLeftGroup} pointerEvents="box-none">
              {showCameraChrome ? (
                <GlassButton onPress={handleFlashCycle} label={FLASH_LABEL[flash]}>
                  <FlashIcon mode={flash} size={22} />
                </GlassButton>
              ) : (
                <View style={{ width: 42, height: 42 }} />
              )}

              {showCameraChrome &&
                Platform.OS === 'web' &&
                facing === 'back' &&
                webCamList.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Chuyển đổi góc chụp 0.5x và 1x"
                    onPress={() => void handleToggleZoomLens()}
                    style={({ pressed }) => [styles.modernLensPill, pressed && styles.pressed]}
                  >
                    <Text
                      style={[
                        styles.lensTextItem,
                        lensMode === '0.5x' && styles.lensTextActive,
                      ]}
                    >
                      0.5
                    </Text>
                    <Text
                      style={[
                        styles.lensTextItem,
                        lensMode === '1x' && styles.lensTextActive,
                      ]}
                    >
                      1x
                    </Text>
                  </Pressable>
                )}
            </View>

            <View
              style={[
                styles.stampBadge,
                { backgroundColor: colors.primary, maxWidth: viewportSize - 16 * 2 - 96 },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.stampBadgeText} numberOfLines={1}>
                {selectedStamp}
              </Text>
            </View>
          </View>
        )}

        {granted && (
          <View style={styles.overlayBottom} pointerEvents="box-none">
            <View style={styles.captionPill}>
              <PencilIcon size={14} color="#FFFFFF" />
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Thêm lời nhắn..."
                placeholderTextColor="rgba(255, 255, 255, 0.72)"
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
    paddingTop: 8,
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

  viewport: {
    alignSelf: 'center',
    borderRadius: 46,
    overflow: 'hidden',
    position: 'relative',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  sensorCenterWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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
    top: 16,
    left: 16,
    right: 16,
    zIndex: 10,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modernLensPill: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    backgroundColor: GLASS,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lensTextItem: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
  },
  lensTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  stampBadge: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
  },
  stampBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  glassBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: GLASS,
    justifyContent: 'center',
    alignItems: 'center',
  },

  overlayBottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 10,
    elevation: 6,
    alignItems: 'center',
  },
  captionPill: {
    maxWidth: '88%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
    borderRadius: 22,
    backgroundColor: GLASS,
  },
  captionInlineInput: {
    flexShrink: 1,
    minWidth: 110,
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
    justifyContent: 'space-around',
    paddingHorizontal: 12,
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
    borderWidth: 3.5,
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
    marginTop: 6,
  },
  footerItem: {
    minHeight: METRICS.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: { fontSize: 12, fontWeight: '600' },
});