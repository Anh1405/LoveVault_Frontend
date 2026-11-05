// src/components/home/modals/SettingsModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Share,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../../../store/useAuthStore';
import { api } from '../../../services/api';
import { ThemeColors, ThemePreset, ColorMode } from '../../../constants/theme';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { LocalNotificationService } from '../../../services/notification.service';
import { pickImageAsBase64 } from '../../../utils/imageUtils';
import {
  HEART_SKINS,
  HEART_ANIM_STYLES,
} from './modalConstantsAndUtils';
import { styles } from './modalSharedStyles';

export const SettingsModal: React.FC<{
  visible: boolean;
  colors: ThemeColors;
  onClose: () => void;
  onOpenFullProfile?: () => void;
  onLogout: () => void;
  onExportBackup: () => Promise<string>;
  onImportBackup: (rawJson: string) => Promise<void>;
}> = ({
  visible,
  colors,
  onClose,
  onOpenFullProfile,
  onLogout,
  onExportBackup,
  onImportBackup,
}) => {
  const [showImportBox, setShowImportBox] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importing, setImporting] = useState(false);
  const { user, token, setAuth } = useAuthStore();
  const {
    themePreset,
    colorMode,
    counterStyle,
    countFromOne,
    enableHeroParticles,
    notificationPrefs,
    socialPrefs,
    myProfile,
    partnerProfile,
    momoFund,
    appPinCode,
    updateAppearance,
    updateNotificationPrefs,
    updateSocialPrefs,
    updateProfiles,
    updateMomoFund,
    setPinCode,
  } = useSettingsStore();

  const handleConfirmImport = async () => {
    if (!importJsonText.trim()) {
      Alert.alert('Chưa có dữ liệu', 'Vui lòng dán nội dung JSON bản sao lưu vào ô.');
      return;
    }
    setImporting(true);
    try {
      await onImportBackup(importJsonText.trim());
      setImportJsonText('');
      setShowImportBox(false);
      Alert.alert(
        'Đồng bộ thành công',
        'Toàn bộ dữ liệu chung của phòng (hình nền, biệt danh, lịch hẹn, mục tiêu, phiếu hẹn) đã được cập nhật!',
      );
    } catch {
      Alert.alert(
        'Dữ liệu không hợp lệ',
        'Chuỗi JSON sao lưu bị lỗi định dạng. Vui lòng kiểm tra lại.',
      );
    } finally {
      setImporting(false);
    }
  };

  const [editFullName, setEditFullName] = useState(user?.fullName || myProfile.nickname);
  const [editMyNickname, setEditMyNickname] = useState(myProfile.nickname);
  const [editPartnerNickname, setEditPartnerNickname] = useState(partnerProfile.nickname);
  const [editStatusText, setEditStatusText] = useState(myProfile.customStatusText || '');
  const [savingUserInfo, setSavingUserInfo] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [momoEnabled, setMomoEnabled] = useState<boolean>(
    (momoFund as any)?.enabled !== false,
  );
  const [momoPhone, setMomoPhone] = useState(momoFund?.holderPhone || '');
  const [momoHolder, setMomoHolder] = useState(momoFund?.holderName || 'Quỹ chung hai đứa');
  const [momoLink, setMomoLink] = useState(momoFund?.momoPaymentLink || '');

  const [pinInput, setPinInput] = useState('');

  useEffect(() => {
    if (visible) {
      setEditFullName(user?.fullName || myProfile.nickname);
      setEditMyNickname(myProfile.nickname);
      setEditPartnerNickname(partnerProfile.nickname);
      setEditStatusText(myProfile.customStatusText || '');
      setMomoEnabled((momoFund as any)?.enabled !== false);
      setMomoPhone(momoFund?.holderPhone || '');
      setMomoHolder(momoFund?.holderName || 'Quỹ chung hai đứa');
      setMomoLink(momoFund?.momoPaymentLink || '');
    }
  }, [visible, user, myProfile, partnerProfile, momoFund]);

  const handleToggleMomoEnabled = async (val: boolean) => {
    setMomoEnabled(val);
    await updateMomoFund({
      ...(momoFund as any),
      enabled: val,
    } as any);
    void Haptics.selectionAsync().catch(() => {});
  };

  // Đổi ảnh đại diện dùng helper pickImageAsBase64
  const handlePickMyAvatar = async () => {
    const base64Uri = await pickImageAsBase64(400);

    if (base64Uri) {
      await updateProfiles({ avatarUri: base64Uri });
      
      // Đồng bộ vĩnh viễn lên Server
      api.patch('/api/v1/couples/shared-settings', {
        membersById: {
          [user?.id || 'me']: { avatarUri: base64Uri, updatedAt: new Date().toISOString() }
        }
      }).catch(() => null);

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleSaveUserAccountInfo = async () => {
    setSavingUserInfo(true);
    try {
      const cleanName = editFullName.trim() || 'Bạn';
      const cleanMyNick = editMyNickname.trim() || cleanName;
      const cleanPartnerNick = editPartnerNickname.trim() || 'Người ấy';

      await updateProfiles(
        {
          nickname: cleanMyNick,
          customStatusText: editStatusText.trim() || 'Đang hoạt động',
        },
        {
          nickname: cleanPartnerNick,
        },
      );

      if (user && token) {
        const updatedUser = { ...user, fullName: cleanName };
        await setAuth(token, updatedUser, user.coupleId);
        api.patch('/api/v1/users/me', { fullName: cleanName }).catch(() => null);
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Đã cập nhật', 'Biệt danh chung trong phòng và hồ sơ của bạn đã được lưu.');
    } finally {
      setSavingUserInfo(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || newPassword.length < 6) {
      Alert.alert('Thông tin chưa hợp lệ', 'Mật khẩu mới cần tối thiểu 6 ký tự.');
      return;
    }
    try {
      await api.patch('/api/v1/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswordForm(false);
      Alert.alert('Thành công', 'Mật khẩu tài khoản đã được thay đổi.');
    } catch {
      Alert.alert(
        'Đã ghi nhận yêu cầu',
        'Yêu cầu đổi mật khẩu đã được lưu. Kiểm tra kết nối máy chủ nếu chưa đồng bộ.',
      );
      setShowPasswordForm(false);
    }
  };

  const handleSaveMomoConfig = async () => {
    await updateMomoFund({
      ...(momoFund as any),
      enabled: momoEnabled,
      holderPhone: momoPhone.replace(/[^0-9]/g, ''),
      holderName: momoHolder.trim() || 'Quỹ chung hai đứa',
      momoPaymentLink: momoLink.trim(),
    } as any);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Đã lưu cấu hình MoMo', 'Thông tin Quỹ chung MoMo của phòng đã được cập nhật.');
  };

  // Đổi hình nền dùng helper pickImageAsBase64
  const pickWallpaper = async () => {
    const base64Uri = await pickImageAsBase64(1080);

    if (base64Uri) {
      // 1. Cập nhật giao diện local
      await updateAppearance({ heroWallpaperUri: base64Uri });

      // 2. Đồng bộ vĩnh viễn lên Server
      await api.patch('/api/v1/couples/shared-settings', {
        heroWallpaperUri: base64Uri,
      }).catch(() => null);
    }
  };

  const handleToggleMasterNotif = async (enabled: boolean) => {
    await updateNotificationPrefs({ masterEnabled: enabled });
    if (!enabled) {
      await LocalNotificationService.clearAllReminders();
    }
  };

  const handleBackup = async () => {
    const jsonData = await onExportBackup();
    await Share.share({
      title: 'Đồng bộ phòng chung LoveVault',
      message: jsonData,
    });
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Xóa tài khoản',
      'Toàn bộ dữ liệu kỷ niệm và liên kết cặp đôi sẽ bị xóa. Bạn có chắc chắn muốn tiếp tục?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xóa', style: 'destructive', onPress: onLogout },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheetCard, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetDragHandle} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
            Tùy chỉnh phòng chung & Tài khoản
          </Text>

          <View style={{ height: 1, backgroundColor: colors.borderSubtle, marginBottom: 12 }} />

          <ScrollView
            style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContentContainer}
          >
            {/* MỤC 1: THÔNG TIN USER & BIỆT DANH CHUNG */}
            <View style={[styles.settingsGroupBox, { borderColor: colors.borderSubtle }]}>
              <View style={styles.sectionHeaderWrap}>
                <Text style={[styles.subHeading, { color: colors.primary, marginBottom: 0, flexShrink: 1 }]}>
                  Hồ sơ của bạn & Biệt danh chung
                </Text>
                {onOpenFullProfile && (
                  <Pressable
                    style={[styles.inlineActionChip, { backgroundColor: colors.primaryContainer }]}
                    onPress={() => {
                      onClose();
                      onOpenFullProfile?.();
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.onPrimaryContainer }}>
                      Phiếu hẹn & Ghi chú ▸
                    </Text>
                  </Pressable>
                )}
              </View>

              <View
                style={[
                  styles.funBox,
                  {
                    backgroundColor: colors.surfaceVariant,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    marginTop: 6,
                  },
                ]}
              >
                <Pressable
                  onPress={handlePickMyAvatar}
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: colors.primaryContainer,
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {myProfile.avatarUri ? (
                    <Image
                      source={{ uri: myProfile.avatarUri }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>
                      {myProfile.nickname.slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </Pressable>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                    {user?.fullName || myProfile.nickname}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                    Email: {user?.email || 'Đã xác thực'}
                  </Text>
                  <Pressable onPress={handlePickMyAvatar} hitSlop={6}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 6 }}>
                      Chạm để đổi ảnh đại diện
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Họ và tên tài khoản
              </Text>
              <TextInput
                style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                value={editFullName}
                onChangeText={setEditFullName}
                placeholder="Nhập họ tên của bạn"
                placeholderTextColor={colors.textSecondary}
              />

              <View style={styles.twoColFormRow}>
                <View style={styles.colItem}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    Biệt danh của bạn
                  </Text>
                  <TextInput
                    style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                    value={editMyNickname}
                    onChangeText={setEditMyNickname}
                    placeholder="VD: Anh / Em"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                <View style={styles.colItem}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    Biệt danh người thương
                  </Text>
                  <TextInput
                    style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                    value={editPartnerNickname}
                    onChangeText={setEditPartnerNickname}
                    placeholder="VD: Bé Yêu"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Dòng trạng thái
              </Text>
              <TextInput
                style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                value={editStatusText}
                onChangeText={setEditStatusText}
                placeholder="VD: Đang nhớ đằng ấy..."
                placeholderTextColor={colors.textSecondary}
              />

              <View style={styles.twoColRow}>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1.2 }]}
                  onPress={handleSaveUserAccountInfo}
                  disabled={savingUserInfo}
                >
                  {savingUserInfo ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                      Lưu biệt danh chung
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.secondaryBtn, { backgroundColor: colors.surfaceVariant, flex: 1 }]}
                  onPress={() => setShowPasswordForm((prev) => !prev)}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                    {showPasswordForm ? 'Ẩn mật khẩu' : 'Đổi mật khẩu'}
                  </Text>
                </Pressable>
              </View>

              {showPasswordForm && (
                <View style={[styles.funBox, { backgroundColor: colors.surfaceVariant, marginTop: 12, marginBottom: 0 }]}>
                  <TextInput
                    style={[
                      styles.inputBox,
                      { borderColor: colors.outline, color: colors.textPrimary, backgroundColor: colors.surface },
                    ]}
                    placeholder="Mật khẩu hiện tại"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                  />
                  <TextInput
                    style={[
                      styles.inputBox,
                      { borderColor: colors.outline, color: colors.textPrimary, backgroundColor: colors.surface },
                    ]}
                    placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                  <Pressable
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: colors.textPrimary, flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch' },
                    ]}
                    onPress={handleChangePassword}
                  >
                    <Text style={{ color: colors.surface, fontWeight: '700', fontSize: 13 }}>
                      Xác nhận đổi mật khẩu
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* MỤC 2: QUỸ CHUNG MOMO */}
            <View style={[styles.settingsGroupBox, { borderColor: colors.borderSubtle }]}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.subHeading, { color: '#A50064', marginBottom: 4 }]}>
                    Quỹ chung MoMo cặp đôi
                  </Text>
                  <Text style={[styles.helperSubText, { color: colors.textSecondary, marginBottom: 0 }]}>
                    Bật để tích hợp nạp/rút và tự tính % theo số tiền MoMo trong mục Mục tiêu.
                  </Text>
                </View>
                <View style={{ flexShrink: 0, minWidth: 52, alignItems: 'flex-end', justifyContent: 'center' }}>
                  <Switch
                    value={momoEnabled}
                    onValueChange={(val) => void handleToggleMomoEnabled(val)}
                    trackColor={{ false: colors.outline, true: '#F472B6' }}
                    thumbColor={momoEnabled ? '#A50064' : '#F8FAFC'}
                  />
                </View>
              </View>

              {momoEnabled ? (
                <View style={{ marginTop: 12 }}>
                  <View style={styles.twoColFormRow}>
                    <View style={styles.colItem}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                        SĐT MoMo giữ quỹ
                      </Text>
                      <TextInput
                        style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                        value={momoPhone}
                        onChangeText={setMomoPhone}
                        keyboardType="phone-pad"
                        placeholder="0901234567"
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                    <View style={styles.colItem}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                        Tên hiển thị Quỹ
                      </Text>
                      <TextInput
                        style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                        value={momoHolder}
                        onChangeText={setMomoHolder}
                        placeholder="Quỹ hai đứa"
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Link Quỹ nhóm MoMo / Link nhận tiền (Tùy chọn)
                  </Text>
                  <TextInput
                    style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                    value={momoLink}
                    onChangeText={setMomoLink}
                    autoCapitalize="none"
                    placeholder="https://me.momo.vn/..."
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Pressable
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: '#A50064', flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch' },
                    ]}
                    onPress={handleSaveMomoConfig}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                      Lưu liên kết Quỹ MoMo
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View
                  style={[
                    styles.funBox,
                    { backgroundColor: colors.surfaceVariant, marginTop: 10, marginBottom: 0 },
                  ]}
                >
                  <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
                    Tính năng Quỹ chung MoMo đang tắt. Các mục tiêu chung sẽ hiển thị theo đơn vị thông thường.
                  </Text>
                </View>
              )}
            </View>

            {/* NHÓM BIỂU TƯỢNG TƯƠNG TÁC CHUNG */}
            <View style={[styles.settingsGroupBox, { borderColor: colors.borderSubtle }]}>
              <Text style={[styles.subHeading, { color: colors.textPrimary }]}>
                Biểu tượng tương tác chung
              </Text>

              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                {HEART_SKINS.map((skin) => {
                  const active = socialPrefs.heartBoxSkin === skin;
                  return (
                    <Pressable
                      key={skin}
                      style={[
                        styles.heartSkinSettingBtn,
                        {
                          flex: 1,
                          width: undefined,
                          borderColor: colors.outline,
                          backgroundColor: colors.surfaceVariant,
                        },
                        active && {
                          backgroundColor: colors.primaryContainer,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => void updateSocialPrefs({ heartBoxSkin: skin })}
                    >
                      <Text style={{ fontSize: 18 }}>{skin}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.chipWrap, { marginTop: 4 }]}>
                {HEART_ANIM_STYLES.map((st) => {
                  const active = socialPrefs.heartAnimationStyle === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      style={[
                        styles.optionPill,
                        { borderColor: colors.outline },
                        active && {
                          backgroundColor: colors.textPrimary,
                          borderColor: colors.textPrimary,
                        },
                      ]}
                      onPress={() => void updateSocialPrefs({ heartAnimationStyle: st.id })}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: active ? colors.surface : colors.textPrimary,
                        }}
                      >
                        {st.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.switchRow}>
                <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1, paddingRight: 8 }}>
                  Hiệu ứng chuyển động khi chạm
                </Text>
                <Switch
                  value={enableHeroParticles}
                  onValueChange={(val) => updateAppearance({ enableHeroParticles: val })}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1, paddingRight: 8 }}>
                  Rung phản hồi xúc giác
                </Text>
                <Switch
                  value={socialPrefs.heartTapHaptics}
                  onValueChange={(val) => updateSocialPrefs({ heartTapHaptics: val })}
                />
              </View>
            </View>

            {/* NHÓM THÔNG BÁO */}
            <View style={[styles.settingsGroupBox, { borderColor: colors.borderSubtle }]}>
              <Text style={[styles.subHeading, { color: colors.textPrimary }]}>
                Thông báo
              </Text>

              <View style={styles.switchRow}>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1, paddingRight: 8 }}>
                  Cho phép thông báo
                </Text>
                <Switch
                  value={notificationPrefs.masterEnabled}
                  onValueChange={handleToggleMasterNotif}
                />
              </View>

              {notificationPrefs.masterEnabled && (
                <>
                  <View style={styles.switchRow}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1, paddingRight: 8 }}>
                      Làm mới lời nhắc tự động mỗi ngày
                    </Text>
                    <Switch
                      value={notificationPrefs.enableAiFunnyTone}
                      onValueChange={(val) => updateNotificationPrefs({ enableAiFunnyTone: val })}
                    />
                  </View>

                  <View style={styles.switchRow}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1, paddingRight: 8 }}>
                      Nhắc ngày kỷ niệm & sinh nhật
                    </Text>
                    <Switch
                      value={notificationPrefs.enableAnniversary}
                      onValueChange={(val) => {
                        void updateNotificationPrefs({
                          enableAnniversary: val,
                          enableBirthday: val,
                        });
                      }}
                    />
                  </View>

                  <View style={styles.switchRow}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1, paddingRight: 8 }}>
                      Ẩn nội dung chi tiết trên màn hình khóa
                    </Text>
                    <Switch
                      value={notificationPrefs.hideLockScreenContent}
                      onValueChange={(val) =>
                        updateNotificationPrefs({ hideLockScreenContent: val })
                      }
                    />
                  </View>
                </>
              )}
            </View>

            {/* NHÓM GIAO DIỆN & HÌNH NỀN CHUNG CỦA PHÒNG */}
            <View style={[styles.settingsGroupBox, { borderColor: colors.borderSubtle }]}>
              <Text style={[styles.subHeading, { color: colors.textPrimary }]}>
                Giao diện & Hình nền chung của phòng
              </Text>

              <View style={styles.chipWrap}>
                {(['ROSE', 'VIOLET', 'PASTEL', 'MIDNIGHT'] as ThemePreset[]).map((preset) => (
                  <Pressable
                    key={preset}
                    style={[
                      styles.optionPill,
                      { borderColor: colors.outline },
                      themePreset === preset && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => updateAppearance({ themePreset: preset })}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: themePreset === preset ? '#FFF' : colors.textPrimary,
                      }}
                    >
                      {preset === 'ROSE'
                        ? 'Hồng'
                        : preset === 'VIOLET'
                          ? 'Tím'
                          : preset === 'PASTEL'
                            ? 'Pastel'
                            : 'Đêm'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.chipWrap}>
                {(['LIGHT', 'DARK', 'SYSTEM'] as ColorMode[]).map((mode) => (
                  <Pressable
                    key={mode}
                    style={[
                      styles.optionPill,
                      { borderColor: colors.outline },
                      colorMode === mode && { backgroundColor: colors.surfaceVariant },
                    ]}
                    onPress={() => updateAppearance({ colorMode: mode })}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary }}>
                      {mode === 'LIGHT' ? 'Sáng' : mode === 'DARK' ? 'Tối' : 'Theo hệ thống'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={[styles.twoColRow, { marginVertical: 6 }]}>
                <Pressable
                  style={[styles.secondaryBtn, { backgroundColor: colors.surfaceVariant, flex: 1 }]}
                  onPress={pickWallpaper}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '600' }}>
                    Chọn ảnh nền chung
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, { backgroundColor: colors.surfaceVariant, flex: 1 }]}
                  onPress={() => updateAppearance({ heroWallpaperUri: null })}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                    Xóa ảnh nền chung
                  </Text>
                </Pressable>
              </View>

              <View style={styles.switchRow}>
                <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1, paddingRight: 8 }}>
                  Tính ngày bắt đầu là ngày thứ 1
                </Text>
                <Switch
                  value={countFromOne}
                  onValueChange={(val) => updateAppearance({ countFromOne: val })}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1, paddingRight: 8 }}>
                  Hiển thị theo Năm, Tháng, Ngày
                </Text>
                <Switch
                  value={counterStyle === 'YMD_BREAKDOWN'}
                  onValueChange={(val) =>
                    updateAppearance({ counterStyle: val ? 'YMD_BREAKDOWN' : 'DAYS_ONLY' })
                  }
                />
              </View>
            </View>

            {/* NHÓM BẢO MẬT & ĐỒNG BỘ DỮ LIỆU PHÒNG */}
            <View style={[styles.settingsGroupBox, { borderColor: colors.borderSubtle, borderBottomWidth: 0, marginBottom: 0 }]}>
              <Text style={[styles.subHeading, { color: colors.textPrimary }]}>
                Bảo mật & Đồng bộ phòng chung
              </Text>

              <View style={[styles.twoColRow, { marginBottom: 12 }]}>
                <TextInput
                  style={[
                    styles.inputBox,
                    {
                      borderColor: colors.outline,
                      color: colors.textPrimary,
                      flex: 1,
                      marginBottom: 0,
                    },
                  ]}
                  placeholder={appPinCode ? 'Nhập mã PIN mới' : 'Mã PIN 4 số (riêng máy bạn)'}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  value={pinInput}
                  onChangeText={setPinInput}
                />
                <Pressable
                  style={[
                    styles.primaryBtn,
                    {
                      backgroundColor: colors.textPrimary,
                      flexGrow: 0,
                      flexShrink: 0,
                      flexBasis: 'auto',
                      minWidth: 96,
                      paddingHorizontal: 18,
                    },
                  ]}
                  onPress={() => {
                    if (pinInput.length === 4) {
                      void setPinCode(pinInput);
                      setPinInput('');
                      Alert.alert('Đã lưu mã PIN', 'Khóa bảo mật đã được kích hoạt.');
                    } else if (appPinCode) {
                      void setPinCode(null);
                      Alert.alert('Đã tắt mã PIN', 'Khóa bảo mật đã được gỡ bỏ.');
                    }
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.surface, fontSize: 13, fontWeight: '600' }}
                  >
                    {pinInput.length === 4 ? 'Lưu' : appPinCode ? 'Tắt khóa' : 'Đặt khóa'}
                  </Text>
                </Pressable>
              </View>

              <View style={[styles.twoColRow, { marginBottom: 10 }]}>
                <Pressable
                  style={[styles.secondaryBtn, { backgroundColor: colors.surfaceVariant, flex: 1 }]}
                  onPress={handleBackup}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '600' }}>
                    Gửi dữ liệu phòng
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.secondaryBtn, { backgroundColor: colors.primaryContainer, flex: 1 }]}
                  onPress={() => setShowImportBox((prev) => !prev)}
                >
                  <Text style={{ color: colors.onPrimaryContainer, fontSize: 12, fontWeight: '700' }}>
                    Nhận dữ liệu phòng
                  </Text>
                </Pressable>
              </View>

              {showImportBox && (
                <View style={[styles.funBox, { backgroundColor: colors.surfaceVariant, marginBottom: 12 }]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary, marginBottom: 8, lineHeight: 18 }}>
                    Dán nội dung JSON từ máy người thương gửi sang để đồng bộ tức thì mọi thứ trong phòng:
                  </Text>
                  <TextInput
                    style={[
                      styles.inputBox,
                      styles.multilineInput,
                      {
                        borderColor: colors.outline,
                        color: colors.textPrimary,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    multiline
                    placeholder='{"anniversaryDate": "2025-11-25", "heroWallpaperUri": "...", "events": [...]}'
                    placeholderTextColor={colors.textSecondary}
                    value={importJsonText}
                    onChangeText={setImportJsonText}
                  />
                  <Pressable
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: colors.primary, flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch' },
                    ]}
                    onPress={handleConfirmImport}
                    disabled={importing}
                  >
                    {importing ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                        Xác nhận đồng bộ dữ liệu phòng
                      </Text>
                    )}
                  </Pressable>
                </View>
              )}

              <Pressable
                style={[
                  styles.secondaryBtn,
                  {
                    backgroundColor: colors.errorContainer,
                    flexGrow: 0,
                    flexShrink: 0,
                    flexBasis: 'auto',
                    alignSelf: 'stretch',
                    marginTop: 16,
                    borderWidth: 1,
                    borderColor: colors.error,
                  },
                ]}
                onPress={handleDeleteAccount}
              >
                <Text style={{ color: colors.error, fontSize: 13, fontWeight: '600' }}>
                  Xóa tài khoản
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          <View style={[styles.actionFooter, { borderTopColor: colors.borderSubtle }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đăng xuất"
              style={[styles.secondaryBtn, { backgroundColor: colors.surfaceVariant, flex: 0.8 }]}
              onPress={() => {
                onClose();
                onLogout();
              }}
            >
              <Text style={{ color: colors.error, fontWeight: '600', fontSize: 13 }}>Đăng xuất</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng cài đặt"
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: colors.primary,
                  flex: 1.6,
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  elevation: 6,
                },
              ]}
              onPress={onClose}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};