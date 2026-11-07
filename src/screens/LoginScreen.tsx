// src/screens/LoginScreen.tsx
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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { storage } from '../services/storage';
import { useAuthStore } from '../store/useAuthStore';
import { getErrorMessage } from '../utils/error';
import { stripAllSpaces, validateAndNormalizeEmail } from '../utils/emailValidator';
import {
  getAppleCredential,
  SocialAuthCancelledError,
} from '../services/socialAuth';
import { PALETTE, METRICS } from '../constants/theme';

export const LoginScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isSmallDevice = screenWidth < 360 || screenHeight < 680;
  const isLargeDevice = screenWidth >= 600;

  const passwordInputRef = useRef<TextInput>(null);
  const isSubmittingRef = useRef(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'APPLE' | null>(null);

  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    const loadRememberedEmail = async () => {
      try {
        const isRemembered = await storage.getItem('remember_me_flag');
        if (isRemembered === 'true') {
          const savedEmail = await storage.getItem('remembered_email');
          if (savedEmail) {
            setEmail(savedEmail);
            setRememberMe(true);
          }
        }
      } catch {
        // Bỏ qua lỗi đọc bộ nhớ
      }
    };
    void loadRememberedEmail();
  }, []);

  const handleEmailChange = useCallback((text: string) => {
    const cleaned = stripAllSpaces(text);
    setEmail(cleaned);
    setErrorMessage(null);
    setEmailSuggestion(null);
  }, []);

  const applyEmailSuggestion = useCallback((suggestedEmail: string) => {
    setEmail(suggestedEmail);
    setEmailSuggestion(null);
    setErrorMessage(null);
  }, []);

  const handleLogin = useCallback(async () => {
    if (isSubmittingRef.current || loading || socialLoading) return;

    Keyboard.dismiss();
    setErrorMessage(null);
    setEmailSuggestion(null);

    const emailValidation = validateAndNormalizeEmail(email, false);
    if (!emailValidation.isValid) {
      setErrorMessage(emailValidation.error || 'Địa chỉ email không hợp lệ.');
      if (emailValidation.suggestion) {
        setEmailSuggestion(emailValidation.suggestion);
      }
      return;
    }

    if (!password || password.length < 8) {
      setErrorMessage('Mật khẩu phải có từ 8 ký tự trở lên.');
      return;
    }

    try {
      isSubmittingRef.current = true;
      setLoading(true);

      const idempotencyKey = `login_${emailValidation.canonicalEmail}_${Date.now()}`;
      const response = await api.post(
        '/api/v1/auth/login',
        {
          email: emailValidation.cleanEmail,
          password,
        },
        {
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      );

      if (rememberMe) {
        await storage.setItem('remembered_email', emailValidation.cleanEmail);
        await storage.setItem('remember_me_flag', 'true');
      } else {
        await storage.removeItem('remembered_email');
        await storage.removeItem('remember_me_flag');
      }

      const { accessToken, refreshToken, user, coupleId, couple_id } = response.data;
      await setAuth(
        accessToken,
        user || response.data,
        coupleId || couple_id || user?.coupleId || user?.couple_id,
        refreshToken,
      );
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }, [email, password, rememberMe, loading, socialLoading, setAuth]);

  const handleSocialLogin = useCallback(
    async (provider: 'APPLE') => {
      if (isSubmittingRef.current || loading || socialLoading) return;

      Keyboard.dismiss();
      setErrorMessage(null);

      try {
        isSubmittingRef.current = true;
        setSocialLoading(provider);

        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
        const payload = { ...(await getAppleCredential()), timezone };

        const response = await api.post(`/api/v1/auth/oauth/${provider.toLowerCase()}`, payload);

        const { accessToken, refreshToken, user, coupleId, couple_id } = response.data;
        await setAuth(
          accessToken,
          user || response.data,
          coupleId || couple_id || user?.coupleId || user?.couple_id,
          refreshToken,
        );
      } catch (error: any) {
        if (!(error instanceof SocialAuthCancelledError)) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        setSocialLoading(null);
        isSubmittingRef.current = false;
      }
    },
    [loading, socialLoading, setAuth],
  );

  const isAnyLoading = loading || socialLoading !== null;

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
            <View style={[styles.headerBlock, isSmallDevice && { marginBottom: 20 }]}>
              <Text style={[styles.brandTitle, isSmallDevice && { fontSize: 28 }]}>
                LoveVault
              </Text>
              <Text style={styles.brandSubtitle}>
                Không gian lưu trữ khoảnh khắc lứa đôi
              </Text>
            </View>

            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Địa chỉ Email</Text>
              <View style={styles.inputWrapper}>
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
                  spellCheck={false}
                  textContentType="emailAddress"
                  autoComplete="email"
                  editable={!isAnyLoading}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
              {emailSuggestion && (
                <Pressable
                  style={styles.suggestionBox}
                  onPress={() => applyEmailSuggestion(emailSuggestion)}
                >
                  <Text style={styles.suggestionText}>
                    Có phải ý bạn là{' '}
                    <Text style={styles.suggestionHighlight}>{emailSuggestion}</Text>? Bấm vào đây để sửa.
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Mật khẩu</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('ForgotPassword', { defaultEmail: email })}
                  disabled={isAnyLoading}
                  hitSlop={8}
                >
                  <Text style={styles.forgotPasswordText}>Quên mật khẩu?</Text>
                </Pressable>
              </View>
              <View style={styles.inputWrapper}>
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.textInput, styles.passwordInputPadding]}
                  placeholder="Tối thiểu 8 ký tự"
                  placeholderTextColor={PALETTE.textSecondary}
                  secureTextEntry={!isPasswordVisible}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="password"
                  editable={!isAnyLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isPasswordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  style={styles.eyeToggleBtn}
                  onPress={() => setPasswordVisible((prev) => !prev)}
                  hitSlop={8}
                >
                  <Text style={styles.eyeToggleText}>{isPasswordVisible ? 'ẨN' : 'HIỆN'}</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberMe }}
              style={styles.rememberMeRow}
              onPress={() => setRememberMe((prev) => !prev)}
              disabled={isAnyLoading}
              hitSlop={6}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.rememberMeText}>Nhớ địa chỉ email</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && { backgroundColor: PALETTE.primaryPressed },
                isAnyLoading && styles.buttonDisabled,
              ]}
              android_ripple={{ color: PALETTE.rippleLight }}
              onPress={handleLogin}
              disabled={isAnyLoading}
            >
              {loading ? (
                <ActivityIndicator color={PALETTE.surface} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Đăng nhập</Text>
              )}
            </Pressable>

            {Platform.OS === 'ios' && (
              <>
                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>HOẶC TIẾP TỤC VỚI</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.socialGroup}>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.socialButton,
                      styles.appleButton,
                      pressed && { opacity: 0.85 },
                      isAnyLoading && styles.buttonDisabled,
                    ]}
                    onPress={() => handleSocialLogin('APPLE')}
                    disabled={isAnyLoading}
                  >
                    {socialLoading === 'APPLE' ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={[styles.socialButtonText, styles.appleButtonText]}>
                        Đăng nhập bằng Apple
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}

            <View style={[styles.footerRow, isSmallDevice && { marginTop: 20 }]}>
              <Text style={styles.footerPrompt}>Chưa có tài khoản?</Text>
              <Pressable
                accessibilityRole="button"
                style={styles.linkTouchTarget}
                onPress={() => navigation.navigate('Register')}
                disabled={isAnyLoading}
              >
                <Text style={styles.linkText}>Tạo tài khoản mới</Text>
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
  headerBlock: { marginBottom: 28 },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: PALETTE.primary,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    color: PALETTE.textSecondary,
    marginTop: 6,
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.primary,
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
  suggestionBox: {
    marginTop: 6,
    padding: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: METRICS.radiusSm,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  suggestionText: {
    fontSize: 12,
    color: '#1E40AF',
  },
  suggestionHighlight: {
    fontWeight: '700',
    textDecorationLine: 'underline',
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
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 36,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: PALETTE.outline,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: PALETTE.surface,
  },
  checkboxChecked: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
  rememberMeText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  primaryButton: {
    height: METRICS.minTouchTarget,
    backgroundColor: PALETTE.primary,
    borderRadius: METRICS.radiusSm,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: PALETTE.outline,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.textSecondary,
    letterSpacing: 0.8,
  },
  socialGroup: {
    gap: 12,
  },
  socialButton: {
    height: METRICS.minTouchTarget,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.outline,
    borderRadius: METRICS.radiusSm,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  appleButton: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  appleButtonText: {
    color: '#FFFFFF',
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.textPrimary,
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