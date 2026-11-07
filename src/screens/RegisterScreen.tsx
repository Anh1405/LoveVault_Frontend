// src/screens/RegisterScreen.tsx
import React, { useState, useCallback, useRef } from 'react';
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
import { useAuthStore } from '../store/useAuthStore';
import { getErrorMessage } from '../utils/error';
import { stripAllSpaces, validateAndNormalizeEmail } from '../utils/emailValidator';
import { PALETTE, METRICS } from '../constants/theme';

export const RegisterScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isSmallDevice = screenWidth < 360 || screenHeight < 680;
  const isLargeDevice = screenWidth >= 600;

  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const isSubmittingRef = useRef(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setPasswordVisible] = useState(false);

  const [emailConflictError, setEmailConflictError] = useState<string | null>(null);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setAuth = useAuthStore((state) => state.setAuth);

  const handleEmailChange = useCallback((text: string) => {
    const cleaned = stripAllSpaces(text);
    setEmail(cleaned);
    setEmailConflictError(null);
    setEmailSuggestion(null);
    setErrorMessage(null);
  }, []);

  const applyEmailSuggestion = useCallback((suggestedEmail: string) => {
    setEmail(suggestedEmail);
    setEmailConflictError(null);
    setEmailSuggestion(null);
  }, []);

  const handleEmailBlur = useCallback(async () => {
    if (!email) return;

    const validation = validateAndNormalizeEmail(email, true);
    if (!validation.isValid) {
      setEmailConflictError(validation.error || 'Email không hợp lệ.');
      if (validation.suggestion) {
        setEmailSuggestion(validation.suggestion);
      }
      return;
    }

    try {
      setCheckingEmail(true);
      const response = await api.post('/api/v1/auth/check-email', {
        email: validation.cleanEmail,
      });
      if (response.data?.exists) {
        setEmailConflictError('Email này đã được sử dụng. Vui lòng chọn email khác hoặc đăng nhập.');
      }
    } catch (error: any) {
      if (error?.response?.status === 409) {
        setEmailConflictError('Email này đã được sử dụng. Vui lòng chọn email khác hoặc đăng nhập.');
      }
    } finally {
      setCheckingEmail(false);
    }
  }, [email]);

  const handleRegister = useCallback(async () => {
    if (isSubmittingRef.current || loading) return;

    Keyboard.dismiss();
    setErrorMessage(null);

    const cleanName = fullName.trim().replace(/\s+/g, ' ');
    const emailValidation = validateAndNormalizeEmail(email, true);

    if (!cleanName || cleanName.length < 2) {
      setErrorMessage('Vui lòng nhập họ và tên hợp lệ (tối thiểu 2 ký tự).');
      return;
    }

    if (!emailValidation.isValid) {
      const err = emailValidation.error || 'Địa chỉ email không hợp lệ.';
      setEmailConflictError(err);
      if (emailValidation.suggestion) {
        setEmailSuggestion(emailValidation.suggestion);
      }
      setErrorMessage(err);
      return;
    }

    if (emailConflictError) {
      setErrorMessage(emailConflictError);
      return;
    }

    if (password.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      setErrorMessage('Mật khẩu cần tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường và chữ số.');
      return;
    }

    try {
      isSubmittingRef.current = true;
      setLoading(true);

      const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
      const idempotencyKey = `reg_${emailValidation.canonicalEmail}_${Date.now()}`;

      const response = await api.post(
        '/api/v1/auth/register',
        {
          email: emailValidation.cleanEmail,
          password,
          fullName: cleanName,
          timezone: deviceTimezone,
        },
        {
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      );

      const { accessToken, refreshToken, user } = response.data;
      await setAuth(
        accessToken,
        user || { id: '', email: emailValidation.cleanEmail, fullName: cleanName },
        undefined,
        refreshToken,
      );
    } catch (error: any) {
      if (error?.response?.status === 409) {
        setEmailConflictError('Địa chỉ email này đã được đăng ký.');
        setErrorMessage('Địa chỉ email này đã tồn tại trên hệ thống.');
      } else {
        setErrorMessage(getErrorMessage(error));
      }
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }, [fullName, email, password, emailConflictError, loading, setAuth]);

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
              <Text style={[styles.brandTitle, isSmallDevice && { fontSize: 24 }]}>
                Bắt đầu hành trình
              </Text>
              <Text style={styles.brandSubtitle}>
                Tạo tài khoản để kết nối dữ liệu cùng đối phương
              </Text>
            </View>

            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Họ và tên của bạn</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ví dụ: Nguyễn Văn A"
                placeholderTextColor={PALETTE.textSecondary}
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                editable={!loading}
                returnKeyType="next"
                onSubmitEditing={() => emailInputRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Địa chỉ Email</Text>
                {checkingEmail && <Text style={styles.checkingText}>Đang kiểm tra...</Text>}
              </View>
              <TextInput
                ref={emailInputRef}
                style={[styles.textInput, emailConflictError ? styles.inputErrorBorder : null]}
                placeholder="tenban@gmail.com"
                placeholderTextColor={PALETTE.textSecondary}
                value={email}
                onChangeText={handleEmailChange}
                onBlur={handleEmailBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                textContentType="emailAddress"
                autoComplete="email"
                editable={!loading}
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                blurOnSubmit={false}
              />
              {emailConflictError && (
                <Text style={styles.fieldErrorText}>{emailConflictError}</Text>
              )}
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
              <Text style={styles.fieldLabel}>Mật khẩu bảo vệ</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.textInput, styles.passwordInputPadding]}
                  placeholder="Ít nhất 8 ký tự (Hoa, thường, số)"
                  placeholderTextColor={PALETTE.textSecondary}
                  secureTextEntry={!isPasswordVisible}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
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
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && { backgroundColor: PALETTE.primaryPressed },
                (loading || checkingEmail) && styles.buttonDisabled,
              ]}
              android_ripple={{ color: PALETTE.rippleLight }}
              onPress={handleRegister}
              disabled={loading || checkingEmail}
            >
              {loading ? (
                <ActivityIndicator color={PALETTE.surface} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Hoàn tất đăng ký</Text>
              )}
            </Pressable>

            <View style={[styles.footerRow, isSmallDevice && { marginTop: 20 }]}>
              <Text style={styles.footerPrompt}>Đã có tài khoản từ trước?</Text>
              <Pressable
                accessibilityRole="button"
                style={styles.linkTouchTarget}
                onPress={() => navigation.navigate('Login')}
                disabled={loading}
              >
                <Text style={styles.linkText}>Đăng nhập ngay</Text>
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
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.textPrimary,
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
    marginBottom: 6,
  },
  checkingText: {
    fontSize: 12,
    color: PALETTE.textSecondary,
    fontStyle: 'italic',
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
  inputErrorBorder: {
    borderColor: PALETTE.error,
  },
  fieldErrorText: {
    color: PALETTE.error,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
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
  primaryButton: {
    height: METRICS.minTouchTarget,
    backgroundColor: PALETTE.primary,
    borderRadius: METRICS.radiusSm,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    elevation: 2,
    width: '100%',
  },
  buttonDisabled: { opacity: 0.65 },
  primaryButtonText: {
    color: PALETTE.surface,
    fontSize: 15,
    fontWeight: '700',
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