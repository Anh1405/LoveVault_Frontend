// src/components/home/DailyQASection.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Animated,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { ThemeColors, METRICS } from '../../constants/theme';
import {
  QUESTION_CATEGORIES_META,
  QuestionCategory,
} from '../../constants/questionBank';
import { DailyQAState } from '../../hooks/useRealtimeDailyQA';

interface DailyQASectionProps {
  colors: ThemeColors;
  myNickname: string;
  partnerNickname: string;
  activeQA: DailyQAState;
  qaFilter: QuestionCategory;
  qaHistory: DailyQAState[];
  socketConnected: boolean;
  partnerTypingName: string | null;
  totalQuestionsCount: number;
  completedBothCount: number;
  onTyping: (isTyping: boolean) => void;
  onSubmitAnswer: (text: string) => Promise<void>;
  onRollQuestion: (category?: QuestionCategory) => Promise<void>;
  onSelectHistoryItem: (item: DailyQAState) => void;
}

export const DailyQASection: React.FC<DailyQASectionProps> = ({
  colors,
  myNickname,
  partnerNickname,
  activeQA,
  qaFilter,
  qaHistory,
  socketConnected,
  partnerTypingName,
  totalQuestionsCount,
  completedBothCount,
  onTyping,
  onSubmitAnswer,
  onRollQuestion,
  onSelectHistoryItem,
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const isSmallScreen = screenWidth < 360;
  const isWideLayout = screenWidth >= 560;

  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'UNLOCKED' | 'WAITING'>('ALL');

  const revealAnim = useRef(new Animated.Value(0)).current;

  const hasMyAnswer = Boolean(activeQA.myAnswer?.trim());
  const bothAnswered = activeQA.bothAnswered;

  useEffect(() => {
    if (bothAnswered) {
      revealAnim.setValue(0.85);
      Animated.spring(revealAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [bothAnswered, activeQA.questionId, revealAnim]);

  const currentCatMeta =
    QUESTION_CATEGORIES_META.find((c) => c.id === activeQA.category) ||
    QUESTION_CATEGORIES_META[0];

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmitAnswer(trimmed);
      setInput('');
    } catch {
      setErrorMsg('Kết nối gián đoạn, vui lòng bấm gửi lại nhé.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHistory = React.useMemo(() => {
    if (historyFilter === 'UNLOCKED') {
      return qaHistory.filter((h) => h.bothAnswered);
    }
    if (historyFilter === 'WAITING') {
      return qaHistory.filter((h) => !h.bothAnswered);
    }
    return qaHistory;
  }, [qaHistory, historyFilter]);

  const progressPercent = Math.min(
    100,
    Math.round((completedBothCount / Math.max(1, totalQuestionsCount)) * 100),
  );

  return (
    <View style={styles.container}>
      {/* THANH TRẠNG THÁI REALTIME & TIẾN ĐỘ BỘ CÂU HỎI */}
      <View
        style={[
          styles.statsBanner,
          { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
        ]}
      >
        <View style={styles.statsTopRow}>
          <View style={styles.liveBadgeRow}>
            <View
              style={[
                styles.liveDot,
                { backgroundColor: socketConnected ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>
              {socketConnected ? 'Đồng bộ tức thì (Live)' : 'Chế độ chờ mạng'}
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
            Đã mở khóa {completedBothCount}/{totalQuestionsCount} câu ({progressPercent}%)
          </Text>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceVariant }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPercent}%`, backgroundColor: colors.primary },
            ]}
          />
        </View>
      </View>

      {/* BỘ LỌC 6 CHỦ ĐỀ CÂU HỎI */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {QUESTION_CATEGORIES_META.map((cat) => {
          const selected = qaFilter === cat.id;
          return (
            <Pressable
              key={cat.id}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: selected ? cat.accentColor : colors.surface,
                  borderColor: selected ? cat.accentColor : colors.borderSubtle,
                },
              ]}
              onPress={() => void onRollQuestion(cat.id)}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: selected ? '#FFFFFF' : colors.textPrimary,
                }}
              >
                {cat.icon} {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* THẺ CÂU HỎI CHÍNH */}
      <View
        style={[
          styles.mainQuestionCard,
          isSmallScreen && { padding: 14 },
          { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
        ]}
      >
        <View style={styles.cardHeaderRow}>
          <View
            style={[
              styles.topicTag,
              { backgroundColor: `${currentCatMeta.accentColor}18` },
            ]}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                color: currentCatMeta.accentColor,
              }}
            >
              {currentCatMeta.icon} {currentCatMeta.label.toUpperCase()}
            </Text>
          </View>

          <Pressable
            style={[styles.rollBtn, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => void onRollQuestion()}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>
              🎲 Đổi câu hỏi khác
            </Text>
          </Pressable>
        </View>

        <Text
          style={[
            styles.questionTitle,
            isSmallScreen && { fontSize: 15, lineHeight: 22 },
            { color: colors.textPrimary },
          ]}
        >
          {activeQA.questionText}
        </Text>

        {Boolean(activeQA.hint) && !bothAnswered && (
          <Text style={[styles.questionHint, { color: colors.textSecondary }]}>
            💡 Gợi ý: {activeQA.hint}
          </Text>
        )}

        {/* BÁO HIỆU ĐỐI PHƯƠNG ĐANG GÕ REALTIME QUA WEBSOCKET */}
        {partnerTypingName && !bothAnswered && (
          <View
            style={[
              styles.typingIndicatorBox,
              { backgroundColor: colors.primaryContainer },
            ]}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: colors.onPrimaryContainer,
              }}
            >
              💬 {partnerTypingName} đang nhập câu trả lời...
            </Text>
          </View>
        )}

        {/* TRẠNG THÁI 1: CẢ HAI ĐÃ TRẢ LỜI -> MỞ KHÓA TỨC THÌ */}
        {bothAnswered ? (
          <Animated.View
            style={[
              styles.unlockedContainer,
              { transform: [{ scale: revealAnim }] },
            ]}
          >
            <View style={[styles.unlockedBanner, { backgroundColor: '#DCFCE7' }]}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: '#15803D',
                  textAlign: 'center',
                }}
              >
                🔓 Đã mở khóa! Cả hai bạn đã hoàn thành câu hỏi này
              </Text>
            </View>

            <View style={[styles.answersPairWrap, isWideLayout && styles.answersPairRow]}>
              <View
                style={[
                  styles.answerBubble,
                  isWideLayout && { flex: 1 },
                  { backgroundColor: colors.surfaceVariant },
                ]}
              >
                <View style={styles.bubbleHeader}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
                    {myNickname} (Bạn)
                  </Text>
                  {activeQA.answeredAt && (
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                      {activeQA.answeredAt.split('T')[0]}
                    </Text>
                  )}
                </View>
                <Text style={[styles.answerBody, { color: colors.textPrimary }]}>
                  {activeQA.myAnswer}
                </Text>
              </View>

              <View
                style={[
                  styles.answerBubble,
                  isWideLayout && { flex: 1 },
                  {
                    backgroundColor: `${currentCatMeta.accentColor}14`,
                    borderColor: `${currentCatMeta.accentColor}40`,
                    borderWidth: 1,
                  },
                ]}
              >
                <View style={styles.bubbleHeader}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: currentCatMeta.accentColor,
                    }}
                  >
                    💕 {partnerNickname}
                  </Text>
                </View>
                <Text style={[styles.answerBody, { color: colors.textPrimary }]}>
                  {activeQA.partnerAnswer}
                </Text>
              </View>
            </View>
          </Animated.View>
        ) : hasMyAnswer ? (
          /* TRẠNG THÁI 2: MÌNH ĐÃ TRẢ LỜI, ĐANG CHỜ ĐỐI PHƯƠNG */
          <View style={styles.waitingContainer}>
            <View style={[styles.answerBubble, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                Câu trả lời của bạn:
              </Text>
              <Text style={[styles.answerBody, { color: colors.textPrimary, marginTop: 4 }]}>
                {activeQA.myAnswer}
              </Text>
            </View>

            <View
              style={[
                styles.lockedPartnerCard,
                { borderColor: colors.borderSubtle, backgroundColor: colors.background },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.textPrimary,
                  textAlign: 'center',
                }}
              >
                🔒 Đang chờ {partnerNickname} trả lời...
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.textSecondary,
                  marginTop: 4,
                  textAlign: 'center',
                  lineHeight: 18,
                }}
              >
                Ngay giây phút {partnerNickname} bấm gửi, đáp án của cả hai sẽ tự động hiện ra trên màn hình của bạn!
              </Text>
            </View>
          </View>
        ) : (
          /* TRẠNG THÁI 3: MÌNH CHƯA TRẢ LỜI */
          <View style={{ marginTop: 14 }}>
            {activeQA.hasPartnerAnswered && (
              <View
                style={[
                  styles.partnerReadyAlert,
                  { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309', lineHeight: 18 }}>
                  🔒 {partnerNickname} đã gửi câu trả lời rồi! Hãy nhập câu trả lời của bạn để mở khóa ngay lập tức.
                </Text>
              </View>
            )}

            <TextInput
              style={[
                styles.textAreaInput,
                {
                  borderColor: colors.outline,
                  color: colors.textPrimary,
                  backgroundColor: colors.background,
                },
              ]}
              placeholder={`Viết suy nghĩ của bạn để gửi cho ${partnerNickname}...`}
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={600}
              value={input}
              onChangeText={(txt) => {
                setInput(txt);
                onTyping(txt.trim().length > 0);
              }}
              editable={!submitting}
            />

            {errorMsg && (
              <Text style={{ fontSize: 12, color: colors.error, marginTop: 6 }}>
                {errorMsg}
              </Text>
            )}

            <Pressable
              style={[
                styles.submitBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: submitting || !input.trim() ? 0.5 : 1,
                },
              ]}
              disabled={submitting || !input.trim()}
              onPress={() => void handleSend()}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {activeQA.hasPartnerAnswered
                    ? '🔓 Gửi & Mở khóa đáp án ngay'
                    : 'Gửi câu trả lời'}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </View>

      {/* DANH SÁCH LỊCH SỬ HỎI ĐÁP */}
      {qaHistory.length > 0 && (
        <View style={styles.historySection}>
          <View style={styles.historyHeaderRow}>
            <Text style={[styles.historyTitle, { color: colors.textPrimary }]}>
              Nhật ký Hỏi Đáp ({qaHistory.length})
            </Text>

            <View style={styles.historyFilterRow}>
              {(
                [
                  { id: 'ALL', label: 'Tất cả' },
                  { id: 'UNLOCKED', label: '🔓 Đã mở' },
                  { id: 'WAITING', label: '⏳ Chờ' },
                ] as const
              ).map((tab) => {
                const active = historyFilter === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    style={[
                      styles.miniFilterChip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceVariant,
                      },
                    ]}
                    onPress={() => setHistoryFilter(tab.id)}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: active ? '#FFFFFF' : colors.textSecondary,
                      }}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {filteredHistory.map((hist) => {
            const catMeta =
              QUESTION_CATEGORIES_META.find((c) => c.id === hist.category) ||
              QUESTION_CATEGORIES_META[0];

            return (
              <Pressable
                key={hist.questionId}
                style={[
                  styles.historyCard,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
                onPress={() => onSelectHistoryItem(hist)}
              >
                <View style={styles.cardHeaderRow}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: catMeta.accentColor,
                    }}
                  >
                    {catMeta.icon} {catMeta.label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: hist.bothAnswered ? '#16A34A' : '#D97706',
                    }}
                  >
                    {hist.bothAnswered ? '🔓 Đã mở khóa' : '🔒 Đang chờ đủ 2 người'}
                  </Text>
                </View>

                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: colors.textPrimary,
                    marginTop: 4,
                  }}
                >
                  {hist.questionText}
                </Text>

                {hist.bothAnswered ? (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    <Text style={{ fontSize: 13, color: colors.textPrimary }}>
                      <Text style={{ fontWeight: '700' }}>{myNickname}: </Text>
                      {hist.myAnswer}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                      <Text style={{ fontWeight: '700', color: catMeta.accentColor }}>
                        {partnerNickname}:{' '}
                      </Text>
                      {hist.partnerAnswer}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6 }}>
                    Chạm vào để xem hoặc trả lời mở khóa câu hỏi này.
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 28, width: '100%' },
  statsBanner: {
    borderRadius: METRICS.radiusMd,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  statsTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  liveBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  categoryScroll: { gap: 8, paddingBottom: 12 },
  categoryChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  mainQuestionCard: {
    borderRadius: METRICS.radiusMd,
    padding: 16,
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  topicTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  rollBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  questionTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 12,
  },
  questionHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 18,
  },
  typingIndicatorBox: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  unlockedContainer: { marginTop: 14, gap: 10 },
  unlockedBanner: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  answersPairWrap: {
    gap: 10,
  },
  answersPairRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  answerBubble: {
    padding: 12,
    borderRadius: 12,
  },
  bubbleHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  answerBody: { fontSize: 14, lineHeight: 20 },
  waitingContainer: { marginTop: 14, gap: 10 },
  lockedPartnerCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  partnerReadyAlert: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  textAreaInput: {
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  submitBtn: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  historySection: { marginTop: 20 },
  historyHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  historyTitle: { fontSize: 15, fontWeight: '700' },
  historyFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  miniFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  historyCard: {
    borderRadius: METRICS.radiusMd,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
});