// src/screens/ForgotPasswordScreen.tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Keyboard,
  AppState,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { getErrorMessage } from '../utils/error';
import { stripAllSpaces, validateAndNormalizeEmail } from '../utils/emailValidator';
import { PALETTE, METRICS } from '../constants/theme';

const RESEND_COOLDOWN_SEC = 120;

export const ForgotPasswordScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isSmallDevice = screenWidth < 360 || screenHeight < 680;
  const isLargeDevice = screenWidth >= 600;

  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);

  const [step, setStep] = useState<1 | 2>(1);

  const [email, setEmail] = useState<string>(stripAllSpaces(route?.params?.defaultEmail ?? ''));
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isPasswordVisible, setPasswordVisible] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!cooldownEndsAt) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setCooldownEndsAt(null);
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(intervalId);
      appStateSub.remove();
    };
  }, [cooldownEndsAt]);

  const handleEmailChange = useCallback((text: string) => {
    setEmail(stripAllSpaces(text));
    setErrorMessage(null);
  }, []);

  const handleRequestOtp = useCallback(async () => {
    if (isSubmittingRef.current || loading || secondsLeft > 0) return;

    Keyboard.dismiss();
    setErrorMessage(null);

    const emailValidation = validateAndNormalizeEmail(email, false);
    if (!emailValidation.isValid) {
      setErrorMessage(emailValidation.error || 'Địa chỉ email không hợp lệ.');
      return;
    }

    try {
      isSubmittingRef.current = true;
      setLoading(true);

      await api.post('/api/v1/auth/forgot-password', {
        email: emailValidation.cleanEmail,
      });

      if (!isMountedRef.current) return;
      setStep(2);
      setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_SEC * 1000);
    } catch (error: any) {
      if (isMountedRef.current) setErrorMessage(getErrorMessage(error));
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) setLoading(false);
    }
  }, [email, loading, secondsLeft]);

  const handleResetPassword = useCallback(async () => {
    if (isSubmittingRef.current || loading) return;

    Keyboard.dismiss();
    setErrorMessage(null);

    const cleanOtp = stripAllSpaces(otp);
    if (cleanOtp.length !== 6 || !/^\d+$/.test(cleanOtp)) {
      setErrorMessage('Mã OTP phải bao gồm đúng 6 chữ số.');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setErrorMessage('Mật khẩu mới phải từ 8 ký tự trở lên.');
      return;
    }

    const emailValidation = validateAndNormalizeEmail(email, false);

    try {
      isSubmittingRef.current = true;
      setLoading(true);

      await api.post('/api/v1/auth/reset-password', {
        email: emailValidation.cleanEmail,
        otp: cleanOtp,
        newPassword,
      });

      if (!isMountedRef.current) return;

      Alert.alert('Thành công', 'Mật khẩu của bạn đã được cập nhật!', [
        {
          text: 'Đăng nhập ngay',
          onPress: () => navigation.navigate('Login'),
        },
      ]);
    } catch (error: any) {
      if (isMountedRef.current) setErrorMessage(getErrorMessage(error));
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) setLoading(false);
    }
  }, [email, otp, newPassword, loading, navigation]);

  const handleBackToLogin = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Login');
  }, [navigation]);

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
          <View style={[styles.responsiveContainer, isLargeDevice && styles.largeDeviceCard]}>
            <Pressable
              accessibilityRole="button"
              style={styles.backBtn}
              onPress={step === 2 ? () => setStep(1) : handleBackToLogin}
              disabled={loading}
              hitSlop={8}
            >
              <Text style={styles.backBtnText}>
                {step === 2 ? '< Đổi email khác' : '< Quay lại'}
              </Text>
            </Pressable>

            <View style={[styles.headerBlock, isSmallDevice && { marginBottom: 18 }]}>
              <Text style={[styles.title, isSmallDevice && { fontSize: 24 }]}>
                {step === 1 ? 'Quên mật khẩu' : 'Xác thực OTP'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 1
                  ? 'Nhập email đã đăng ký. Chúng mình sẽ gửi mã OTP gồm 6 chữ số vào hộp thư của bạn.'
                  : `Vui lòng nhập mã OTP đã gửi tới email ${email} và tạo mật khẩu mới.`}
              </Text>
            </View>

            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            {step === 1 ? (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Địa chỉ Email</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="tenban@gmail.com"
                    placeholderTextColor={PALETTE.textSecondary}
                    value={email}
                    onChangeText={handleEmailChange}
                    onBlur={() => setEmail((prev) => stripAllSpaces(prev))}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    returnKeyType="send"
                    onSubmitEditing={handleRequestOtp}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && { backgroundColor: PALETTE.primaryPressed },
                    (loading || secondsLeft > 0) && styles.buttonDisabled,
                  ]}
                  onPress={handleRequestOtp}
                  disabled={loading || secondsLeft > 0}
                >
                  {loading ? (
                    <ActivityIndicator color={PALETTE.surface} size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {secondsLeft > 0 ? `Gửi lại mã sau ${secondsLeft}s` : 'Gửi mã OTP'}
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Mã OTP (6 chữ số)</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      styles.otpInput,
                      isSmallDevice && { fontSize: 18, letterSpacing: 6 },
                    ]}
                    placeholder="123456"
                    placeholderTextColor={PALETTE.textSecondary}
                    value={otp}
                    onChangeText={(val) => {
                      setOtp(stripAllSpaces(val));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Mật khẩu mới</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.textInput, styles.passwordInputPadding]}
                      placeholder="Tối thiểu 8 ký tự"
                      placeholderTextColor={PALETTE.textSecondary}
                      secureTextEntry={!isPasswordVisible}
                      value={newPassword}
                      onChangeText={(val) => {
                        setNewPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      autoCapitalize="none"
                      editable={!loading}
                      returnKeyType="done"
                      onSubmitEditing={handleResetPassword}
                    />
                    <Pressable
                      style={styles.eyeToggleBtn}
                      onPress={() => setPasswordVisible((prev) => !prev)}
                      hitSlop={8}
                    >
                      <Text style={styles.eyeToggleText}>
                        {isPasswordVisible ? 'ẨN' : 'HIỆN'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && { backgroundColor: PALETTE.primaryPressed },
                    loading && styles.buttonDisabled,
                  ]}
                  onPress={handleResetPassword}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={PALETTE.surface} size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Đổi mật khẩu</Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.resendBtn}
                  onPress={handleRequestOtp}
                  disabled={loading || secondsLeft > 0}
                >
                  <Text
                    style={[
                      styles.resendBtnText,
                      secondsLeft > 0 && styles.resendBtnTextDisabled,
                    ]}
                  >
                    {secondsLeft > 0
                      ? `Chưa nhận được? Gửi lại sau ${secondsLeft}s`
                      : 'Chưa nhận được mã? Gửi lại OTP'}
                  </Text>
                </Pressable>
              </>
            )}

            <View style={[styles.footerRow, isSmallDevice && { marginTop: 20 }]}>
              <Text style={styles.footerPrompt}>Nhớ ra mật khẩu rồi?</Text>
              <Pressable
                accessibilityRole="button"
                style={styles.linkTouchTarget}
                onPress={handleBackToLogin}
                disabled={loading}
              >
                <Text style={styles.linkText}>Đăng nhập</Text>
              </Pressable>
            </View>
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
  largeDeviceCard: {
    backgroundColor: PALETTE.surface,
    padding: 32,
    borderRadius: METRICS.radiusMd,
    borderWidth: 1,
    borderColor: PALETTE.outline,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
      },
      android: { elevation: 3 },
      web: { boxShadow: '0 8px 28px rgba(0,0,0,0.06)' } as any,
    }),
  },
  backBtn: {
    alignSelf: 'flex-start',
    minHeight: METRICS.minTouchTarget,
    justifyContent: 'center',
    marginBottom: 8,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  headerBlock: { marginBottom: 24 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.textSecondary,
    marginTop: 8,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: 12,
    borderRadius: METRICS.radiusSm,
    marginBottom: 16,
  },
  errorBannerText: {
    color: PALETTE.error,
    fontSize: 13,
    fontWeight: '500',
  },
  formGroup: { marginBottom: 18 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.textPrimary,
    marginBottom: 6,
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  textInput: {
    height: METRICS.minTouchTarget,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.outline,
    borderRadius: METRICS.radiusSm,
    paddingHorizontal: 16,
    fontSize: 15,
    color: PALETTE.textPrimary,
    width: '100%',
  },
  otpInput: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
  },
  passwordInputPadding: { paddingRight: 56 },
  eyeToggleBtn: {
    position: 'absolute',
    right: 12,
    height: METRICS.minTouchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  eyeToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.textSecondary,
    letterSpacing: 0.5,
  },
  primaryButton: {
    height: METRICS.minTouchTarget,
    backgroundColor: PALETTE.primary,
    borderRadius: METRICS.radiusSm,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    elevation: 2,
    width: '100%',
  },
  buttonDisabled: { opacity: 0.65 },
  primaryButtonText: {
    color: PALETTE.surface,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  resendBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.primary,
    textAlign: 'center',
  },
  resendBtnTextDisabled: {
    color: PALETTE.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 28,
  },
  footerPrompt: {
    fontSize: 14,
    color: PALETTE.textSecondary,
  },
  linkTouchTarget: {
    minHeight: METRICS.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.primary,
  },
});