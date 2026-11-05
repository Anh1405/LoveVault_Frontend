// src/components/home/modals/ProfileModal.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { DateTimeField } from './DateTimeField';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../../../store/useAuthStore';
import { ThemeColors, getZodiacSign } from '../../../constants/theme';
import { useSettingsStore, LoveCouponItem, PersonProfile } from '../../../store/useSettingsStore';
import {
  MOOD_LIST,
  FUN_DATE_IDEAS,
  toIsoDate,
} from './modalConstantsAndUtils';
import { styles } from './modalSharedStyles';

const PARTNER_BACKUP_KEY_PREFIX = 'lovevault_couple_profile_backup_v2_';

// Kiểm tra xem URI ảnh có hợp lệ hay là link blob cũ đã bị trình duyệt hủy
const sanitizeAvatarUri = (uri: string | null | undefined): string | null => {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
  
  // Cho phép dạng Base64 vĩnh viễn
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  
  // Loại bỏ link blob tạm thời trên Web
  if (Platform.OS === 'web' && trimmed.startsWith('blob:')) {
    return null;
  }
  
  return trimmed;
};

// Nén ảnh trên Web sang chuỗi Data URL (Base64) nhỏ gọn để không bao giờ bị mất khi F5/thoát app
const compressWebImageToDataUrl = (srcUri: string, maxSize = 240): Promise<string | null> => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(srcUri);
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const side = Math.min(img.width, img.height);
        const sx = Math.floor((img.width - side) / 2);
        const sy = Math.floor((img.height - side) / 2);
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(srcUri);
          return;
        }
        ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl || srcUri);
      } catch {
        resolve(srcUri);
      }
    };
    img.onerror = () => resolve(null);
    img.src = srcUri;
  });
};

// Chuyển đổi ảnh sang định dạng lưu trữ bền vững trên cả Web và Mobile
const saveAvatarPermanently = async (
  uri: string | null,
  base64Data?: string | null,
): Promise<string | null> => {
  if (base64Data) {
    const dataUri = base64Data.startsWith('data:image')
      ? base64Data
      : `data:image/jpeg;base64,${base64Data}`;
    if (Platform.OS === 'web') {
      return (await compressWebImageToDataUrl(dataUri, 240)) || dataUri;
    }
    return dataUri;
  }

  const cleanUri = sanitizeAvatarUri(uri);
  if (!cleanUri) return null;

  if (cleanUri.startsWith('data:image') || cleanUri.startsWith('http://') || cleanUri.startsWith('https://')) {
    return cleanUri;
  }

  if (Platform.OS === 'web') {
    return await compressWebImageToDataUrl(cleanUri, 240);
  }

  try {
    // Đọc sang Base64 trên thiết bị thật để đồng bộ được sang máy người yêu mà không bị trắng ảnh
    const base64FromFile = await FileSystem.readAsStringAsync(cleanUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (base64FromFile) {
      return `data:image/jpeg;base64,${base64FromFile}`;
    }
  } catch {
    // Fallback copy sang thư mục Document nếu không đọc được base64
  }

  if (FileSystem.documentDirectory && cleanUri.includes(FileSystem.documentDirectory)) {
    return cleanUri;
  }

  try {
    const filename = `avatar_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const permanentPath = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.copyAsync({
      from: cleanUri,
      to: permanentPath,
    });
    return permanentPath;
  } catch (error) {
    console.error('Lỗi khi lưu avatar vĩnh viễn:', error);
    return cleanUri;
  }
};

interface MemberBackupEntry {
  nickname?: string;
  birthDate: string | null;
  avatarUri: string | null;
}

interface ProfileBackupPayload {
  // Lưu tách biệt theo ID thực tế của từng thành viên, tuyệt đối không lưu my.../partner... chung cho cả phòng
  membersById: Record<string, MemberBackupEntry>;
}

const readProfileBackup = async (backupKey: string): Promise<ProfileBackupPayload | null> => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(backupKey);
      return raw ? (JSON.parse(raw) as ProfileBackupPayload) : null;
    }
    if (FileSystem.documentDirectory) {
      const fileUri = `${FileSystem.documentDirectory}${backupKey}.json`;
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(fileUri);
        return JSON.parse(raw) as ProfileBackupPayload;
      }
    }
  } catch {
    // Bỏ qua lỗi đọc backup
  }
  return null;
};

const writeProfileBackup = async (backupKey: string, payload: ProfileBackupPayload): Promise<void> => {
  try {
    const serialized = JSON.stringify(payload);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(backupKey, serialized);
      return;
    }
    if (FileSystem.documentDirectory) {
      const fileUri = `${FileSystem.documentDirectory}${backupKey}.json`;
      await FileSystem.writeAsStringAsync(fileUri, serialized);
    }
  } catch {
    // Bỏ qua lỗi ghi backup
  }
};

export const ProfileModal: React.FC<{
  visible: boolean;
  colors: ThemeColors;
  coupleId: string | null;
  onClose: () => void;
}> = ({ visible, colors, coupleId, onClose }) => {
  const { user } = useAuthStore();
  const activeStoreUserId = useSettingsStore((s) => s.activeUserId);
  const currentUserId = user?.id || activeStoreUserId || null;

  // Khóa backup gắn với cả coupleId VÀ currentUserId để không bao giờ bị lẫn giữa 2 tài khoản
  const backupKey = `${PARTNER_BACKUP_KEY_PREFIX}${coupleId || 'no_couple'}_${currentUserId || 'guest'}`;

  const {
    myProfile,
    partnerProfile,
    myPrivateNote,
    loveCoupons,
    updateProfiles,
    updateMyPrivateNote,
    addLoveCoupon,
    updateLoveCoupon,
    requestUseLoveCoupon,
    respondLoveCouponRequest,
    toggleLoveCouponUsed,
    deleteLoveCoupon,
  } = useSettingsStore();

  const [profileTab, setProfileTab] = useState<'INFO' | 'COUPONS' | 'FUN_ZONE'>('INFO');
  const [couponOwnerFilter, setCouponOwnerFilter] = useState<'MINE' | 'PARTNER'>('MINE');

  const [myNick, setMyNick] = useState(myProfile.nickname);
  const [partnerNick, setPartnerNick] = useState(partnerProfile.nickname);
  const [myBirthIso, setMyBirthIso] = useState<string | null>(myProfile.birthDate || null);
  const [partnerBirthIso, setPartnerBirthIso] = useState<string | null>(
    partnerProfile.birthDate || null,
  );
  const [myMood, setMyMood] = useState(myProfile.moodEmoji);
  const [myAvatarUri, setMyAvatarUri] = useState<string | null>(
    sanitizeAvatarUri(myProfile.avatarUri),
  );
  const [partnerAvatarUri, setPartnerAvatarUri] = useState<string | null>(
    sanitizeAvatarUri(partnerProfile.avatarUri),
  );
  const [myAvatarBroken, setMyAvatarBroken] = useState(false);
  const [partnerAvatarBroken, setPartnerAvatarBroken] = useState(false);

  const [pickingTarget, setPickingTarget] = useState<'ME' | 'PARTNER' | null>(null);
  const lastPickingTargetRef = useRef<'ME' | 'PARTNER' | null>(null);

  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [cpTitle, setCpTitle] = useState('');
  const [cpDesc, setCpDesc] = useState('');
  const [cpIcon, setCpIcon] = useState('🎟');
  const [cpTargetOwner, setCpTargetOwner] = useState<'ME' | 'PARTNER'>('ME');

  const [favDrink, setFavDrink] = useState(myPrivateNote.favDrink);
  const [shoeClothSize, setShoeClothSize] = useState(myPrivateNote.shoeClothSize);
  const [howToComfort, setHowToComfort] = useState(myPrivateNote.howToComfort);
  const [secretNote, setSecretNote] = useState(myPrivateNote.secretNote || '');
  const [randomIdea, setRandomIdea] = useState<string>(FUN_DATE_IDEAS[0]);

  const prevVisibleRef = useRef(false);
  const isDirtyRef = useRef(false);

  // Xóa bộ nhớ backup v1 cũ (nếu có) từng gây lỗi trộn hồ sơ giữa 2 tài khoản
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage && coupleId) {
      const legacyKey = `lovevault_couple_profile_backup_${coupleId}`;
      window.localStorage.removeItem(legacyKey);
    }
  }, [coupleId]);

  // Đồng bộ state từ Store (+ Backup theo đúng ID từng người) khi Modal được mở ra
  // File: src/components/home/modals/ProfileModal.tsx

// 1. Tại useEffect đồng bộ khi mở Modal (Dòng 195 - 238):
useEffect(() => {
  if (visible && !prevVisibleRef.current) {
    isDirtyRef.current = false;
    setMyNick(myProfile.nickname);
    setPartnerNick(partnerProfile.nickname);
    setMyMood(myProfile.moodEmoji);
    setMyAvatarBroken(false);
    setPartnerAvatarBroken(false);

    const cleanMyAvatar = sanitizeAvatarUri(myProfile.avatarUri);
    const cleanPartnerAvatar = sanitizeAvatarUri(partnerProfile.avatarUri);

    setMyBirthIso(myProfile.birthDate || null);
    setPartnerBirthIso(partnerProfile.birthDate || null);
    setMyAvatarUri(cleanMyAvatar);
    setPartnerAvatarUri(cleanPartnerAvatar);

    if (currentUserId) {
      // Đảm bảo partnerKey KHÔNG BAO GIỜ trùng với currentUserId
      const safePartnerKey =
        partnerProfile.userId && String(partnerProfile.userId) !== String(currentUserId)
          ? partnerProfile.userId
          : `partner_of_${currentUserId}`;

      void readProfileBackup(backupKey).then((backup) => {
        if (!backup?.membersById || isDirtyRef.current) return;
        const myBackup = backup.membersById[currentUserId];
        const partnerBackup = backup.membersById[safePartnerKey];

        if (myBackup) {
          setMyBirthIso((cur) => cur || myBackup.birthDate || null);
          setMyAvatarUri((cur) => cur || sanitizeAvatarUri(myBackup.avatarUri));
        }
        if (partnerBackup) {
          // Không lấy backup của partner nếu nó bị trùng y hệt avatar của mình do lỗi cũ
          const backupPartnerAvatar = sanitizeAvatarUri(partnerBackup.avatarUri);
          const isClonedFromMe =
            backupPartnerAvatar &&
            (backupPartnerAvatar === cleanMyAvatar || backupPartnerAvatar === myBackup?.avatarUri);

          setPartnerBirthIso((cur) => cur || partnerBackup.birthDate || null);
          if (!isClonedFromMe) {
            setPartnerAvatarUri((cur) => cur || backupPartnerAvatar);
          }
        }
      });
    }

    setFavDrink(myPrivateNote.favDrink);
    setShoeClothSize(myPrivateNote.shoeClothSize);
    setHowToComfort(myPrivateNote.howToComfort);
    setSecretNote(myPrivateNote.secretNote || '');
  }
  prevVisibleRef.current = visible;
}, [visible, backupKey, currentUserId, myProfile, partnerProfile, myPrivateNote]);

  // Nếu dữ liệu từ Server đồng bộ về sau khi Modal đang mở (và người dùng chưa tự tay sửa gì), tự cập nhật lên UI
  useEffect(() => {
    if (!visible || isDirtyRef.current) return;
    setMyNick(myProfile.nickname);
    setPartnerNick(partnerProfile.nickname);
    setMyBirthIso(myProfile.birthDate || null);
    setPartnerBirthIso(partnerProfile.birthDate || null);
    setMyAvatarUri(sanitizeAvatarUri(myProfile.avatarUri));
    setPartnerAvatarUri(sanitizeAvatarUri(partnerProfile.avatarUri));
  }, [
    visible,
    myProfile.nickname,
    myProfile.birthDate,
    myProfile.avatarUri,
    partnerProfile.nickname,
    partnerProfile.birthDate,
    partnerProfile.avatarUri,
  ]);

  const openDatePicker = (target: 'ME' | 'PARTNER') => {
    lastPickingTargetRef.current = target;
    setPickingTarget(target);
  };

  const { myCoupons, partnerCoupons, pendingPartnerRequestsCount } = useMemo(() => {
    const mine: LoveCouponItem[] = [];
    const partners: LoveCouponItem[] = [];
    let pendingFromPartner = 0;

    loveCoupons.forEach((cp, idx) => {
      const isMine = cp.ownerUserId
        ? String(cp.ownerUserId) === String(currentUserId)
        : cp.ownerSlot
          ? cp.ownerSlot === 'USER_1'
          : idx % 2 === 0;

      if (isMine) {
        mine.push(cp);
      } else {
        partners.push(cp);
        if (cp.status === 'PENDING_APPROVAL') {
          pendingFromPartner += 1;
        }
      }
    });

    return {
      myCoupons: mine,
      partnerCoupons: partners,
      pendingPartnerRequestsCount: pendingFromPartner,
    };
  }, [loveCoupons, currentUserId]);

  const compatibilityStats = useMemo(() => {
    const seedStr = `${myNick}${partnerNick}${myBirthIso || ''}${partnerBirthIso || ''}`;
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash * 31 + seedStr.charCodeAt(i)) % 1000;
    }
    const overall = 88 + (hash % 12);
    const foodMatch = 90 + ((hash >> 2) % 10);
    const telepathy = 85 + ((hash >> 3) % 15);
    return { overall, foodMatch, telepathy };
  }, [myNick, partnerNick, myBirthIso, partnerBirthIso]);

  // Chọn ảnh đại diện và chuyển ngay sang chuỗi Base64 bền vững (Không dùng link blob tạm thời)
  const pickAvatar = async (target: 'ME' | 'PARTNER') => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.65,
      base64: true,
    });
    if (!res.canceled && res.assets?.[0]) {
      isDirtyRef.current = true;
      const asset = res.assets[0];
      const permanentDataUri = await saveAvatarPermanently(asset.uri, asset.base64);
      if (target === 'ME') {
        setMyAvatarBroken(false);
        setMyAvatarUri(permanentDataUri);
      } else {
        setPartnerAvatarBroken(false);
        setPartnerAvatarUri(permanentDataUri);
      }
    }
  };

  const resetCouponForm = () => {
    setEditingCouponId(null);
    setCpTitle('');
    setCpDesc('');
    setCpIcon('🎟');
    setCpTargetOwner('ME');
  };

  const handleSaveCouponForm = async () => {
    if (!cpTitle.trim()) {
      Alert.alert('Thiếu tên phiếu', 'Vui lòng nhập tên phiếu.');
      return;
    }
    const finalTitle = cpTitle.trim();
    const finalDesc = cpDesc.trim() || 'Áp dụng khi được đối phương duyệt';

    if (editingCouponId) {
      await updateLoveCoupon(
        editingCouponId,
        finalTitle,
        finalDesc,
        cpIcon,
        cpTargetOwner,
      );
    } else {
      await addLoveCoupon(
        finalTitle,
        finalDesc,
        cpIcon,
        cpTargetOwner,
      );
    }
    setCouponOwnerFilter(cpTargetOwner === 'ME' ? 'MINE' : 'PARTNER');
    resetCouponForm();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const startEditCoupon = (item: LoveCouponItem, isMine: boolean) => {
    setEditingCouponId(item.id);
    setCpTitle(item.title);
    setCpDesc(item.desc);
    setCpIcon(item.icon || '🎟');
    setCpTargetOwner(isMine ? 'ME' : 'PARTNER');
  };

  const handleRequestUseCoupon = async (cp: LoveCouponItem) => {
    const res = await requestUseLoveCoupon(cp.id);
    if (!res.ok) {
      Alert.alert('Không thể dùng phiếu', res.reason);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Đã gửi yêu cầu dùng phiếu!',
      `Phiếu "${cp.title}" đang chờ ${partnerProfile.nickname} bấm "Cho phép" để chính thức có hiệu lực.`,
    );
  };

  const handleCancelMyCouponRequest = async (cp: LoveCouponItem) => {
    const res = await respondLoveCouponRequest(cp.id, false);
    if (!res.ok) {
      Alert.alert('Thông báo', res.reason);
      return;
    }
    void Haptics.selectionAsync().catch(() => {});
    Alert.alert(
      'Đã thu hồi yêu cầu',
      `Phiếu "${cp.title}" đã được đưa về trạng thái sẵn sàng sử dụng.`,
    );
  };

  const handlePartnerApproveOrReject = async (cp: LoveCouponItem, approve: boolean) => {
    const res = await respondLoveCouponRequest(cp.id, approve);
    if (!res.ok) {
      Alert.alert('Thông báo', res.reason);
      return;
    }
    void Haptics.notificationAsync(
      approve
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
    Alert.alert(
      approve ? 'Đã phê duyệt phiếu hẹn!' : 'Đã từ chối yêu cầu',
      approve
        ? `Bạn đã cho phép ${partnerProfile.nickname} sử dụng phiếu "${cp.title}".`
        : `Phiếu "${cp.title}" đã được trả về trạng thái chưa dùng.`,
    );
  };

  // Lưu toàn bộ thông tin profile & avatar vĩnh viễn theo ID từng thành viên
  const handleSaveProfile = async () => {
    const permanentMyAvatar = await saveAvatarPermanently(myAvatarUri);
    const permanentPartnerAvatar = await saveAvatarPermanently(partnerAvatarUri);

    const finalMyBirth = myBirthIso || null;
    const finalPartnerBirth = partnerBirthIso || null;

    // 1. Lưu bản sao dự phòng cục bộ theo ID từng người
    // 1. Lưu bản sao dự phòng cục bộ theo ID từng người
    if (currentUserId) {
      const safePartnerKey =
        partnerProfile.userId && String(partnerProfile.userId) !== String(currentUserId)
          ? partnerProfile.userId
          : `partner_of_${currentUserId}`;

      const existingBackup = await readProfileBackup(backupKey);
      await writeProfileBackup(backupKey, {
        membersById: {
          ...(existingBackup?.membersById || {}),
          [currentUserId]: {
            nickname: myNick.trim() || 'Bạn',
            birthDate: finalMyBirth,
            avatarUri: permanentMyAvatar,
          },
          [safePartnerKey]: {
            nickname: partnerNick.trim() || 'Người ấy',
            birthDate: finalPartnerBirth,
            avatarUri: permanentPartnerAvatar,
          },
        },
      });
    }

    // 2. Cập nhật Store đồng thời cả Tên, Ngày sinh và Avatar vĩnh viễn
    await updateProfiles(
      {
        nickname: myNick.trim() || 'Bạn',
        birthDate: finalMyBirth,
        moodEmoji: myMood,
        avatarUri: permanentMyAvatar,
        lastActiveAt: 'Đang hoạt động',
      },
      {
        nickname: partnerNick.trim() || 'Người ấy',
        birthDate: finalPartnerBirth,
        avatarUri: permanentPartnerAvatar,
      },
    );

    // 3. Cập nhật Ghi chú riêng
    await updateMyPrivateNote({
      favDrink,
      shoeClothSize,
      howToComfort,
      secretNote,
    });

    isDirtyRef.current = false;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  const spinDateIdea = () => {
    void Haptics.selectionAsync().catch(() => {});
    const others = FUN_DATE_IDEAS.filter((item) => item !== randomIdea);
    const picked = others[Math.floor(Math.random() * others.length)];
    setRandomIdea(picked);
  };

  const activeCouponList = couponOwnerFilter === 'MINE' ? myCoupons : partnerCoupons;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheetCard, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetDragHandle} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
            Không gian & Hồ sơ cặp đôi
          </Text>

          <View style={[styles.profileTabSwitch, { backgroundColor: colors.surfaceVariant }]}>
            {(
              [
                { id: 'INFO', label: 'Hồ sơ chung' },
                {
                  id: 'COUPONS',
                  label:
                    pendingPartnerRequestsCount > 0
                      ? `Phiếu hẹn (${pendingPartnerRequestsCount}!)`
                      : `Phiếu hẹn (${loveCoupons.length})`,
                },
                { id: 'FUN_ZONE', label: 'Ghi chú riêng' },
              ] as const
            ).map((t) => (
              <Pressable
                key={t.id}
                style={[
                  styles.profileTabBtn,
                  profileTab === t.id && { backgroundColor: colors.surface },
                ]}
                onPress={() => setProfileTab(t.id)}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: profileTab === t.id ? '700' : '500',
                    color: profileTab === t.id ? colors.textPrimary : colors.textSecondary,
                  }}
                  numberOfLines={1}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContentContainer}
          >
            {profileTab === 'INFO' && (
              <>
                <Text style={[styles.helperSubText, { color: colors.textSecondary }]}>
                  Biệt danh, ảnh đại diện và ngày sinh ở đây được đồng bộ chung cho cả phòng.
                </Text>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Trạng thái hiện tại của bạn
                </Text>
                <View style={styles.moodRow}>
                  {MOOD_LIST.map((emoji) => (
                    <Pressable
                      key={emoji}
                      style={[
                        styles.moodChip,
                        { backgroundColor: colors.surfaceVariant },
                        myMood === emoji && { borderColor: colors.primary, borderWidth: 1.5 },
                      ]}
                      onPress={() => {
                        isDirtyRef.current = true;
                        setMyMood(emoji);
                      }}
                    >
                      <Text style={styles.moodChipEmoji}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={[styles.profileSection, { borderColor: colors.borderSubtle }]}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: colors.primaryContainer,
                          justifyContent: 'center',
                          alignItems: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {myAvatarUri && !myAvatarBroken ? (
                          <Image
                            source={{ uri: myAvatarUri }}
                            style={{ width: 40, height: 40 }}
                            resizeMode="cover"
                            onError={() => {
                              setMyAvatarBroken(true);
                              setMyAvatarUri(null);
                            }}
                          />
                        ) : (
                          <Text style={{ fontSize: 18 }}>{myMood || '😊'}</Text>
                        )}
                      </View>
                      <Text
                        style={[styles.subHeading, { color: colors.textPrimary, marginBottom: 0, flex: 1 }]}
                        numberOfLines={1}
                      >
                        Bạn ({myNick.trim() || myProfile.nickname})
                      </Text>
                    </View>

                    <Pressable
                      style={[styles.inlineActionChip, { backgroundColor: colors.primaryContainer }]}
                      onPress={() => void pickAvatar('ME')}
                    >
                      <Text style={{ color: colors.onPrimaryContainer, fontSize: 12, fontWeight: '700' }}>
                        Đổi ảnh đại diện
                      </Text>
                    </Pressable>
                  </View>

                  <TextInput
                    style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                    value={myNick}
                    onChangeText={(txt) => {
                      isDirtyRef.current = true;
                      setMyNick(txt);
                    }}
                    placeholder="Biệt danh của bạn trong phòng"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <View style={styles.rowBetween}>
                    <Pressable
                      style={[styles.dateBtn, { borderColor: colors.outline, flex: 1, marginRight: 10 }]}
                      onPress={() => openDatePicker('ME')}
                    >
                      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '500' }}>
                        Ngày sinh: {myBirthIso || 'Chọn ngày'}
                      </Text>
                    </Pressable>
                    <Text
                      style={[
                        styles.zodiacBadge,
                        { color: colors.textSecondary, backgroundColor: colors.surfaceVariant },
                      ]}
                    >
                      {getZodiacSign(myBirthIso)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.profileSection, { borderColor: colors.borderSubtle }]}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: colors.surfaceVariant,
                          justifyContent: 'center',
                          alignItems: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {partnerAvatarUri && !partnerAvatarBroken ? (
                          <Image
                            source={{ uri: partnerAvatarUri }}
                            style={{ width: 40, height: 40 }}
                            resizeMode="cover"
                            onError={() => {
                              setPartnerAvatarBroken(true);
                              setPartnerAvatarUri(null);
                            }}
                          />
                        ) : (
                          <Text style={{ fontSize: 18 }}>{partnerProfile.moodEmoji || '🥰'}</Text>
                        )}
                      </View>
                      <Text
                        style={[styles.subHeading, { color: colors.textPrimary, marginBottom: 0, flex: 1 }]}
                        numberOfLines={1}
                      >
                        Người thương ({partnerNick.trim() || partnerProfile.nickname})
                      </Text>
                    </View>

                    <Pressable
                      style={[styles.inlineActionChip, { backgroundColor: colors.primaryContainer }]}
                      onPress={() => void pickAvatar('PARTNER')}
                    >
                      <Text style={{ color: colors.onPrimaryContainer, fontSize: 12, fontWeight: '700' }}>
                        Đổi ảnh đại diện
                      </Text>
                    </Pressable>
                  </View>

                  <TextInput
                    style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                    value={partnerNick}
                    onChangeText={(txt) => {
                      isDirtyRef.current = true;
                      setPartnerNick(txt);
                    }}
                    placeholder="Biệt danh của người thương"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <View style={styles.rowBetween}>
                    <Pressable
                      style={[styles.dateBtn, { borderColor: colors.outline, flex: 1, marginRight: 10 }]}
                      onPress={() => openDatePicker('PARTNER')}
                    >
                      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '500' }}>
                        Ngày sinh: {partnerBirthIso || 'Chọn ngày'}
                      </Text>
                    </Pressable>
                    <Text
                      style={[
                        styles.zodiacBadge,
                        { color: colors.textSecondary, backgroundColor: colors.surfaceVariant },
                      ]}
                    >
                      {getZodiacSign(partnerBirthIso)}
                    </Text>
                  </View>
                </View>

                <DateTimeField
                  visible={pickingTarget !== null}
                  mode="date"
                  title={
                    pickingTarget === 'PARTNER'
                      ? 'Chọn ngày sinh người thương'
                      : 'Chọn ngày sinh của bạn'
                  }
                  colors={colors}
                  maximumDate={new Date()}
                  value={(() => {
                    const activeTarget = pickingTarget || lastPickingTargetRef.current;
                    const iso = activeTarget === 'PARTNER' ? partnerBirthIso : myBirthIso;
                    if (iso) {
                      const [y, m, d] = iso.split('-').map(Number);
                      if (y && m && d) return new Date(y, m - 1, d);
                    }
                    return new Date(2002, 0, 1);
                  })()}
                  onChange={(selected) => {
                    isDirtyRef.current = true;
                    const iso = toIsoDate(selected);
                    const target = pickingTarget || lastPickingTargetRef.current;
                    if (target === 'ME') {
                      setMyBirthIso(iso);
                    } else if (target === 'PARTNER') {
                      setPartnerBirthIso(iso);
                    }
                  }}
                  onClose={() => setPickingTarget(null)}
                />

                <Text style={[styles.helperNote, { color: colors.textSecondary }]}>
                  Mã phòng chung: {coupleId || 'Đang kết nối'}
                </Text>
              </>
            )}

            {/* TAB 2: PHIẾU HẸN */}
            {profileTab === 'COUPONS' && (
              <View>
                <View style={[styles.couponEditorCard, { backgroundColor: colors.surfaceVariant }]}>
                  <Text style={[styles.subHeading, { color: colors.textPrimary }]}>
                    {editingCouponId ? 'Chỉnh sửa phiếu hẹn' : 'Tạo phiếu hẹn mới'}
                  </Text>

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Phiếu này dành cho ai sử dụng?
                  </Text>
                  <View style={styles.twoColRow}>
                    <Pressable
                      style={[
                        styles.optionPill,
                        {
                          flex: 1,
                          borderColor: cpTargetOwner === 'ME' ? colors.primary : colors.outline,
                          backgroundColor:
                            cpTargetOwner === 'ME' ? colors.primaryContainer : colors.surface,
                        },
                      ]}
                      onPress={() => setCpTargetOwner('ME')}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color:
                            cpTargetOwner === 'ME'
                              ? colors.onPrimaryContainer
                              : colors.textSecondary,
                        }}
                        numberOfLines={1}
                      >
                        🎟 Của {myNick.trim() || myProfile.nickname}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.optionPill,
                        {
                          flex: 1,
                          borderColor: cpTargetOwner === 'PARTNER' ? colors.primary : colors.outline,
                          backgroundColor:
                            cpTargetOwner === 'PARTNER' ? colors.primaryContainer : colors.surface,
                        },
                      ]}
                      onPress={() => setCpTargetOwner('PARTNER')}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color:
                            cpTargetOwner === 'PARTNER'
                              ? colors.onPrimaryContainer
                              : colors.textSecondary,
                        }}
                        numberOfLines={1}
                      >
                        🎁 Tặng {partnerNick.trim() || partnerProfile.nickname}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={[styles.rowBetween, { marginTop: 4 }]}>
                    {['🎟', '🧋', '💆', '🎬', '🍜', '🛍'].map((ic) => (
                      <Pressable
                        key={ic}
                        style={[
                          styles.iconSelectChip,
                          { backgroundColor: colors.surface },
                          cpIcon === ic && { borderColor: colors.primary, borderWidth: 1.5 },
                        ]}
                        onPress={() => setCpIcon(ic)}
                      >
                        <Text style={{ fontSize: 18 }}>{ic}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <TextInput
                    style={[
                      styles.inputBox,
                      { borderColor: colors.outline, color: colors.textPrimary, backgroundColor: colors.surface },
                    ]}
                    placeholder="Tên phiếu (VD: Bao trà sữa / Miễn rửa bát)"
                    placeholderTextColor={colors.textSecondary}
                    value={cpTitle}
                    onChangeText={setCpTitle}
                  />

                  <TextInput
                    style={[
                      styles.inputBox,
                      { borderColor: colors.outline, color: colors.textPrimary, backgroundColor: colors.surface },
                    ]}
                    placeholder="Điều kiện áp dụng (Cần người kia duyệt)"
                    placeholderTextColor={colors.textSecondary}
                    value={cpDesc}
                    onChangeText={setCpDesc}
                  />

                  <View style={styles.twoColRow}>
                    {editingCouponId && (
                      <Pressable
                        style={[styles.secondaryBtn, { backgroundColor: colors.surface }]}
                        onPress={resetCouponForm}
                      >
                        <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                          Hủy
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                      onPress={() => void handleSaveCouponForm()}
                    >
                      <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 13 }}>
                        {editingCouponId ? 'Cập nhật phiếu' : '+ Thêm vào kho phiếu'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.profileTabSwitch, { backgroundColor: colors.surfaceVariant }]}>
                  <Pressable
                    style={[
                      styles.profileTabBtn,
                      couponOwnerFilter === 'MINE' && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setCouponOwnerFilter('MINE')}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: couponOwnerFilter === 'MINE' ? '#FFFFFF' : colors.textSecondary,
                      }}
                      numberOfLines={1}
                    >
                      Của {myNick.trim() || myProfile.nickname} ({myCoupons.length})
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.profileTabBtn,
                      couponOwnerFilter === 'PARTNER' && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setCouponOwnerFilter('PARTNER')}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: couponOwnerFilter === 'PARTNER' ? '#FFFFFF' : colors.textSecondary,
                      }}
                      numberOfLines={1}
                    >
                      Của {partnerNick.trim() || partnerProfile.nickname} ({partnerCoupons.length})
                      {pendingPartnerRequestsCount > 0 ? ` • 🔔 ${pendingPartnerRequestsCount}` : ''}
                    </Text>
                  </Pressable>
                </View>

                <Text style={[styles.helperSubText, { color: colors.textSecondary }]}>
                  {couponOwnerFilter === 'MINE'
                    ? `Khi bạn bấm "Xin dùng phiếu", ${partnerNick.trim() || partnerProfile.nickname} phải bấm "Cho phép" thì phiếu mới được áp dụng.`
                    : `Đây là các phiếu của ${partnerNick.trim() || partnerProfile.nickname}. Khi ${partnerNick.trim() || partnerProfile.nickname} muốn dùng, bạn là người bấm "Cho phép" tại đây.`}
                </Text>

                {activeCouponList.length === 0 ? (
                  <View style={[styles.funBox, { backgroundColor: colors.surfaceVariant, alignItems: 'center' }]}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
                      Chưa có phiếu hẹn nào trong ngăn này.
                    </Text>
                  </View>
                ) : (
                  activeCouponList.map((cp) => {
                    const isMine = couponOwnerFilter === 'MINE';
                    const isPending = cp.status === 'PENDING_APPROVAL';
                    const isUsed = cp.status === 'USED' || cp.used;

                    return (
                      <View
                        key={cp.id}
                        style={[
                          styles.couponCard,
                          {
                            borderColor: isPending ? '#F59E0B' : colors.borderSubtle,
                            backgroundColor: colors.surface,
                          },
                          isUsed && { opacity: 0.6 },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: '700',
                                color: colors.textPrimary,
                                textDecorationLine: isUsed ? 'line-through' : 'none',
                              }}
                            >
                              {cp.icon}  {cp.title}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>
                              {cp.desc}
                            </Text>

                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 }}>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '700',
                                  color: isUsed
                                    ? colors.success
                                    : isPending
                                      ? '#D97706'
                                      : colors.primary,
                                }}
                              >
                                {isUsed
                                  ? `✓ Đã được duyệt & sử dụng`
                                  : isPending
                                    ? isMine
                                      ? `⏳ Chờ ${partnerNick.trim() || partnerProfile.nickname} duyệt...`
                                      : `🔔 ${partnerNick.trim() || partnerProfile.nickname} xin dùng!`
                                    : 'Sẵn sàng sử dụng'}
                              </Text>

                              <Pressable onPress={() => startEditCoupon(cp, isMine)} hitSlop={8}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>
                                  Sửa
                                </Text>
                              </Pressable>
                              <Pressable onPress={() => void deleteLoveCoupon(cp.id)} hitSlop={8}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.error }}>
                                  Xóa
                                </Text>
                              </Pressable>
                            </View>
                          </View>

                          {isMine && !isPending && !isUsed && (
                            <Pressable
                              style={[
                                styles.couponBadge,
                                { backgroundColor: colors.primaryContainer },
                              ]}
                              onPress={() => void handleRequestUseCoupon(cp)}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '700',
                                  color: colors.onPrimaryContainer,
                                }}
                              >
                                Xin dùng
                              </Text>
                            </Pressable>
                          )}

                          {isMine && isPending && (
                            <Pressable
                              style={[
                                styles.couponBadge,
                                { backgroundColor: colors.surfaceVariant },
                              ]}
                              onPress={() => void handleCancelMyCouponRequest(cp)}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                                Hủy
                              </Text>
                            </Pressable>
                          )}

                          {isUsed && (
                            <Pressable
                              style={[
                                styles.couponBadge,
                                { backgroundColor: colors.surfaceVariant },
                              ]}
                              onPress={() => void toggleLoveCouponUsed(cp.id)}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                                Cấp lại
                              </Text>
                            </Pressable>
                          )}
                        </View>

                        {!isMine && isPending && (
                          <View
                            style={{
                              flexDirection: 'row',
                              gap: 8,
                              marginTop: 12,
                              paddingTop: 12,
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: colors.borderSubtle,
                            }}
                          >
                            <Pressable
                              style={{
                                flex: 1.4,
                                minHeight: 40,
                                borderRadius: 10,
                                backgroundColor: '#16A34A',
                                justifyContent: 'center',
                                alignItems: 'center',
                                paddingHorizontal: 8,
                              }}
                              onPress={() => void handlePartnerApproveOrReject(cp, true)}
                            >
                              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                                ✓ Cho phép {partnerNick.trim() || partnerProfile.nickname} dùng
                              </Text>
                            </Pressable>

                            <Pressable
                              style={{
                                flex: 1,
                                minHeight: 40,
                                borderRadius: 10,
                                backgroundColor: colors.errorContainer,
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}
                              onPress={() => void handlePartnerApproveOrReject(cp, false)}
                            >
                              <Text style={{ color: colors.error, fontSize: 12, fontWeight: '700' }}>
                                ✕ Từ chối
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* TAB 3: GHI CHÚ RIÊNG */}
            {profileTab === 'FUN_ZONE' && (
              <View>
                <View style={[styles.funBox, { backgroundColor: colors.surfaceVariant }]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Độ ăn ý ({getZodiacSign(myBirthIso)} & {getZodiacSign(partnerBirthIso)})
                  </Text>
                  <Text style={[styles.matchScoreBig, { color: colors.textPrimary }]}>
                    {compatibilityStats.overall}%
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    Ăn uống: {compatibilityStats.foodMatch}%  •  Đồng điệu: {compatibilityStats.telepathy}%
                  </Text>
                </View>

                <View style={[styles.funBox, { backgroundColor: colors.surfaceVariant }]}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.subHeading, { color: colors.textPrimary, marginBottom: 0 }]}>
                      Gợi ý hẹn hò
                    </Text>
                    <Pressable
                      style={[styles.miniSpinBtn, { backgroundColor: colors.surface }]}
                      onPress={spinDateIdea}
                    >
                      <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '600' }}>
                        Đổi gợi ý
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary, marginTop: 4, lineHeight: 20 }}>
                    {randomIdea}
                  </Text>
                </View>

                <Text style={[styles.subHeading, { color: colors.textPrimary, marginTop: 6 }]}>
                  Sổ tay ghi chú riêng của {myProfile.nickname}
                </Text>
                <Text style={[styles.helperSubText, { color: colors.textSecondary }]}>
                  Ghi chú này là dữ liệu riêng của tài khoản bạn để nhớ thói quen của {partnerNick}, không bị ghi đè với sổ tay của {partnerNick}.
                </Text>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Món ăn / Đồ uống {partnerNick} thích
                </Text>
                <TextInput
                  style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                  value={favDrink}
                  onChangeText={setFavDrink}
                  placeholder="VD: Trà sữa ít đường, trân châu trắng..."
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Cỡ trang phục & Giày của {partnerNick}
                </Text>
                <TextInput
                  style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                  value={shoeClothSize}
                  onChangeText={setShoeClothSize}
                  placeholder="VD: Áo size M, giày size 37..."
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Bí kíp khi cần dỗ dành {partnerNick}
                </Text>
                <TextInput
                  style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                  value={howToComfort}
                  onChangeText={setHowToComfort}
                  placeholder="VD: Mua đồ ngọt, ôm một cái..."
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Ghi chú cá nhân khác (Quà dự định tặng, điều cần nhớ...)
                </Text>
                <TextInput
                  style={[
                    styles.inputBox,
                    styles.multilineInput,
                    { borderColor: colors.outline, color: colors.textPrimary },
                  ]}
                  multiline
                  placeholder="Viết ghi chú riêng của bạn..."
                  placeholderTextColor={colors.textSecondary}
                  value={secretNote}
                  onChangeText={setSecretNote}
                />
              </View>
            )}
          </ScrollView>

          <View style={[styles.actionFooter, { borderTopColor: colors.borderSubtle }]}>
            <Pressable
              style={[styles.secondaryBtn, { backgroundColor: colors.surfaceVariant }]}
              onPress={onClose}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14 }}>Đóng</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => void handleSaveProfile()}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Lưu thay đổi</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};