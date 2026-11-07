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
  size: number;
  disabled?: boolean;
  children: React.ReactNode;
}

const SideButton = memo(function SideButton({
  onPress,
  label,
  bg,
  size,
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
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
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
  size: number;
  disabled: boolean;
}

const FlipButton = memo(function FlipButton({
  facing,
  onPress,
  bg,
  color,
  size,
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
      size={size}
      label={facing === 'front' ? 'Đổi sang camera sau' : 'Đổi sang camera trước'}
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <FlipIcon size={Math.round(size * 0.52)} color={color} />
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
  compact?: boolean;
  onPress: () => void;
}

const ShutterButton = memo(function ShutterButton({
  variant,
  busy,
  disabled,
  color,
  halo,
  label,
  compact = false,
  onPress,
}: ShutterButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const haloSize = compact ? 78 : 94;
  const ringSize = compact ? 68 : 82;
  const coreSize = compact ? 54 : 66;
  const iconSize = compact ? 24 : 29;

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
          {
            width: haloSize,
            height: haloSize,
            borderRadius: haloSize / 2,
            backgroundColor: halo,
            opacity: disabled && !busy ? 0.55 : 1,
          },
          { transform: [{ scale }] },
        ]}
      >
        <View
          style={[
            styles.ring,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderColor: color,
            },
          ]}
        >
          <View
            style={[
              styles.core,
              {
                width: coreSize,
                height: coreSize,
                borderRadius: coreSize / 2,
                backgroundColor: color,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : variant === 'send' ? (
              <SendIcon size={iconSize} color="#FFFFFF" />
            ) : (
              <HeartIcon size={iconSize} color="#FFFFFF" />
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Bỏ qua lỗi khi stop track
      }
    });
  } catch {
    // Bỏ qua
  }
}

function isLikelyMacroOrDepthTrack(track: MediaStreamTrack): boolean {
  try {
    const caps = (track as any).getCapabilities?.() || {};
    if (caps.width?.max && caps.width.max < 1280) {
      return true;
    }
    if (
      Array.isArray(caps.focusMode) &&
      caps.focusMode.length === 1 &&
      caps.focusMode[0] === 'manual'
    ) {
      return true;
    }
  } catch {
    // Bỏ qua
  }
  return false;
}

async function enforceFullSensor4By3(track: MediaStreamTrack) {
  try {
    const settings = track.getSettings?.() || {};
    const w = settings.width || 0;
    const h = settings.height || 0;
    const ratio = w > 0 && h > 0 ? Math.max(w, h) / Math.min(w, h) : 1.333;

    if (ratio > 1.5 && typeof track.applyConstraints === 'function') {
      await track.applyConstraints({
        aspectRatio: { ideal: 4 / 3 },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      } as MediaTrackConstraints);
    }
  } catch {
    // Bỏ qua an toàn
  }
}

async function openSensorStream(
  constraintTarget: { deviceId?: string; facingMode?: 'user' | 'environment' },
): Promise<MediaStream | null> {
  if (!navigator?.mediaDevices?.getUserMedia) return null;

  const base4By3 = {
    aspectRatio: { ideal: 4 / 3 },
    width: { ideal: 1280 },
    height: { ideal: 960 },
  };

  const attempts: MediaTrackConstraints[] = [];

  if (constraintTarget.deviceId) {
    attempts.push({
      ...base4By3,
      deviceId: { exact: constraintTarget.deviceId },
    });
    attempts.push({
      deviceId: { exact: constraintTarget.deviceId },
    });
  }

  if (constraintTarget.facingMode) {
    attempts.push({
      ...base4By3,
      facingMode: { ideal: constraintTarget.facingMode },
    });
    attempts.push({
      facingMode: constraintTarget.facingMode,
    });
  }

  for (const videoConstraint of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraint,
      });
      if (stream && stream.getVideoTracks().length > 0) {
        const track = stream.getVideoTracks()[0];
        if (track.readyState === 'live') {
          await enforceFullSensor4By3(track);
          return stream;
        }
        stopMediaStream(stream);
      }
    } catch {
      // Thử phương án tiếp theo
    }
  }

  return null;
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

  const isCompactVertical = screenHeight < 700 || screenWidth > screenHeight;
  const isWideScreen = screenWidth >= 680;
  const sideBtnSize = isCompactVertical ? 46 : 54;

  // Khung ngắm vuông tự co giãn vừa vặn theo cả chiều ngang lẫn chiều dọc
  const sideMargin = isWideScreen ? 16 : 8;
  const maxByWidth = Math.min(440, Math.max(240, Math.round(screenWidth - sideMargin * 2)));
  const maxByHeight = Math.max(230, Math.round(screenHeight - reservedHeight - (isCompactVertical ? 210 : 250)));
  const viewportSize = Math.min(maxByWidth, maxByHeight);
  const viewportRadius = Math.max(28, Math.min(46, Math.round(viewportSize * 0.11)));
  const nativeSensorHeight = Math.round((viewportSize * 4) / 3);
  const stageMinHeight = isCompactVertical
    ? undefined
    : Math.max(500, screenHeight - reservedHeight);

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

  const [myAvatarLoadErr, setMyAvatarLoadErr] = useState(false);
  const [partnerAvatarLoadErr, setPartnerAvatarLoadErr] = useState(false);

  useEffect(() => {
    setMyAvatarLoadErr(false);
  }, [myProfile.avatarUri]);

  useEffect(() => {
    setPartnerAvatarLoadErr(false);
  }, [partnerProfile.avatarUri]);

  const initialStampText = useMemo(() => {
    if (myProfile.customStatusText) return myProfile.customStatusText;
    const first = stamps[0];
    if (typeof first === 'object') return `${first.icon} ${first.label}`;
    return first || '💕 Đang nhớ đằng ấy';
  }, [myProfile.customStatusText, stamps]);

  const [selectedStamp, setSelectedStamp] = useState<string>(initialStampText);
  const [caption, setCaption] = useState<string>('');

  const cameraRef = useRef<CameraView | null>(null);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeWebStreamRef = useRef<MediaStream | null>(null);
  const webRequestIdRef = useRef<number>(0);

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
      stopMediaStream(activeWebStreamRef.current);
      activeWebStreamRef.current = null;
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
    if (!shouldMountCamera) {
      setIsCameraReady(false);
      if (Platform.OS === 'web') {
        stopMediaStream(activeWebStreamRef.current);
        activeWebStreamRef.current = null;
      }
    }
  }, [shouldMountCamera]);

  const syncWebCameraStream = useCallback(async (targetFacing: CameraType) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !navigator?.mediaDevices) {
      return;
    }

    const requestId = ++webRequestIdRef.current;

    try {
      if (activeWebStreamRef.current) {
        stopMediaStream(activeWebStreamRef.current);
        activeWebStreamRef.current = null;
      }
      if (webVideoRef.current) {
        webVideoRef.current.srcObject = null;
      }

      if (targetFacing === 'front') {
        const frontStream = await openSensorStream({ facingMode: 'user' });
        if (requestId !== webRequestIdRef.current) {
          stopMediaStream(frontStream);
          return;
        }
        if (!frontStream) {
          setCameraError('Không mở được camera trước. Hãy kiểm tra quyền truy cập.');
          return;
        }

        const fTrack = frontStream.getVideoTracks()[0];
        const fCaps = (fTrack as any)?.getCapabilities?.() || {};
        if (fCaps.zoom && typeof (fTrack as any).applyConstraints === 'function') {
          await (fTrack as any)
            .applyConstraints({ advanced: [{ zoom: fCaps.zoom.min ?? 1 }] })
            .catch(() => null);
        }

        activeWebStreamRef.current = frontStream;
        if (webVideoRef.current) {
          webVideoRef.current.srcObject = frontStream;
          await webVideoRef.current.play().catch(() => null);
        }
        setIsCameraReady(true);
        setCameraError(null);
        return;
      }

      let devices: MediaDeviceInfo[] = [];
      if (navigator.mediaDevices.enumerateDevices) {
        const all = await navigator.mediaDevices.enumerateDevices();
        devices = all.filter((d) => d.kind === 'videoinput');
      }

      const backCams = devices.filter(
        (d) =>
          /(back|rear|environment|sau|0\.5|ultra|wide|camera2 0|camera2 2|camera2 3|camera2 4)/i.test(
            d.label,
          ) && !/(tele|depth|mono|macro|front|trước|camera2 1)/i.test(d.label),
      );

      const mainBackCam =
        backCams.find(
          (d) =>
            /(main|primary|standard|back 0|camera 0|camera2 0)/i.test(d.label) &&
            !/(ultra|0\.5|0,5|uw)/i.test(d.label),
        ) || backCams[0];

      const explicitUltraCam = backCams.find((d) =>
        /(ultra|0\.5|0,5|uw|wide-angle)/i.test(d.label),
      );

      let chosenStream: MediaStream | null = null;

      if (explicitUltraCam?.deviceId) {
        chosenStream = await openSensorStream({ deviceId: explicitUltraCam.deviceId });
      }

      if (!chosenStream) {
        const primaryStream = await openSensorStream({
          deviceId: mainBackCam?.deviceId,
          facingMode: 'environment',
        });

        if (primaryStream) {
          const pTrack = primaryStream.getVideoTracks()[0];
          const pCaps = (pTrack as any)?.getCapabilities?.() || {};
          const pMinZoom: number = pCaps.zoom?.min ?? 1;

          if (pMinZoom < 1 && typeof (pTrack as any).applyConstraints === 'function') {
            await (pTrack as any)
              .applyConstraints({ advanced: [{ zoom: pMinZoom }] })
              .catch(() => null);
            chosenStream = primaryStream;
          } else if (backCams.length > 1) {
            const mainId = pTrack.getSettings?.()?.deviceId || mainBackCam?.deviceId;
            const auxCandidates = backCams
              .filter((d) => d.deviceId && d.deviceId !== mainId)
              .reverse();

            stopMediaStream(primaryStream);

            for (const candidate of auxCandidates) {
              const candidateStream = await openSensorStream({ deviceId: candidate.deviceId });
              if (candidateStream) {
                const cTrack = candidateStream.getVideoTracks()[0];
                if (!isLikelyMacroOrDepthTrack(cTrack)) {
                  chosenStream = candidateStream;
                  break;
                }
                stopMediaStream(candidateStream);
              }
            }

            if (!chosenStream) {
              chosenStream = await openSensorStream({
                deviceId: mainBackCam?.deviceId,
                facingMode: 'environment',
              });
            }
          } else {
            chosenStream = primaryStream;
          }
        }
      }

      if (requestId !== webRequestIdRef.current) {
        stopMediaStream(chosenStream);
        return;
      }

      if (!chosenStream) {
        setCameraError('Không mở được ống kính máy ảnh.');
        return;
      }

      const finalTrack = chosenStream.getVideoTracks()[0];
      const finalCaps = (finalTrack as any)?.getCapabilities?.() || {};
      if (finalCaps.zoom && typeof (finalTrack as any).applyConstraints === 'function') {
        await (finalTrack as any)
          .applyConstraints({ advanced: [{ zoom: finalCaps.zoom.min ?? 1 }] })
          .catch(() => null);
      }

      activeWebStreamRef.current = chosenStream;
      if (webVideoRef.current) {
        webVideoRef.current.srcObject = chosenStream;
        await webVideoRef.current.play().catch(() => null);
      }
      setIsCameraReady(true);
      setCameraError(null);
    } catch {
      if (requestId === webRequestIdRef.current) {
        setCameraError('Ống kính đang bận, hãy bấm thử mở lại.');
      }
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!shouldMountCamera) return;
    void syncWebCameraStream(facing);
  }, [shouldMountCamera, facing, syncWebCameraStream]);

  useEffect(() => {
    if (Platform.OS !== 'web' || facing !== 'back') return;
    const track = activeWebStreamRef.current?.getVideoTracks()?.[0];
    if (!track || typeof (track as any).getCapabilities !== 'function') return;
    try {
      const caps = (track as any).getCapabilities() || {};
      if (caps.torch && typeof (track as any).applyConstraints === 'function') {
        void (track as any)
          .applyConstraints({ advanced: [{ torch: flash === 'on' }] })
          .catch(() => null);
      }
    } catch {
      // Bỏ qua
    }
  }, [flash, facing, isCameraReady]);

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
    setIsCameraReady(false);
    setFacing((cur) => (cur === 'front' ? 'back' : 'front'));
  }, []);

  const handleFlashCycle = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    setFlash((cur) => FLASH_CYCLE[(FLASH_CYCLE.indexOf(cur) + 1) % FLASH_CYCLE.length]);
  }, []);

  const handleNativeCameraReady = useCallback(() => {
    setIsCameraReady(true);
    setCameraError(null);
  }, []);

  const handleMountError = useCallback((e: { message?: string }) => {
    setIsCameraReady(false);
    setCameraError(e?.message || 'Không mở được ống kính.');
  }, []);

  const handleTakePicture = useCallback(async () => {
    if (isCapturing || !isCameraReady) return;
    try {
      setIsCapturing(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const activeVideo = webVideoRef.current;
        if (activeVideo && activeVideo.videoWidth > 0 && activeVideo.videoHeight > 0) {
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
        Alert.alert('Chưa chụp được ảnh', 'Ống kính đang lấy nét, bạn bấm chụp lại nhé.');
        return;
      }

      if (!cameraRef.current) return;
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

  const setWebVideoNode = useCallback((node: HTMLVideoElement | null) => {
    webVideoRef.current = node;
    if (node) {
      node.setAttribute('playsinline', 'true');
      node.setAttribute('webkit-playsinline', 'true');
      node.muted = true;
      node.autoplay = true;
      if (activeWebStreamRef.current && node.srcObject !== activeWebStreamRef.current) {
        node.srcObject = activeWebStreamRef.current;
        void node.play().catch(() => null);
      }
    }
  }, []);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.surface,
          minHeight: stageMinHeight,
          marginHorizontal: isWideScreen ? 0 : -METRICS.paddingHorizontal,
          borderRadius: isWideScreen ? METRICS.radiusLg : 0,
        },
      ]}
    >
      <View style={styles.coupleStrip}>
        <View style={styles.personBox}>
          <View style={[styles.avatar, { backgroundColor: colors.primaryContainer }]}>
            {myProfile.avatarUri && !myAvatarLoadErr ? (
              <Image
                source={{ uri: myProfile.avatarUri }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setMyAvatarLoadErr(true)}
              />
            ) : (
              <Text style={styles.avatarEmoji}>{myProfile.moodEmoji}</Text>
            )}
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
            {partnerProfile.avatarUri && !partnerAvatarLoadErr ? (
              <Image
                source={{ uri: partnerProfile.avatarUri }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setPartnerAvatarLoadErr(true)}
              />
            ) : (
              <Text style={styles.avatarEmoji}>{partnerProfile.moodEmoji}</Text>
            )}
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
            borderRadius: viewportRadius,
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
            {Platform.OS === 'web' ? (
              React.createElement('video', {
                ref: setWebVideoNode,
                autoPlay: true,
                playsInline: true,
                muted: true,
                style: {
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: facing === 'front' ? 'scaleX(-1)' : 'none',
                },
              })
            ) : (
              <CameraView
                ref={cameraRef}
                style={{
                  width: Math.round(viewportSize * 1.08),
                  height: nativeSensorHeight,
                }}
                facing={facing}
                flash={flash}
                zoom={0}
                ratio="4:3"
                mirror={facing === 'front'}
                mode="picture"
                onCameraReady={handleNativeCameraReady}
                onMountError={handleMountError}
              />
            )}
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
            {showCameraChrome ? (
              <GlassButton onPress={handleFlashCycle} label={FLASH_LABEL[flash]}>
                <FlashIcon mode={flash} size={22} />
              </GlassButton>
            ) : (
              <View style={{ width: 42, height: 42 }} />
            )}

            <View
              style={[
                styles.stampBadge,
                { backgroundColor: colors.primary, maxWidth: Math.max(120, viewportSize - 90) },
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

      <View style={[styles.shutterSection, isCompactVertical && { paddingVertical: 8 }]}>
        <View style={[styles.shutterRow, { maxWidth: Math.max(320, viewportSize) }]}>
          {previewUri ? (
            <SideButton
              onPress={handleRetake}
              disabled={isSending}
              bg={colors.surfaceVariant}
              size={sideBtnSize}
              label="Chụp lại"
            >
              <CloseIcon size={Math.round(sideBtnSize * 0.45)} color={colors.textPrimary} />
            </SideButton>
          ) : (
            <SideButton
              onPress={() => void handlePickGallery()}
              bg={colors.surfaceVariant}
              size={sideBtnSize}
              label="Chọn ảnh từ thư viện"
            >
              <GalleryIcon size={Math.round(sideBtnSize * 0.5)} color={colors.textPrimary} />
            </SideButton>
          )}

          {previewUri ? (
            <ShutterButton
              variant="send"
              busy={isSending}
              disabled={isSending}
              color={colors.primary}
              halo={colors.primaryContainer}
              compact={isCompactVertical}
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
              compact={isCompactVertical}
              label={isCameraReady ? 'Chụp ảnh' : 'Đang mở ống kính'}
              onPress={() => void handleTakePicture()}
            />
          )}

          {previewUri ? (
            <View style={{ width: sideBtnSize, height: sideBtnSize }} />
          ) : (
            <FlipButton
              facing={facing}
              onPress={handleFlipCamera}
              disabled={!granted}
              bg={colors.surfaceVariant}
              color={colors.textPrimary}
              size={sideBtnSize}
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
    paddingHorizontal: METRICS.paddingHorizontal,
    paddingTop: 8,
    paddingBottom: 8,
    marginBottom: 8,
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarEmoji: { fontSize: 16 },
  personText: { flex: 1 },
  personName: { fontSize: 12, fontWeight: '700' },
  personStatus: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  viewport: {
    alignSelf: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  sensorCenterWrap: {
    flex: 1,
    width: '100%',
    height: '100%',
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
  fallbackTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
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
    top: 14,
    left: 14,
    right: 14,
    zIndex: 10,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    left: 14,
    right: 14,
    bottom: 14,
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
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
    borderRadius: 22,
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
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
  },
  sideBtn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  halo: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    borderWidth: 3.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  core: {
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
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  footerItem: {
    minHeight: METRICS.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: { fontSize: 12, fontWeight: '700' },
});