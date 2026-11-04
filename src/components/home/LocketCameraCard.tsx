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
export type LensMode = '0.5x' | '1x';

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
  modeLabel: LensMode;
}

async function applySafeWebCamera(
  facingMode: CameraType,
  requestedMode: LensMode,
): Promise<WebLensConfig> {
  const fallback: WebLensConfig = {
    allBackCams: [],
    activeCamId: null,
    modeLabel: requestedMode,
  };

  if (Platform.OS !== 'web' || typeof document === 'undefined' || !navigator?.mediaDevices) {
    return fallback;
  }

  try {
    const videos = Array.from(document.querySelectorAll('video'));
    const activeVideo = videos.find((v) => v.srcObject instanceof MediaStream);
    if (!activeVideo) return fallback;

    activeVideo.style.objectFit = 'cover';
    activeVideo.style.width = '100%';
    activeVideo.style.height = '100%';

    const currentStream = activeVideo.srcObject as MediaStream | null;
    const currentTrack = currentStream?.getVideoTracks()?.[0];

    // Xử lý camera trước: giữ góc rộng tự nhiên ở 0.5x và phóng nhẹ ở 1x
    if (facingMode === 'front') {
      const scaleVal = requestedMode === '1x' ? 1.18 : 1;
      activeVideo.style.transform = `scaleX(-1) scale(${scaleVal})`;

      // Đảm bảo track hiện tại ở mức zoom nhỏ nhất (rộng nhất) của cảm biến
      if (currentTrack && typeof (currentTrack as any).getCapabilities === 'function') {
        try {
          const caps = (currentTrack as any).getCapabilities() || {};
          if (caps.zoom && typeof (currentTrack as any).applyConstraints === 'function') {
            await (currentTrack as any).applyConstraints({
              advanced: [{ zoom: caps.zoom.min ?? 1 }],
            });
          }
        } catch {
          // Bỏ qua nếu trình duyệt không cho chỉnh zoom cam trước
        }
      }
      return fallback;
    }

    // Xử lý camera sau
    activeVideo.style.transform = 'none';

    // 1. Lấy danh sách toàn bộ ống kính phần cứng để ưu tiên chuyển đúng ống kính 0.5x (Ultra-Wide) và 1x (Main)
    let videoDevices: MediaDeviceInfo[] = [];
    if (navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter((d) => d.kind === 'videoinput');
    }

    const backCams = videoDevices.filter(
      (d) =>
        /(back|rear|environment|sau|0\.5|ultra|wide|camera2 0|camera2 2|camera2 3)/i.test(
          d.label,
        ) && !/(tele|depth|mono|macro|front|trước|camera2 1)/i.test(d.label),
    );
    const availableCams = backCams.length > 0 ? backCams : videoDevices;

    let switchedHardwareLens = false;

    if (availableCams.length > 1) {
      let targetCam = availableCams[0];

      if (requestedMode === '0.5x') {
        // Tìm ống kính Ultra-Wide theo tên hoặc chọn camera sau cuối danh sách (thường là Ultra-Wide trên Android/iOS)
        const ultraCam = availableCams.find((d) =>
          /(ultra|0\.5|0,5|uw|wide-angle|camera 2|camera2 2|back 2|back 1)/i.test(d.label),
        );
        targetCam = ultraCam || availableCams[availableCams.length - 1];
      } else {
        // Tìm ống kính chính 1x
        const mainCam = availableCams.find(
          (d) =>
            /(main|primary|standard|back 0|camera 0|camera2 0|1x)/i.test(d.label) &&
            !/(ultra|0\.5|0,5|uw)/i.test(d.label),
        );
        targetCam = mainCam || availableCams[0];
      }

      const currentId = currentTrack?.getSettings?.().deviceId;

      if (targetCam && targetCam.deviceId && targetCam.deviceId !== currentId) {
        let newStream: MediaStream | null = null;
        // Ưu tiên xin tỷ lệ khung hình 4:3 (1.333) để lấy toàn bộ diện tích cảm biến giống Locket, tránh bị crop 16:9
        const baseVideoConstraints = {
          aspectRatio: { ideal: 4 / 3 },
          width: { ideal: 1440 },
          height: { ideal: 1080 },
        };

        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              ...baseVideoConstraints,
              deviceId: { exact: targetCam.deviceId },
            },
          });
        } catch {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { deviceId: { exact: targetCam.deviceId } },
            });
          } catch {
            newStream = null;
          }
        }

        if (newStream && newStream.getVideoTracks().length > 0) {
          const newTrack = newStream.getVideoTracks()[0];
          if (newTrack.readyState === 'live') {
            if (currentStream) {
              currentStream.getTracks().forEach((t) => t.stop());
            }
            activeVideo.srcObject = newStream;
            await activeVideo.play().catch(() => null);
            switchedHardwareLens = true;
          } else {
            newStream.getTracks().forEach((t) => t.stop());
          }
        }
      } else if (targetCam && targetCam.deviceId === currentId) {
        switchedHardwareLens = true;
      }
    }

    // 2. Tinh chỉnh thông số zoom trên Track đang chạy (Hỗ trợ các máy gộp chung ống kính 0.5x-10x vào 1論理 Track)
    const activeTrack = (activeVideo.srcObject as MediaStream)?.getVideoTracks()?.[0];
    if (activeTrack && typeof (activeTrack as any).getCapabilities === 'function') {
      try {
        const capabilities = (activeTrack as any).getCapabilities() || {};
        if (capabilities.zoom && typeof (activeTrack as any).applyConstraints === 'function') {
          const minZoom: number = capabilities.zoom.min ?? 1;
          const maxZoom: number = capabilities.zoom.max ?? 1;

          let targetZoom = minZoom;
          if (requestedMode === '0.5x') {
            // Luôn lấy mức zoom nhỏ nhất để có góc rộng tối đa như Locket
            targetZoom = minZoom;
          } else {
            // Ở chế độ 1x:
            if (minZoom < 1 && maxZoom >= 1) {
              // Nếu track hỗ trợ dải zoom từ 0.5x -> Nx, đặt chuẩn về 1.0x
              targetZoom = 1.0;
            } else if (switchedHardwareLens && availableCams.length > 1) {
              // Nếu đã chuyển sang đúng ống kính vật lý 1x riêng biệt, để ở mức gốc (minZoom) của ống kính đó
              targetZoom = minZoom;
            } else {
              // Nếu máy chỉ mở được 1 ống kính duy nhất có minZoom = 1, nhích nhẹ lên ~1.25x để phân biệt với 0.5x
              targetZoom = Math.min(maxZoom, minZoom * 1.25);
            }
          }

          await (activeTrack as any).applyConstraints({
            advanced: [{ zoom: targetZoom }],
          });
        }
      } catch {
        // Bỏ qua nếu thiết bị từ chối applyConstraints zoom
      }
    }

    const finalId = activeTrack?.getSettings?.().deviceId || null;

    return {
      allBackCams: availableCams,
      activeCamId: finalId,
      modeLabel: requestedMode,
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

  // Mở rộng khung chụp sát viền hơn giống giao diện Locket gốc
  const sideMargin = 6;
  const viewportSize = Math.min(440, Math.max(300, Math.round(screenWidth - sideMargin * 2)));
  // Để chiều cao khung cảm biến khớp trực tiếp với khung vuông hoặc tỷ lệ 4:3 vừa phải để tránh bị phóng đại
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

  const [, setWebCamList] = useState<MediaDeviceInfo[]>([]);
  // Mặc định để '0.5x' giống Locket để có góc nhìn rộng nhất ngay khi mở app
  const [lensMode, setLensMode] = useState<LensMode>('0.5x');

  const facingRef = useRef(facing);
  facingRef.current = facing;

  const lensModeRef = useRef(lensMode);
  lensModeRef.current = lensMode;

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
    setCameraError(null);
    // Khi lật camera vẫn giữ mặc định góc 0.5x rộng như Locket
    setLensMode('0.5x');
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
      void applySafeWebCamera(facingRef.current, lensModeRef.current).then((res) => {
        if (res.allBackCams.length > 0) setWebCamList(res.allBackCams);
        setLensMode(res.modeLabel);
      });
    }
  }, []);

  const handleToggleZoomLens = useCallback(async () => {
    void Haptics.selectionAsync().catch(() => {});
    const nextMode: LensMode = lensMode === '0.5x' ? '1x' : '0.5x';
    setLensMode(nextMode);

    if (Platform.OS === 'web') {
      const res = await applySafeWebCamera(facing, nextMode);
      if (res.allBackCams.length > 0) setWebCamList(res.allBackCams);
      setLensMode(res.modeLabel);
    }
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
          const baseSide = Math.min(vw, vh);
          // Nếu đang ở camera trước và chọn 1x (zoom nhẹ bằng CSS), crop vùng tương ứng khi chụp
          const cropFactor = facing === 'front' && lensMode === '1x' ? 1 / 1.18 : 1;
          const side = Math.floor(baseSide * cropFactor);
          const sx = Math.floor((vw - side) / 2);
          const sy = Math.floor((vh - side) / 2);

          const canvas = document.createElement('canvas');
          canvas.width = baseSide;
          canvas.height = baseSide;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (facing === 'front') {
              ctx.translate(baseSide, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(activeVideo, sx, sy, side, side, 0, 0, baseSide, baseSide);
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
  }, [isCapturing, isCameraReady, facing, lensMode]);

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

  // Trên Native (iOS/Android), zoom=0 là góc rộng nhất của ống kính hiện tại, 1x nhích nhẹ nếu không đổi lens
  const nativeZoomValue = Platform.OS === 'web' ? 0 : lensMode === '0.5x' ? 0 : 0.04;

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
                  : {
                      width:
                        lensMode === '0.5x' ? Math.round(viewportSize * 1.08) : viewportSize,
                      height: nativeSensorHeight,
                    }
              }
              facing={facing}
              flash={flash}
              zoom={nativeZoomValue}
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

              {showCameraChrome && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Chuyển đổi góc chụp 0.5x và 1x"
                  onPress={() => void handleToggleZoomLens()}
                  style={({ pressed }) => [styles.modernLensPill, pressed && styles.pressed]}
                >
                  <View
                    style={[
                      styles.lensBadgeItem,
                      lensMode === '0.5x' && styles.lensBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.lensTextItem,
                        lensMode === '0.5x' && styles.lensTextActive,
                      ]}
                    >
                      0.5x
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.lensBadgeItem,
                      lensMode === '1x' && styles.lensBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.lensTextItem,
                        lensMode === '1x' && styles.lensTextActive,
                      ]}
                    >
                      1x
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>

            <View
              style={[
                styles.stampBadge,
                { backgroundColor: colors.primary, maxWidth: viewportSize - 16 * 2 - 120 },
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
    paddingHorizontal: 5,
    borderRadius: 19,
    backgroundColor: GLASS,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  lensBadgeItem: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  lensBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  lensTextItem: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '700',
  },
  lensTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
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