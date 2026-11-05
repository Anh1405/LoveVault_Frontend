// src/components/home/modals/EventAndGoalFormModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { DateTimeField } from './DateTimeField';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '../../../constants/theme';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { AiToneStyle } from '../../../services/notification.service';
import {
  ImportantEvent,
  CoupleGoalItem,
  DatePlanActivityType,
  TransportMode,
  DatePlanStop,
  openAddressInGoogleMaps,
} from '../../../hooks/useCoupleWorkspace';
import {
  ADVANCE_DAYS,
  START_REMINDER_MINS,
  AI_TONE_CHIPS,
  DATE_ACTIVITY_OPTIONS,
  TRANSPORT_OPTIONS,
  STOP_ACTIVITY_LABELS,
  toIsoDate,
  toHmString,
  parseHmToDate,
  hmToMinutes,
} from './modalConstantsAndUtils';
import { styles } from './modalSharedStyles';

// Alert.alert của React Native không hiển thị gì trên web, nên dùng window.alert ở đó.
const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const EventAndGoalFormModal: React.FC<{
  visible: boolean;
  mode: 'EVENT' | 'GOAL';
  initialEventCategory?: 'ANNIVERSARY' | 'BIRTHDAY' | 'DATE_PLAN';
  colors: ThemeColors;
  editingEvent?: ImportantEvent | null;
  editingGoal?: CoupleGoalItem | null;
  onClose: () => void;
  onSaveEvent: (
    data: Omit<ImportantEvent, 'id' | 'notificationId' | 'syncStatus'>,
    editingId?: string,
  ) => Promise<void>;
  onSaveGoal: (
    data: Omit<CoupleGoalItem, 'id' | 'isCompleted' | 'notificationId' | 'syncStatus'>,
    editingId?: string,
  ) => Promise<void>;
}> = ({
  visible,
  mode,
  initialEventCategory = 'ANNIVERSARY',
  colors,
  editingEvent,
  editingGoal,
  onClose,
  onSaveEvent,
  onSaveGoal,
}) => {
  const { momoFund } = useSettingsStore();
  const isMomoGlobalEnabled = (momoFund as any)?.enabled !== false;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'ANNIVERSARY' | 'BIRTHDAY' | 'DATE_PLAN'>(
    'ANNIVERSARY',
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<Date>(() => parseHmToDate('18:30'));
  const [notifyDaysBefore, setNotifyDaysBefore] = useState<number>(1);
  const [aiTone, setAiTone] = useState<AiToneStyle>('FUNNY');
  const [autoDailyAi, setAutoDailyAi] = useState<boolean>(true);
  const [customMsg, setCustomMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Kế hoạch đi chơi & Chặng tiến trình
  const [activityType, setActivityType] = useState<DatePlanActivityType>('EAT_AND_DRINK');
  const [transport, setTransport] = useState<TransportMode>('PICKUP');
  const [transportNote, setTransportNote] = useState('Qua đón đúng giờ nhé');
  const [enableEndTime, setEnableEndTime] = useState<boolean>(true);
  const [endTimeDate, setEndTimeDate] = useState<Date>(() => parseHmToDate('21:30'));
  const [notifyStartTime, setNotifyStartTime] = useState<boolean>(true);
  const [startRemindMinutesBefore, setStartRemindMinutesBefore] = useState<number>(30);
  const [notifyEndTime, setNotifyEndTime] = useState<boolean>(false);

  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const [stops, setStops] = useState<DatePlanStop[]>([]);
  const [showAddStopCreator, setShowAddStopCreator] = useState<boolean>(false);

  // State thêm chặng chi tiết
  const [stopTimeDate, setStopTimeDate] = useState<Date>(() => parseHmToDate('19:30'));
  const [stopActivity, setStopActivity] = useState<DatePlanStop['activityType']>('EAT');
  const [stopTitle, setStopTitle] = useState('');
  const [stopAddress, setStopAddress] = useState('');

  // Quản lý các Date/Time Pickers Native
  const [activePicker, setActivePicker] = useState<
    'DATE' | 'START_TIME' | 'END_TIME' | 'STOP_TIME' | null
  >(null);

  // State cho Goal & Quỹ MoMo
  const [isMomoLinked, setIsMomoLinked] = useState<boolean>(isMomoGlobalEnabled);
  const [currentAmount, setCurrentAmount] = useState('0');
  const [targetAmount, setTargetAmount] = useState('5000000');
  const [unitLabel, setUnitLabel] = useState('đ');

  const numericCurrent = Math.max(0, Number(currentAmount.replace(/[^0-9]/g, '')) || 0);
  const numericTarget = Math.max(1, Number(targetAmount.replace(/[^0-9]/g, '')) || 1);
  const livePercentage = Math.min(100, Math.max(0, (numericCurrent / numericTarget) * 100));
  const remainingMoney = Math.max(0, numericTarget - numericCurrent);

  useEffect(() => {
    if (!visible) return;
    setShowAddStopCreator(false);

    if (mode === 'EVENT' && editingEvent) {
      setTitle(editingEvent.title);
      setCategory(
        editingEvent.category === 'BIRTHDAY'
          ? 'BIRTHDAY'
          : editingEvent.category === 'DATE_PLAN'
            ? 'DATE_PLAN'
            : 'ANNIVERSARY',
      );
      const [y, m, d] = editingEvent.eventDate.split('-').map(Number);
      setSelectedDate(new Date(y, m - 1, d));
      setSelectedTime(parseHmToDate(editingEvent.notifyAtTime));
      setNotifyDaysBefore(editingEvent.notifyDaysBefore);
      setAiTone(editingEvent.aiTone || 'FUNNY');
      setAutoDailyAi(editingEvent.autoDailyAi ?? true);
      setCustomMsg(editingEvent.customMessage);

      if (editingEvent.datePlan) {
        const dp = editingEvent.datePlan as any;
        setActivityType(dp.activityType || 'EAT_AND_DRINK');
        setTransport(dp.transport || 'PICKUP');
        setTransportNote(dp.transportNote || '');

        const hasEndTime = Boolean(dp.endTimeHm) && dp.enableEndTime !== false;
        setEnableEndTime(hasEndTime);
        setEndTimeDate(parseHmToDate(dp.endTimeHm || '21:30'));

        setNotifyStartTime(dp.notifyStartTime ?? true);
        setStartRemindMinutesBefore(
          typeof dp.startRemindMinutesBefore === 'number' ? dp.startRemindMinutesBefore : 30,
        );
        setNotifyEndTime(hasEndTime ? Boolean(dp.notifyEndTime) : false);

        setLocationName(dp.locationName || '');
        setAddress(dp.address || '');
        setGoogleMapsUrl(dp.googleMapsUrl || '');
        setEstimatedBudget(dp.estimatedBudget ? String(dp.estimatedBudget) : '');

        const existingStops: DatePlanStop[] = dp.stops || [];
        setStops(existingStops);
        if (existingStops.length > 0) {
          const lastStopDate = parseHmToDate(existingStops[existingStops.length - 1].timeHm);
          setStopTimeDate(new Date(lastStopDate.getTime() + 45 * 60 * 1000));
        } else {
          setStopTimeDate(parseHmToDate('19:30'));
        }
      } else {
        setActivityType('EAT_AND_DRINK');
        setTransport('PICKUP');
        setTransportNote('');
        setEnableEndTime(true);
        setEndTimeDate(parseHmToDate('21:30'));
        setNotifyStartTime(true);
        setStartRemindMinutesBefore(30);
        setNotifyEndTime(false);
        setStopTimeDate(parseHmToDate('19:30'));
        setLocationName('');
        setAddress('');
        setGoogleMapsUrl('');
        setEstimatedBudget('');
        setStops([]);
      }
    } else if (mode === 'GOAL' && editingGoal) {
      setTitle(editingGoal.title);
      const [y, m, d] = editingGoal.targetDate.split('-').map(Number);
      setSelectedDate(new Date(y, m - 1, d));
      setSelectedTime(parseHmToDate(editingGoal.notifyTime));
      setIsMomoLinked(isMomoGlobalEnabled ? (editingGoal.isMomoLinked ?? true) : false);
      setCurrentAmount(String(editingGoal.currentAmount));
      setTargetAmount(String(editingGoal.targetAmount));
      setUnitLabel(editingGoal.unitLabel || (isMomoGlobalEnabled ? 'đ' : '%'));
      setCustomMsg(editingGoal.customNotifyMessage);
    } else {
      setTitle('');
      setCategory(initialEventCategory);
      setSelectedDate(new Date());
      setSelectedTime(
        parseHmToDate(initialEventCategory === 'DATE_PLAN' ? '18:30' : '08:30'),
      );
      setNotifyDaysBefore(initialEventCategory === 'DATE_PLAN' ? 0 : 1);
      setAiTone('FUNNY');
      setAutoDailyAi(initialEventCategory !== 'DATE_PLAN');
      setCustomMsg('');

      setActivityType('EAT_AND_DRINK');
      setTransport('PICKUP');
      setTransportNote('Qua đón đúng giờ nhé');
      setEnableEndTime(true);
      setEndTimeDate(parseHmToDate('21:30'));
      setNotifyStartTime(true);
      setStartRemindMinutesBefore(30);
      setNotifyEndTime(false);
      setStopTimeDate(parseHmToDate('19:30'));
      setLocationName('');
      setAddress('');
      setGoogleMapsUrl('');
      setEstimatedBudget('');
      setStops([]);

      setIsMomoLinked(isMomoGlobalEnabled);
      setCurrentAmount('0');
      setTargetAmount(isMomoGlobalEnabled ? '5000000' : '100');
      setUnitLabel(isMomoGlobalEnabled ? 'đ' : '%');
    }
  }, [visible, mode, editingEvent, editingGoal, initialEventCategory, isMomoGlobalEnabled]);

  const handleToggleEnableEndTime = (val: boolean) => {
    setEnableEndTime(val);
    if (!val) {
      setNotifyEndTime(false);
    }
    void Haptics.selectionAsync().catch(() => {});
  };

  // Thêm điểm dừng và tự động sắp xếp theo thứ tự thời gian tăng dần
  const handleAddStop = () => {
    if (!stopTitle.trim()) {
      showAlert('Thiếu thông tin', 'Vui lòng nhập tên quán hoặc hoạt động của chặng này.');
      return;
    }

    const newStopHm = toHmString(stopTimeDate);
    const newStopMins = hmToMinutes(newStopHm);
    const startMins = hmToMinutes(toHmString(selectedTime));

    if (newStopMins <= startMins) {
      showAlert(
        'Thời gian chưa hợp lý',
        `Giờ của chặng (${newStopHm}) cần diễn ra sau giờ bắt đầu hẹn (${toHmString(selectedTime)}).`,
      );
      return;
    }

    if (enableEndTime && newStopMins >= hmToMinutes(toHmString(endTimeDate))) {
      showAlert(
        'Thời gian chưa hợp lý',
        `Giờ của chặng (${newStopHm}) cần diễn ra trước giờ về dự kiến (${toHmString(endTimeDate)}). Bạn có thể chỉnh tăng giờ về hoặc tắt giới hạn giờ về.`,
      );
      return;
    }

    const newStop: DatePlanStop = {
      id: `stop_${Date.now()}`,
      timeHm: newStopHm,
      activityType: stopActivity,
      title: stopTitle.trim(),
      address: stopAddress.trim(),
    };

    const updatedStops = [...stops, newStop].sort(
      (a, b) => hmToMinutes(a.timeHm) - hmToMinutes(b.timeHm),
    );
    setStops(updatedStops);
    setStopTitle('');
    setStopAddress('');
    setShowAddStopCreator(false);

    const nextDate = new Date(stopTimeDate.getTime() + 45 * 60 * 1000);
    setStopTimeDate(nextDate);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleRemoveStop = (stopId: string) => {
    setStops((prev) => prev.filter((s) => s.id !== stopId));
    void Haptics.selectionAsync().catch(() => {});
  };

  // Việc lên lịch thông báo đã được saveEvent xử lý, không lên lịch lại ở đây để tránh trùng.
  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      showAlert(
        'Thiếu tiêu đề',
        mode === 'EVENT' && category === 'DATE_PLAN'
          ? 'Vui lòng nhập tên buổi đi chơi (VD: Hẹn hò tối thứ 7).'
          : 'Vui lòng nhập tên sự kiện hoặc mục tiêu.',
      );
      return;
    }

    const dateIso = toIsoDate(selectedDate);
    const startTimeHm = toHmString(selectedTime);
    const endTimeHm = enableEndTime ? toHmString(endTimeDate) : undefined;

    if (mode === 'EVENT' && category === 'DATE_PLAN' && enableEndTime && endTimeHm) {
      const lastMins =
        stops.length > 0
          ? hmToMinutes(stops[stops.length - 1].timeHm)
          : hmToMinutes(startTimeHm);

      if (hmToMinutes(endTimeHm) <= lastMins) {
        const lastLabel =
          stops.length > 0 ? `chặng cuối (${stops[stops.length - 1].timeHm})` : `giờ hẹn (${startTimeHm})`;
        showAlert(
          'Giờ về chưa hợp lệ',
          `Giờ về dự kiến (${endTimeHm}) phải diễn ra sau ${lastLabel}. Nếu chưa xác định giờ về, bạn có thể gạt tắt mục Giờ về dự kiến.`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'EVENT') {
        const isDatePlan = category === 'DATE_PLAN';
        const budgetNum = Number(estimatedBudget.replace(/[^0-9]/g, '')) || undefined;

        const summaryFallback = isDatePlan
          ? `${locationName ? `${locationName}` : ''}${address ? ` (${address})` : ''}${transportNote ? ` • ${transportNote}` : ''}`.trim()
          : customMsg.trim();

        const datePlanPayload = isDatePlan
          ? ({
              activityType,
              transport,
              transportNote: transportNote.trim(),
              startTimeHm,
              endTimeHm,
              enableEndTime,
              notifyStartTime,
              startRemindMinutesBefore,
              notifyEndTime: enableEndTime ? notifyEndTime : false,
              locationName: locationName.trim(),
              address: address.trim(),
              googleMapsUrl: googleMapsUrl.trim() || undefined,
              estimatedBudget: budgetNum,
              stops,
            } as any)
          : null;

        await onSaveEvent(
          {
            title: cleanTitle,
            eventDate: dateIso,
            category,
            notifyDaysBefore: isDatePlan ? (notifyStartTime ? 0 : -1) : notifyDaysBefore,
            notifyAtTime: startTimeHm,
            aiTone,
            autoDailyAi: isDatePlan ? false : autoDailyAi,
            customMessage:
              !isDatePlan && autoDailyAi
                ? ''
                : customMsg.trim() || summaryFallback,
            datePlan: datePlanPayload,
          },
          editingEvent?.id,
        );
      } else {
        const useMomo = isMomoGlobalEnabled && isMomoLinked;
        await onSaveGoal(
          {
            title: cleanTitle,
            targetDate: dateIso,
            isMomoLinked: useMomo,
            currentAmount: numericCurrent,
            targetAmount: numericTarget,
            unitLabel: useMomo ? 'đ' : unitLabel.trim() || '%',
            notifyTime: startTimeHm,
            customNotifyMessage:
              customMsg.trim() || `Cùng hoàn thành mục tiêu "${cleanTitle}".`,
            momoTransactions: editingGoal?.momoTransactions || [],
          },
          editingGoal?.id,
        );
      }
      onClose();
    } catch (e) {
      console.error('Lưu thất bại:', e);
      showAlert(
        'Không lưu được',
        e instanceof Error && e.message ? e.message : 'Đã có lỗi xảy ra, bạn thử lại nhé.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTransportObj = useMemo(
    () => TRANSPORT_OPTIONS.find((t) => t.id === transport) || TRANSPORT_OPTIONS[0],
    [transport],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheetCard, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetDragHandle} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
            {mode === 'EVENT'
              ? editingEvent
                ? category === 'DATE_PLAN'
                  ? 'Chi tiết lịch hẹn'
                  : 'Chi tiết sự kiện'
                : category === 'DATE_PLAN'
                  ? 'Lên lịch đi chơi'
                  : 'Thêm sự kiện mới'
              : editingGoal
                ? 'Cập nhật mục tiêu'
                : 'Thêm mục tiêu mới'}
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContentContainer}
          >
            {/* Segmented Tab chọn phân loại sự kiện */}
            {mode === 'EVENT' && (
              <View style={[styles.profileTabSwitch, { backgroundColor: colors.surfaceVariant }]}>
                {(
                  [
                    { id: 'DATE_PLAN', label: 'Lịch đi chơi' },
                    { id: 'ANNIVERSARY', label: 'Kỷ niệm' },
                    { id: 'BIRTHDAY', label: 'Sinh nhật' },
                  ] as const
                ).map((cat) => {
                  const active = category === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      style={[
                        styles.profileTabBtn,
                        active && { backgroundColor: colors.surface },
                      ]}
                      onPress={() => {
                        setCategory(cat.id);
                        if (cat.id === 'DATE_PLAN') {
                          setAutoDailyAi(false);
                          setNotifyDaysBefore(0);
                        }
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: active ? '700' : '500',
                          fontSize: 13,
                          color: active ? colors.textPrimary : colors.textSecondary,
                        }}
                        numberOfLines={1}
                      >
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {mode === 'EVENT' && category === 'DATE_PLAN'
                ? 'Tiêu đề buổi hẹn'
                : 'Tên gọi'}
            </Text>
            <TextInput
              style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
              placeholder={
                mode === 'EVENT'
                  ? category === 'DATE_PLAN'
                    ? 'VD: Ăn tối cuối tuần & dạo phố'
                    : 'VD: Kỷ niệm 1 năm, Sinh nhật...'
                  : 'VD: Quỹ du lịch Đà Lạt'
              }
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
            />

            {/* Chọn Ngày & Giờ Bắt đầu */}
            <View style={[styles.twoColFormRow, { marginBottom: 14 }]}>
              <View style={styles.colItem}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                  {mode === 'EVENT' && category === 'DATE_PLAN' ? 'Ngày hẹn' : 'Ngày diễn ra'}
                </Text>
                <Pressable
                  style={[styles.dateBtn, { borderColor: colors.outline }]}
                  onPress={() => setActivePicker('DATE')}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 14 }}>
                    {toIsoDate(selectedDate)}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.colItem}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                  {mode === 'EVENT' && category === 'DATE_PLAN' ? 'Giờ bắt đầu / Đón' : 'Giờ nhắc'}
                </Text>
                <Pressable
                  style={[
                    styles.dateBtn,
                    {
                      borderColor: colors.primary,
                      backgroundColor: colors.primaryContainer,
                    },
                  ]}
                  onPress={() => setActivePicker('START_TIME')}
                >
                  <Text
                    style={{
                      color: colors.onPrimaryContainer,
                      fontWeight: '800',
                      fontSize: 15,
                      textAlign: 'center',
                    }}
                  >
                    {toHmString(selectedTime)}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* ===================================================== */}
            {/* GIAO DIỆN LẬP KẾ HOẠCH ĐI CHƠI (DATE_PLAN) */}
            {/* ===================================================== */}
            {mode === 'EVENT' && category === 'DATE_PLAN' && (
              <View>
                {/* KHỐI 1: THỜI GIAN VỀ & LỜI NHẮC THÔNG BÁO */}
                <View
                  style={[
                    styles.cleanSectionCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <Text style={[styles.cleanSectionTitle, { color: colors.textPrimary }]}>
                    Thời gian & Lời nhắc
                  </Text>

                  {/* Bật / tắt Giờ về dự kiến */}
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                        Đặt giờ về dự kiến
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                        {enableEndTime
                          ? 'Hiển thị mốc kết thúc trên sơ đồ lịch trình'
                          : 'Đang tắt, đi chơi thoải mái không giới hạn giờ về'}
                      </Text>
                    </View>
                    <Switch
                      value={enableEndTime}
                      onValueChange={handleToggleEnableEndTime}
                      trackColor={{ false: colors.outline, true: colors.primary }}
                    />
                  </View>

                  {enableEndTime && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: colors.surfaceVariant,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        marginTop: 4,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
                        Giờ về dự kiến
                      </Text>
                      <Pressable
                        style={[
                          styles.timeBadgeButton,
                          { backgroundColor: colors.surface, borderColor: colors.outline },
                        ]}
                        onPress={() => setActivePicker('END_TIME')}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>
                          {toHmString(endTimeDate)}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  <View
                    style={[
                      styles.hairlineDivider,
                      { backgroundColor: colors.borderSubtle },
                    ]}
                  />

                  {/* Bật / tắt thông báo nhắc Giờ hẹn */}
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                        Thông báo nhắc giờ hẹn ({toHmString(selectedTime)})
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                        Gửi thông báo lên điện thoại để chuẩn bị trước giờ đón
                      </Text>
                    </View>
                    <Switch
                      value={notifyStartTime}
                      onValueChange={(val) => {
                        setNotifyStartTime(val);
                        void Haptics.selectionAsync().catch(() => {});
                      }}
                      trackColor={{ false: colors.outline, true: colors.primary }}
                    />
                  </View>

                  {notifyStartTime && (
                    <View style={[styles.chipWrap, { marginTop: 6, marginBottom: 6 }]}>
                      {START_REMINDER_MINS.map((opt) => {
                        const selected = startRemindMinutesBefore === opt.value;
                        return (
                          <Pressable
                            key={opt.value}
                            style={[
                              styles.compactChoicePill,
                              {
                                borderColor: selected ? colors.primary : colors.outline,
                                backgroundColor: selected
                                  ? colors.primaryContainer
                                  : colors.surfaceVariant,
                              },
                            ]}
                            onPress={() => setStartRemindMinutesBefore(opt.value)}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: selected ? '700' : '500',
                                color: selected
                                  ? colors.onPrimaryContainer
                                  : colors.textSecondary,
                              }}
                            >
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {/* Bật / tắt thông báo nhắc Giờ về (chỉ hiện khi bật Giờ về dự kiến) */}
                  {enableEndTime && (
                    <>
                      <View
                        style={[
                          styles.hairlineDivider,
                          { backgroundColor: colors.borderSubtle },
                        ]}
                      />
                      <View style={styles.switchRow}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                            Thông báo nhắc giờ về ({toHmString(endTimeDate)})
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                            Nhắc nhẹ khi đến giờ về dự kiến để hai đứa chủ động thời gian
                          </Text>
                        </View>
                        <Switch
                          value={notifyEndTime}
                          onValueChange={(val) => {
                            setNotifyEndTime(val);
                            void Haptics.selectionAsync().catch(() => {});
                          }}
                          trackColor={{ false: colors.outline, true: colors.primary }}
                        />
                      </View>
                    </>
                  )}
                </View>

                {/* KHỐI 2: SƠ ĐỒ CHẶNG TIẾN TRÌNH DỌC (MODERN VERTICAL STEPPER) */}
                <View
                  style={[
                    styles.cleanSectionCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.sectionHeaderRow,
                      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                      <Text style={[styles.cleanSectionTitle, { color: colors.textPrimary, marginBottom: 2 }]}>
                        Tiến trình buổi hẹn
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {stops.length > 0
                          ? `${stops.length} điểm dừng trong lịch trình`
                          : 'Chưa có chặng phụ, chạm nút bên phải để thêm'}
                      </Text>
                    </View>

                    <Pressable
                      style={[
                        styles.addStopToggleBtn,
                        {
                          flexShrink: 0,
                          alignSelf: 'center',
                          backgroundColor: showAddStopCreator
                            ? colors.surfaceVariant
                            : colors.primaryContainer,
                        },
                      ]}
                      onPress={() => setShowAddStopCreator((prev) => !prev)}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: showAddStopCreator
                            ? colors.textSecondary
                            : colors.onPrimaryContainer,
                        }}
                      >
                        {showAddStopCreator ? 'Đóng' : '+ Thêm chặng'}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Sơ đồ trục dọc (Vertical Stepper) */}
                  <View style={styles.verticalStepperContainer}>
                    {/* NODE ĐẦU: GIỜ BẮT ĐẦU / ĐÓN */}
                    <View style={styles.stepperRow}>
                      <View style={styles.stepperTimeCol}>
                        <Pressable
                          style={[
                            styles.stepperTimeBadge,
                            { backgroundColor: colors.primaryContainer },
                          ]}
                          onPress={() => setActivePicker('START_TIME')}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '800',
                              color: colors.onPrimaryContainer,
                            }}
                          >
                            {toHmString(selectedTime)}
                          </Text>
                        </Pressable>
                        {notifyStartTime && (
                          <Text style={[styles.stepperSubHint, { color: colors.primary }]}>
                            Có nhắc hẹn
                          </Text>
                        )}
                      </View>

                      <View style={styles.stepperTrackCol}>
                        <View
                          style={[
                            styles.stepperDotOuter,
                            { borderColor: colors.primary, backgroundColor: colors.surface },
                          ]}
                        >
                          <View
                            style={[
                              styles.stepperDotInner,
                              { backgroundColor: colors.primary },
                            ]}
                          />
                        </View>
                        {(stops.length > 0 || enableEndTime) && (
                          <View
                            style={[
                              styles.stepperConnectorLine,
                              { backgroundColor: colors.borderSubtle },
                            ]}
                          />
                        )}
                      </View>

                      <View
                        style={[
                          styles.stepperCardCol,
                          {
                            backgroundColor: colors.surfaceVariant,
                            borderColor: colors.borderSubtle,
                          },
                        ]}
                      >
                        <View style={styles.stepperCardHeader}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                            Bắt đầu • {selectedTransportObj.label}
                          </Text>
                        </View>
                        <Text
                          style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}
                          numberOfLines={2}
                        >
                          {transportNote.trim()
                            ? transportNote
                            : locationName.trim()
                              ? `Hẹn gặp tại ${locationName}`
                              : 'Xuất phát theo giờ hẹn'}
                        </Text>
                      </View>
                    </View>

                    {/* CÁC NODE CHẶNG GIỮA */}
                    {stops.map((st, idx) => {
                      const isLastNode = idx === stops.length - 1 && !enableEndTime;
                      const meta = STOP_ACTIVITY_LABELS[st.activityType] || STOP_ACTIVITY_LABELS.OTHER;

                      return (
                        <View key={st.id} style={styles.stepperRow}>
                          <View style={styles.stepperTimeCol}>
                            <View
                              style={[
                                styles.stepperTimeBadge,
                                { backgroundColor: colors.surfaceVariant },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: '700',
                                  color: colors.textPrimary,
                                }}
                              >
                                {st.timeHm}
                              </Text>
                            </View>
                            <Text style={[styles.stepperSubHint, { color: colors.textSecondary }]}>
                              Chặng {idx + 1}
                            </Text>
                          </View>

                          <View style={styles.stepperTrackCol}>
                            <View
                              style={[
                                styles.stepperMidNodeDot,
                                {
                                  backgroundColor: colors.primary,
                                  borderColor: colors.surface,
                                },
                              ]}
                            />
                            {!isLastNode && (
                              <View
                                style={[
                                  styles.stepperConnectorLine,
                                  { backgroundColor: colors.borderSubtle },
                                ]}
                              />
                            )}
                          </View>

                          <View
                            style={[
                              styles.stepperCardCol,
                              {
                                backgroundColor: colors.surface,
                                borderColor: colors.outline,
                              },
                            ]}
                          >
                            <View style={styles.stepperCardHeader}>
                              <View
                                style={[
                                  styles.stopTypePill,
                                  { backgroundColor: colors.primaryContainer },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: '700',
                                    color: colors.onPrimaryContainer,
                                  }}
                                >
                                  {meta.badge}
                                </Text>
                              </View>
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: '700',
                                  color: colors.textPrimary,
                                  flex: 1,
                                }}
                                numberOfLines={1}
                              >
                                {st.title}
                              </Text>
                              <Pressable
                                onPress={() => handleRemoveStop(st.id)}
                                hitSlop={10}
                                style={styles.removeStopIconBtn}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.error }}>
                                  Xóa
                                </Text>
                              </Pressable>
                            </View>

                            {Boolean(st.address) && (
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  marginTop: 6,
                                  gap: 8,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: colors.textSecondary,
                                    flex: 1,
                                  }}
                                  numberOfLines={1}
                                >
                                  {st.address}
                                </Text>
                                <Pressable
                                  onPress={() => void openAddressInGoogleMaps(st.address)}
                                  hitSlop={6}
                                >
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontWeight: '700',
                                      color: colors.primary,
                                    }}
                                  >
                                    Chỉ đường ▸
                                  </Text>
                                </Pressable>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}

                    {/* NODE CUỐI: GIỜ VỀ DỰ KIẾN (CHỈ HIỂN THỊ KHI BẬT) */}
                    {enableEndTime && (
                      <View style={[styles.stepperRow, { marginBottom: 0 }]}>
                        <View style={styles.stepperTimeCol}>
                          <Pressable
                            style={[
                              styles.stepperTimeBadge,
                              { backgroundColor: colors.surfaceVariant },
                            ]}
                            onPress={() => setActivePicker('END_TIME')}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: '800',
                                color: colors.textPrimary,
                              }}
                            >
                              {toHmString(endTimeDate)}
                            </Text>
                          </Pressable>
                          {notifyEndTime && (
                            <Text style={[styles.stepperSubHint, { color: colors.primary }]}>
                              Có nhắc về
                            </Text>
                          )}
                        </View>

                        <View style={styles.stepperTrackCol}>
                          <View
                            style={[
                              styles.stepperDotOuter,
                              { borderColor: colors.textSecondary, backgroundColor: colors.surface },
                            ]}
                          >
                            <View
                              style={[
                                styles.stepperDotInner,
                                { backgroundColor: colors.textSecondary },
                              ]}
                            />
                          </View>
                        </View>

                        <View
                          style={[
                            styles.stepperCardCol,
                            {
                              backgroundColor: colors.surfaceVariant,
                              borderColor: colors.borderSubtle,
                              marginBottom: 0,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.stepperCardHeader,
                              { flexDirection: 'row', alignItems: 'center', gap: 8 },
                            ]}
                          >
                            <Text
                              style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, flex: 1 }}
                              numberOfLines={1}
                            >
                              Kết thúc & Đưa nhau về
                            </Text>
                            <Pressable
                              onPress={() => handleToggleEnableEndTime(false)}
                              hitSlop={8}
                              style={{ flexShrink: 0 }}
                            >
                              <Text
                                numberOfLines={1}
                                style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary }}
                              >
                                Ẩn giờ về
                              </Text>
                            </Pressable>
                          </View>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                            {notifyEndTime
                              ? `Sẽ báo nhắc lúc ${toHmString(endTimeDate)}`
                              : 'Chạm vào giờ bên trái nếu muốn đổi giờ về'}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* FORM THÊM CHẶNG MỚI (MỞ KHI BẤM + THÊM CHẶNG) */}
                  {showAddStopCreator && (
                    <View
                      style={[
                        styles.stopCreatorPanel,
                        {
                          backgroundColor: colors.surfaceVariant,
                          borderColor: colors.outline,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 }}>
                        Thêm điểm dừng mới vào tiến trình
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                        {(
                          [
                            { id: 'EAT', label: 'Ăn uống' },
                            { id: 'DRINK', label: 'Cafe / Nước' },
                            { id: 'MOVIE', label: 'Xem phim' },
                            { id: 'WALK', label: 'Dạo chơi' },
                          ] as const
                        ).map((st) => {
                          const selected = stopActivity === st.id;
                          return (
                            <Pressable
                              key={st.id}
                              style={[
                                styles.compactChoicePill,
                                {
                                  flex: 1,
                                  paddingHorizontal: 4,
                                  borderColor: selected ? colors.primary : colors.outline,
                                  backgroundColor: selected ? colors.primary : colors.surface,
                                },
                              ]}
                              onPress={() => setStopActivity(st.id)}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '700',
                                  color: selected ? '#FFFFFF' : colors.textPrimary,
                                }}
                                numberOfLines={1}
                              >
                                {st.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <View style={styles.twoColFormRow}>
                        <View style={{ width: 96 }}>
                          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                            Giờ chặng
                          </Text>
                          <Pressable
                            style={[
                              styles.dateBtn,
                              {
                                borderColor: colors.outline,
                                backgroundColor: colors.surface,
                                marginBottom: 10,
                              },
                            ]}
                            onPress={() => setActivePicker('STOP_TIME')}
                          >
                            <Text
                              style={{
                                color: colors.primary,
                                fontWeight: '800',
                                fontSize: 14,
                                textAlign: 'center',
                              }}
                            >
                              {toHmString(stopTimeDate)}
                            </Text>
                          </Pressable>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                            Tên quán / Hoạt động
                          </Text>
                          <TextInput
                            style={[
                              styles.inputBox,
                              {
                                marginBottom: 10,
                                borderColor: colors.outline,
                                color: colors.textPrimary,
                                backgroundColor: colors.surface,
                              },
                            ]}
                            placeholder="VD: Lẩu Dookki / Phê La"
                            placeholderTextColor={colors.textSecondary}
                            value={stopTitle}
                            onChangeText={setStopTitle}
                          />
                        </View>
                      </View>

                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                        Địa chỉ (Tùy chọn)
                      </Text>
                      <TextInput
                        style={[
                          styles.inputBox,
                          {
                            marginBottom: 12,
                            borderColor: colors.outline,
                            color: colors.textPrimary,
                            backgroundColor: colors.surface,
                          },
                        ]}
                        placeholder="Nhập địa chỉ để mở nhanh trên Google Maps"
                        placeholderTextColor={colors.textSecondary}
                        value={stopAddress}
                        onChangeText={setStopAddress}
                      />

                      <View style={styles.twoColRow}>
                        <Pressable
                          style={[
                            styles.secondaryBtn,
                            { backgroundColor: colors.surface, height: 42 },
                          ]}
                          onPress={() => setShowAddStopCreator(false)}
                        >
                          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                            Hủy
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.primaryBtn,
                            { backgroundColor: colors.primary, height: 42 },
                          ]}
                          onPress={handleAddStop}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                            Lưu chặng này
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>

                {/* KHỐI 3: PHƯƠNG TIỆN & ĐỊA ĐIỂM HẸN CHÍNH */}
                <View
                  style={[
                    styles.cleanSectionCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <Text style={[styles.cleanSectionTitle, { color: colors.textPrimary }]}>
                    Phương tiện & Điểm hẹn chính
                  </Text>

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Hoạt động chính
                  </Text>
                  <View style={styles.chipWrap}>
                    {DATE_ACTIVITY_OPTIONS.map((act) => {
                      const active = activityType === act.id;
                      return (
                        <Pressable
                          key={act.id}
                          style={[
                            styles.compactChoicePill,
                            { borderColor: active ? colors.primary : colors.outline },
                            active && {
                              backgroundColor: colors.primaryContainer,
                            },
                          ]}
                          onPress={() => setActivityType(act.id)}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: active ? '700' : '500',
                              color: active ? colors.onPrimaryContainer : colors.textSecondary,
                            }}
                          >
                            {act.icon} {act.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Cách di chuyển
                  </Text>
                  <View style={styles.chipWrap}>
                    {TRANSPORT_OPTIONS.map((tr) => {
                      const active = transport === tr.id;
                      return (
                        <Pressable
                          key={tr.id}
                          style={[
                            styles.compactChoicePill,
                            { borderColor: active ? colors.textPrimary : colors.outline },
                            active && {
                              backgroundColor: colors.textPrimary,
                            },
                          ]}
                          onPress={() => setTransport(tr.id)}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '600',
                              color: active ? colors.surface : colors.textSecondary,
                            }}
                          >
                            {tr.icon} {tr.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Ghi chú đưa đón
                  </Text>
                  <TextInput
                    style={[
                      styles.inputBox,
                      { borderColor: colors.outline, color: colors.textPrimary },
                    ]}
                    placeholder="VD: Qua đón dưới sảnh lúc 18:30 nhé"
                    placeholderTextColor={colors.textSecondary}
                    value={transportNote}
                    onChangeText={setTransportNote}
                  />

                  <View style={styles.sectionHeaderWrap}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
                      Quán / Địa điểm chính
                    </Text>
                    {(Boolean(address.trim()) || Boolean(locationName.trim()) || Boolean(googleMapsUrl.trim())) && (
                      <Pressable
                        onPress={() =>
                          void openAddressInGoogleMaps(
                            address || locationName,
                            googleMapsUrl,
                          )
                        }
                        hitSlop={6}
                      >
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                          Xem trên Google Maps ▸
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <TextInput
                    style={[
                      styles.inputBox,
                      {
                        borderColor: colors.outline,
                        color: colors.textPrimary,
                        marginTop: 6,
                      },
                    ]}
                    placeholder="Tên quán hoặc địa điểm hẹn"
                    placeholderTextColor={colors.textSecondary}
                    value={locationName}
                    onChangeText={setLocationName}
                  />

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Địa chỉ cụ thể
                  </Text>
                  <TextInput
                    style={[
                      styles.inputBox,
                      { borderColor: colors.outline, color: colors.textPrimary },
                    ]}
                    placeholder="Số nhà, tên đường, quận..."
                    placeholderTextColor={colors.textSecondary}
                    value={address}
                    onChangeText={setAddress}
                  />

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Link Google Maps (Tùy chọn)
                  </Text>
                  <TextInput
                    style={[
                      styles.inputBox,
                      {
                        borderColor: colors.outline,
                        color: colors.textPrimary,
                        marginBottom: 0,
                      },
                    ]}
                    autoCapitalize="none"
                    placeholder="https://maps.app.goo.gl/..."
                    placeholderTextColor={colors.textSecondary}
                    value={googleMapsUrl}
                    onChangeText={setGoogleMapsUrl}
                  />
                </View>

                {/* KHỐI 4: CHI PHÍ & DẶN DÒ THÊM */}
                <View style={styles.twoColFormRow}>
                  <View style={styles.colItem}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      Dự trù chi phí (VNĐ)
                    </Text>
                    <TextInput
                      style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder="VD: 500000"
                      placeholderTextColor={colors.textSecondary}
                      value={estimatedBudget}
                      onChangeText={(t) => setEstimatedBudget(t.replace(/[^0-9]/g, ''))}
                    />
                  </View>
                </View>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Lời nhắn / Trang phục gợi ý
                </Text>
                <TextInput
                  style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary, marginBottom: 4 }]}
                  placeholder="VD: Mặc đồ tone trắng chụp ảnh cho hợp nhé"
                  placeholderTextColor={colors.textSecondary}
                  value={customMsg}
                  onChangeText={setCustomMsg}
                />
              </View>
            )}

            {/* PHẦN CHO KỶ NIỆM & SINH NHẬT */}
            {mode === 'EVENT' && category !== 'DATE_PLAN' && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 4 }]}>
                  Nhắc trước
                </Text>
                <View style={styles.chipWrap}>
                  {ADVANCE_DAYS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.optionPill,
                        { borderColor: colors.outline },
                        notifyDaysBefore === opt.value && {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => setNotifyDaysBefore(opt.value)}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: notifyDaysBefore === opt.value ? '#FFF' : colors.textSecondary,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={[styles.aiGeneratorBox, { backgroundColor: colors.surfaceVariant }]}>
                  <View style={styles.switchRow}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1, paddingRight: 8 }}>
                      Tự động soạn lời nhắc theo ngày
                    </Text>
                    <Switch value={autoDailyAi} onValueChange={setAutoDailyAi} />
                  </View>

                  {autoDailyAi ? (
                    <View style={[styles.chipWrap, { marginTop: 8, marginBottom: 0 }]}>
                      {AI_TONE_CHIPS.map((item) => (
                        <Pressable
                          key={item.tone}
                          style={[
                            styles.aiTonePill,
                            {
                              backgroundColor:
                                aiTone === item.tone ? colors.textPrimary : colors.surface,
                            },
                          ]}
                          onPress={() => setAiTone(item.tone)}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '600',
                              color: aiTone === item.tone ? colors.surface : colors.textSecondary,
                            }}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <TextInput
                      style={[
                        styles.inputBox,
                        styles.multilineInput,
                        {
                          borderColor: colors.outline,
                          color: colors.textPrimary,
                          backgroundColor: colors.surface,
                          marginTop: 8,
                          marginBottom: 0,
                        },
                      ]}
                      multiline
                      placeholder="Nhập lời nhắc của bạn..."
                      placeholderTextColor={colors.textSecondary}
                      value={customMsg}
                      onChangeText={setCustomMsg}
                    />
                  )}
                </View>
              </>
            )}

            {/* PHẦN CHO MỤC TIÊU (GOAL) */}
            {mode === 'GOAL' && (
              <>
                {isMomoGlobalEnabled && (
                  <View style={[styles.aiGeneratorBox, { backgroundColor: colors.surfaceVariant, marginTop: 4 }]}>
                    <View style={styles.switchRow}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#A50064', flex: 1, paddingRight: 8 }}>
                        Liên kết Quỹ tiết kiệm MoMo (Tính % theo số tiền)
                      </Text>
                      <Switch
                        value={isMomoLinked}
                        onValueChange={(val) => {
                          setIsMomoLinked(val);
                          if (val) setUnitLabel('đ');
                        }}
                      />
                    </View>

                    <View style={{ marginTop: 10 }}>
                      <View style={[styles.sectionHeaderWrap, { marginBottom: 6 }]}>
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                          Tiến độ đạt được:
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#A50064' }}>
                          {livePercentage.toFixed(1)}% ({numericCurrent.toLocaleString('vi-VN')}{' '}
                          {isMomoLinked ? 'đ' : unitLabel} / {numericTarget.toLocaleString('vi-VN')}{' '}
                          {isMomoLinked ? 'đ' : unitLabel})
                        </Text>
                      </View>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' }}>
                        <View
                          style={{
                            height: '100%',
                            width: `${livePercentage}%`,
                            backgroundColor: '#A50064',
                          }}
                        />
                      </View>
                      {isMomoLinked && (
                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }}>
                          Còn cần tích lũy thêm: {remainingMoney.toLocaleString('vi-VN')}đ
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                <View style={styles.twoColFormRow}>
                  <View style={styles.colItem}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                      {isMomoGlobalEnabled && isMomoLinked ? 'Đã có (VNĐ)' : 'Hiện tại'}
                    </Text>
                    <TextInput
                      style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder="0"
                      value={currentAmount}
                      onChangeText={(txt) => setCurrentAmount(txt.replace(/[^0-9]/g, ''))}
                    />
                  </View>
                  <View style={styles.colItem}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                      {isMomoGlobalEnabled && isMomoLinked ? 'Mục tiêu (VNĐ)' : 'Mục tiêu'}
                    </Text>
                    <TextInput
                      style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder="5000000"
                      value={targetAmount}
                      onChangeText={(txt) => setTargetAmount(txt.replace(/[^0-9]/g, ''))}
                    />
                  </View>
                </View>

                {(!isMomoGlobalEnabled || !isMomoLinked) && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Đơn vị</Text>
                    <TextInput
                      style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                      placeholder="buổi, cuốn, %..."
                      value={unitLabel}
                      onChangeText={setUnitLabel}
                    />
                  </>
                )}

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Ghi chú mục tiêu
                </Text>
                <TextInput
                  style={[styles.inputBox, { borderColor: colors.outline, color: colors.textPrimary }]}
                  placeholder="Ghi chú thêm cho mục tiêu này"
                  placeholderTextColor={colors.textSecondary}
                  value={customMsg}
                  onChangeText={setCustomMsg}
                />
              </>
            )}
          </ScrollView>

          {/* QUẢN LÝ TẤT CẢ DATE/TIME PICKERS NATIVE */}
          <DateTimeField
            visible={activePicker !== null}
            mode={activePicker === 'DATE' ? 'date' : 'time'}
            colors={colors}
            title={
              activePicker === 'DATE'
                ? 'Chọn ngày'
                : activePicker === 'END_TIME'
                  ? 'Chọn giờ về dự kiến'
                  : activePicker === 'STOP_TIME'
                    ? 'Chọn giờ của chặng'
                    : 'Chọn giờ bắt đầu'
            }
            value={
              activePicker === 'DATE'
                ? selectedDate
                : activePicker === 'END_TIME'
                  ? endTimeDate
                  : activePicker === 'STOP_TIME'
                    ? stopTimeDate
                    : selectedTime
            }
            onClose={() => setActivePicker(null)}
            onChange={(d) => {
              if (activePicker === 'DATE') setSelectedDate(d);
              else if (activePicker === 'START_TIME') setSelectedTime(d);
              else if (activePicker === 'END_TIME') setEndTimeDate(d);
              else if (activePicker === 'STOP_TIME') setStopTimeDate(d);
            }}
          />

          <View style={[styles.actionFooter, { borderTopColor: colors.borderSubtle }]}>
            <Pressable
              style={[styles.secondaryBtn, { backgroundColor: colors.surfaceVariant }]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14 }}>Hủy</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                  {mode === 'EVENT' && category === 'DATE_PLAN' ? 'Lưu lịch hẹn' : 'Lưu'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};