// src/screens/PairingScreen.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  ToastAndroid,
  Platform,
  Share,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { getErrorMessage } from '../utils/error';
import { PALETTE, METRICS } from '../constants/theme';

export const PairingScreen = () => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isSmallDevice = screenWidth < 360 || screenHeight < 680;

  const [activeTab, setActiveTab] = useState<'SHARE' | 'ENTER'>('SHARE');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [inputCode, setInputCode] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const setCoupleId = useAuthStore((state) => state.setCoupleId);
  const syncCoupleStatusFromServer = useAuthStore((state) => state.syncCoupleStatusFromServer);
  const logout = useAuthStore((state) => state.logout);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<TextInput>(null);

  const clearCountdown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (generatedCode) {
      pollInterval = setInterval(async () => {
        if (typeof syncCoupleStatusFromServer === 'function') {
          await syncCoupleStatusFromServer();
        }
      }, 3000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [generatedCode, syncCoupleStatusFromServer]);

  const startCountdown = useCallback(
    (seconds: number) => {
      clearCountdown();
      setTimeLeft(seconds);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearCountdown();
            setGeneratedCode(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearCountdown],
  );

  const forceUnlockToHome = async () => {
    useAuthStore.setState((state) => ({
      coupleId: 'paired_active',
      isAuthenticated: true,
      user: state.user
        ? { ...state.user, coupleId: 'paired_active' }
        : { id: 'me', email: '', fullName: 'User', coupleId: 'paired_active' },
    }));
    await setCoupleId('paired_active');
  };

  const isAlreadyPairedError = (error: any): boolean => {
    const status = error?.response?.status;
    const msg = getErrorMessage(error).toLowerCase();
    return (
      status === 409 ||
      msg.includes('đã được ghép đôi') ||
      msg.includes('đã ghép đôi') ||
      msg.includes('mối quan hệ khác') ||
      msg.includes('already paired')
    );
  };

  const handleGenerateCode = async () => {
    setStatusMessage(null);
    try {
      setActionLoading(true);
      const res = await api.post('/api/v1/pairing/generate-code');
      if (res.data?.coupleId && res.data?.status === 'ACTIVE') {
        await setCoupleId(res.data.coupleId);
        return;
      }
      const code = res.data.pairingCode;
      const ttl = res.data.ttlSeconds || 900;
      setGeneratedCode(code);
      startCountdown(ttl);
    } catch (error: any) {
      if (isAlreadyPairedError(error)) {
        await forceUnlockToHome();
        return;
      }
      setStatusMessage({ text: getErrorMessage(error), isError: true });
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!generatedCode) return;
    await Clipboard.setStringAsync(generatedCode);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Đã sao chép mã kết nối!', ToastAndroid.SHORT);
    }
  };

  const shareCode = async () => {
    if (!generatedCode) return;
    try {
      await Share.share({
        message: `Mã ghép đôi LoveVault của mình là: ${generatedCode}. Hãy nhập mã này để kết nối không gian tình yêu cùng mình nhé!`,
      });
    } catch {
      // Bỏ qua nếu người dùng hủy chia sẻ
    }
  };

  const handleConnect = async () => {
    setStatusMessage(null);
    const sanitized = inputCode.trim();
    if (sanitized.length !== 6) {
      setStatusMessage({ text: 'Mã ghép đôi bắt buộc gồm đúng 6 chữ số.', isError: true });
      return;
    }

    try {
      setActionLoading(true);
      const res = await api.post('/api/v1/pairing/connect', { pairingCode: sanitized });
      await setCoupleId(res.data?.coupleId || 'paired_active');
    } catch (error: any) {
      if (isAlreadyPairedError(error)) {
        await forceUnlockToHome();
        return;
      }
      setStatusMessage({ text: getErrorMessage(error), isError: true });
    } finally {
      setActionLoading(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <StatusBar barStyle="dark-content" backgroundColor={PALETTE.background} />
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingVertical: isSmallDevice ? 16 : 28 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.responsiveContainer}>
            {/* Header */}
            <View style={styles.headerBlock}>
              <Text style={styles.badgeLabel}>💖 KẾT NỐI LỨA ĐÔI</Text>
              <Text style={[styles.title, isSmallDevice && { fontSize: 22 }]}>
                Ghép đôi cùng người ấy
              </Text>
              <Text style={styles.description}>
                Chia sẻ mã cá nhân hoặc nhập mã từ đối phương để mở khóa không gian riêng tư dành cho hai bạn.
              </Text>
            </View>

            {statusMessage && (
              <View
                style={[
                  styles.messageBanner,
                  statusMessage.isError ? styles.errorBanner : styles.successBanner,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    statusMessage.isError ? styles.errorText : styles.successText,
                  ]}
                >
                  {statusMessage.text}
                </Text>
              </View>
            )}

            {/* Thanh chuyển đổi Tab */}
            <View style={styles.tabContainer}>
              <Pressable
                style={[styles.tabButton, activeTab === 'SHARE' && styles.activeTabButton]}
                onPress={() => setActiveTab('SHARE')}
              >
                <Text
                  style={[styles.tabText, activeTab === 'SHARE' && styles.activeTabText]}
                  numberOfLines={1}
                >
                  Mã của bạn
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tabButton, activeTab === 'ENTER' && styles.activeTabButton]}
                onPress={() => setActiveTab('ENTER')}
              >
                <Text
                  style={[styles.tabText, activeTab === 'ENTER' && styles.activeTabText]}
                  numberOfLines={1}
                >
                  Nhập mã người ấy
                </Text>
              </Pressable>
            </View>

            {/* TAB 1: GỬI MÃ */}
            {activeTab === 'SHARE' && (
              <View style={[styles.card, isSmallDevice && { padding: 16 }]}>
                {generatedCode ? (
                  <View style={styles.codeContainer}>
                    <Text style={styles.cardSubTitle}>Mã kết nối của bạn</Text>
                    <View style={[styles.codeBadge, isSmallDevice && { paddingHorizontal: 16 }]}>
                      <Text
                        style={[
                          styles.codeDisplay,
                          isSmallDevice && { fontSize: 28, letterSpacing: 5 },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {generatedCode}
                      </Text>
                    </View>
                    <Text style={styles.timerDisplay}>
                      ⏱ Hiệu lực còn lại: {formatTimer(timeLeft)}
                    </Text>

                    <View style={[styles.actionRow, isSmallDevice && { flexDirection: 'column' }]}>
                      <Pressable
                        accessibilityRole="button"
                        style={[styles.actionBtn, styles.copyBtn]}
                        android_ripple={{ color: PALETTE.rippleDark }}
                        onPress={copyToClipboard}
                      >
                        <Text style={styles.copyBtnText}>📋 SAO CHÉP MÃ</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        style={[styles.actionBtn, styles.shareBtn]}
                        android_ripple={{ color: PALETTE.rippleLight }}
                        onPress={shareCode}
                      >
                        <Text style={styles.shareBtnText}>📲 CHIA SẺ NGAY</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyCodeContainer}>
                    <Text style={styles.emptyCodeTitle}>Bạn chưa có mã ghép đôi nào</Text>
                    <Text style={styles.emptyCodeDesc}>
                      Tạo mã 6 số ngẫu nhiên để gửi cho người ấy kết nối trong vòng 15 phút.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.primaryButton,
                        pressed && { backgroundColor: PALETTE.primaryPressed },
                        actionLoading && styles.buttonDisabled,
                      ]}
                      android_ripple={{ color: PALETTE.rippleLight }}
                      onPress={handleGenerateCode}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <ActivityIndicator color={PALETTE.surface} size="small" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Tạo mã mới ngay</Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {/* TAB 2: NHẬP MÃ OTP 6 Ô LINH HOẠT */}
            {activeTab === 'ENTER' && (
              <View style={[styles.card, isSmallDevice && { padding: 16 }]}>
                <Text style={styles.cardSubTitle}>Nhập 6 số từ ứng dụng đối phương</Text>

                <TextInput
                  ref={inputRef}
                  style={styles.hiddenInput}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={inputCode}
                  onChangeText={(text) => {
                    setInputCode(text.replace(/[^0-9]/g, ''));
                    if (statusMessage) setStatusMessage(null);
                  }}
                  autoFocus={true}
                />

                <Pressable
                  style={[styles.otpRow, { gap: isSmallDevice ? 6 : 10 }]}
                  onPress={() => inputRef.current?.focus()}
                >
                  {Array.from({ length: 6 }).map((_, index) => {
                    const digit = inputCode[index] || '';
                    const isFocused = inputCode.length === index;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.otpBox,
                          digit ? styles.otpBoxFilled : null,
                          isFocused ? styles.otpBoxFocused : null,
                        ]}
                      >
                        <Text style={[styles.otpDigit, isSmallDevice && { fontSize: 18 }]}>
                          {digit}
                        </Text>
                      </View>
                    );
                  })}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && { backgroundColor: PALETTE.primaryPressed },
                    (actionLoading || inputCode.length !== 6) && styles.buttonDisabled,
                  ]}
                  android_ripple={{ color: PALETTE.rippleLight }}
                  onPress={handleConnect}
                  disabled={actionLoading || inputCode.length !== 6}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={PALETTE.surface} size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Xác nhận kết nối</Text>
                  )}
                </Pressable>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              style={styles.logoutButton}
              android_ripple={{ color: PALETTE.rippleDark }}
              onPress={logout}
            >
              <Text style={styles.logoutText}>Đăng xuất khỏi tài khoản</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PALETTE.background },
  flexOne: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: METRICS.paddingHorizontal,
  },
  responsiveContainer: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  headerBlock: { marginBottom: 20 },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: PALETTE.primary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: PALETTE.textPrimary,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 14,
    color: PALETTE.textSecondary,
    marginTop: 6,
    lineHeight: 20,
  },
  messageBanner: {
    padding: 12,
    borderRadius: METRICS.radiusSm,
    marginBottom: 16,
    borderWidth: 1,
  },
  errorBanner: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  successBanner: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  messageText: { fontSize: 13, fontWeight: '500' },
  errorText: { color: PALETTE.error },
  successText: { color: '#16A34A' },

  /* Segmented Tab Switcher */
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: METRICS.radiusSm,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    height: 40,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: METRICS.radiusSm - 2,
  },
  activeTabButton: {
    backgroundColor: PALETTE.surface,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.textSecondary,
  },
  activeTabText: {
    color: PALETTE.primary,
    fontWeight: '800',
  },

  /* Card */
  card: {
    backgroundColor: PALETTE.surface,
    padding: 20,
    borderRadius: METRICS.radiusMd,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    width: '100%',
  },
  cardSubTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.textPrimary,
    textAlign: 'center',
    marginBottom: 14,
  },

  /* Tab 1: Share Code */
  codeContainer: { alignItems: 'center', width: '100%' },
  codeBadge: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: METRICS.radiusMd,
    marginVertical: 8,
    maxWidth: '100%',
    alignItems: 'center',
  },
  codeDisplay: {
    fontSize: 36,
    fontWeight: '900',
    color: PALETTE.primary,
    letterSpacing: 8,
  },
  timerDisplay: {
    fontSize: 13,
    color: PALETTE.textSecondary,
    marginTop: 8,
    marginBottom: 18,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    minHeight: METRICS.minTouchTarget,
    borderRadius: METRICS.radiusSm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  copyBtn: {
    backgroundColor: PALETTE.primaryContainer,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.onPrimaryContainer,
  },
  shareBtn: {
    backgroundColor: PALETTE.primary,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyCodeContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  emptyCodeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyCodeDesc: {
    fontSize: 13,
    color: PALETTE.textSecondary,
    textAlign: 'center',
    marginBottom: 18,
  },

  /* Tab 2: OTP Box UI - Co giãn theo mọi chiều rộng màn hình */
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 6,
    width: '100%',
  },
  otpBox: {
    flex: 1,
    maxWidth: 52,
    aspectRatio: 0.85,
    borderRadius: METRICS.radiusSm,
    borderWidth: 1.5,
    borderColor: PALETTE.outline,
    backgroundColor: PALETTE.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxFilled: {
    borderColor: PALETTE.primary,
    backgroundColor: '#FFF1F2',
  },
  otpBoxFocused: {
    borderColor: PALETTE.primary,
    borderWidth: 2,
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '800',
    color: PALETTE.textPrimary,
  },

  primaryButton: {
    height: METRICS.minTouchTarget,
    backgroundColor: PALETTE.primary,
    borderRadius: METRICS.radiusSm,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    elevation: 2,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    color: PALETTE.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  logoutButton: {
    minHeight: METRICS.minTouchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.textSecondary,
  },
});