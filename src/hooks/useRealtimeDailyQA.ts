// src/hooks/useRealtimeDailyQA.ts
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { storage } from '../services/storage';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import {
  COUPLE_QUESTION_BANK,
  QuestionCategory,
  CoupleQuestionItem,
} from '../constants/questionBank';

export interface DailyQAAnswerEntry {
  userId: string;
  nickname: string;
  answer: string;
  answeredAt: string;
  isLocked?: boolean;
}

export interface DailyQAState {
  questionId: string;
  category: Exclude<QuestionCategory, 'ALL'>;
  questionText: string;
  hint?: string;
  myAnswer: string;
  partnerAnswer: string | null;
  hasPartnerAnswered: boolean;
  bothAnswered: boolean;
  answeredAt: string | null;
  answersByUserId: Record<string, DailyQAAnswerEntry>;
}

const SOCKET_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://lovevault-appmoblie.onrender.com';

export function useRealtimeDailyQA() {
  const { user, coupleId } = useAuthStore();
  const currentUserId = user?.id || 'local_me';
  const { myProfile } = useSettingsStore();

  const cacheKey = useMemo(
    () => `lovevault_rt_daily_qa_v5_${coupleId || currentUserId}`,
    [coupleId, currentUserId],
  );

  const [qaFilter, setQaFilter] = useState<QuestionCategory>('ALL');
  const [socketConnected, setSocketConnected] = useState(false);
  const [partnerTypingName, setPartnerTypingName] = useState<string | null>(null);
  const [history, setHistory] = useState<DailyQAState[]>([]);

  const firstQuestion = COUPLE_QUESTION_BANK[0];
  const [activeQA, setActiveQA] = useState<DailyQAState>({
    questionId: firstQuestion.id,
    category: firstQuestion.category,
    questionText: firstQuestion.text,
    hint: firstQuestion.hint,
    myAnswer: '',
    partnerAnswer: null,
    hasPartnerAnswered: false,
    bothAnswered: false,
    answeredAt: null,
    answersByUserId: {},
  });

  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitRef = useRef<number>(0);
  const prevBothAnsweredRef = useRef<boolean>(false);

  const mapServerRecordToClient = useCallback(
    (raw: {
      questionId: string;
      category: any;
      questionText: string;
      answersByUserId?: Record<string, DailyQAAnswerEntry>;
    }): DailyQAState => {
      const bankMatch = COUPLE_QUESTION_BANK.find((q) => q.id === raw.questionId);
      const map = raw.answersByUserId || {};
      const myEntry = map[currentUserId];
      const partnerEntry = Object.values(map).find(
        (entry) => String(entry.userId) !== String(currentUserId),
      );

      const hasMyAnswer = Boolean(myEntry?.answer?.trim());
      const hasPartnerAnswered = Boolean(partnerEntry);
      const bothAnswered = hasMyAnswer && hasPartnerAnswered && !partnerEntry?.isLocked;

      return {
        questionId: raw.questionId,
        category: raw.category || bankMatch?.category || 'FUNNY',
        questionText: raw.questionText || bankMatch?.text || '',
        hint: bankMatch?.hint,
        myAnswer: myEntry?.answer || '',
        partnerAnswer: bothAnswered ? partnerEntry?.answer || null : null,
        hasPartnerAnswered,
        bothAnswered,
        answeredAt: myEntry?.answeredAt || null,
        answersByUserId: map,
      };
    },
    [currentUserId],
  );

  // Kéo dữ liệu ban đầu qua REST và lưu bộ đệm Offline
  const fetchInitialQaData = useCallback(async () => {
    const cachedRaw = await storage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const parsed = JSON.parse(cachedRaw);
        if (parsed.activeQA) setActiveQA(parsed.activeQA);
        if (Array.isArray(parsed.history)) setHistory(parsed.history);
      } catch {}
    }

    if (!coupleId) return;
    try {
      const res = await api.get('/api/v1/couples/daily-qa');
      if (res.data?.activeQA) {
        const mappedActive = mapServerRecordToClient(res.data.activeQA);
        setActiveQA(mappedActive);
        prevBothAnsweredRef.current = mappedActive.bothAnswered;
      }
      if (Array.isArray(res.data?.history)) {
        const mappedHist = res.data.history.map(mapServerRecordToClient);
        setHistory(mappedHist);
        await storage.setItem(
          cacheKey,
          JSON.stringify({
            activeQA: res.data.activeQA
              ? mapServerRecordToClient(res.data.activeQA)
              : undefined,
            history: mappedHist,
          }),
        );
      }
    } catch {
      // Giữ nguyên dữ liệu cache khi mất mạng
    }
  }, [coupleId, cacheKey, mapServerRecordToClient]);

  // Khởi tạo và quản lý kết nối Socket.IO
  useEffect(() => {
    void fetchInitialQaData();
    if (!coupleId) return;

    let isMounted = true;

    const connectSocket = async () => {
      const token =
        typeof (storage as any).getToken === 'function'
          ? await (storage as any).getToken()
          : await storage.getItem('access_token');

      if (!token || !isMounted) return;

      const socket = io(`${SOCKET_BASE_URL}/qa`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (isMounted) setSocketConnected(true);
      });

      socket.on('disconnect', () => {
        if (isMounted) {
          setSocketConnected(false);
          setPartnerTypingName(null);
        }
      });

      socket.on(
        'qa:partner_typing',
        (payload: { userId: string; nickname?: string; isTyping: boolean }) => {
          if (!isMounted || String(payload.userId) === String(currentUserId)) return;
          if (payload.isTyping) {
            setPartnerTypingName(payload.nickname || 'Người ấy');
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
              setPartnerTypingName(null);
            }, 3500);
          } else {
            setPartnerTypingName(null);
          }
        },
      );

      socket.on('qa:state_updated', (serverRecord: any) => {
        if (!isMounted || !serverRecord?.questionId) return;
        const nextState = mapServerRecordToClient(serverRecord);

        // Rung phản hồi xúc giác ngay khoảnh khắc cả hai vừa trả lời xong
        if (nextState.bothAnswered && !prevBothAnsweredRef.current) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        prevBothAnsweredRef.current = nextState.bothAnswered;
        setPartnerTypingName(null);

        setActiveQA(nextState);
        setHistory((prev) => {
          const hasAnyAnswer =
            Boolean(nextState.myAnswer) || nextState.hasPartnerAnswered;
          if (!hasAnyAnswer) return prev;
          const filtered = prev.filter((i) => i.questionId !== nextState.questionId);
          const updatedHist = [nextState, ...filtered];
          void storage.setItem(
            cacheKey,
            JSON.stringify({ activeQA: nextState, history: updatedHist }),
          );
          return updatedHist;
        });
      });
    };

    void connectSocket();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (socketRef.current && !socketRef.current.connected) {
          socketRef.current.connect();
        }
        void fetchInitialQaData();
      }
    });

    return () => {
      isMounted = false;
      appStateSub.remove();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [coupleId, currentUserId, cacheKey, fetchInitialQaData, mapServerRecordToClient]);

  const notifyTyping = useCallback(
    (isTyping: boolean) => {
      if (!socketRef.current?.connected) return;
      const now = Date.now();
      if (isTyping && now - lastTypingEmitRef.current < 1200) return;
      lastTypingEmitRef.current = now;
      socketRef.current.emit('qa:typing', {
        isTyping,
        nickname: myProfile.nickname,
      });
    },
    [myProfile.nickname],
  );

  const submitAnswer = useCallback(
    async (answerText: string) => {
      const trimmed = answerText.trim();
      if (!trimmed) return;

      notifyTyping(false);
      const nowIso = new Date().toISOString();

      // Cập nhật Optimistic UI ngay lập tức trên thiết bị của mình
      const optimisticMap: Record<string, DailyQAAnswerEntry> = {
        ...activeQA.answersByUserId,
        [currentUserId]: {
          userId: currentUserId,
          nickname: myProfile.nickname,
          answer: trimmed,
          answeredAt: nowIso,
        },
      };
      const optimisticState = mapServerRecordToClient({
        ...activeQA,
        answersByUserId: optimisticMap,
      });
      setActiveQA(optimisticState);

      if (socketRef.current?.connected) {
        await new Promise<void>((resolve, reject) => {
          socketRef.current
            ?.timeout(5000)
            .emit(
              'qa:submit_answer',
              {
                questionId: activeQA.questionId,
                questionText: activeQA.questionText,
                category: activeQA.category,
                nickname: myProfile.nickname,
                answer: trimmed,
              },
              (err: any, response: any) => {
                if (err || response?.status === 'ERROR') {
                  reject(err || new Error(response?.message));
                } else {
                  resolve();
                }
              },
            );
        });
      } else {
        // Fallback sang REST nếu thiết bị đang ở mạng chặn WebSocket
        await api.post('/api/v1/daily-answers', {
          questionId: activeQA.questionId,
          questionText: activeQA.questionText,
          category: activeQA.category,
          userId: currentUserId,
          nickname: myProfile.nickname,
          answer: trimmed,
        });
        await fetchInitialQaData();
      }
    },
    [
      activeQA,
      currentUserId,
      myProfile.nickname,
      notifyTyping,
      mapServerRecordToClient,
      fetchInitialQaData,
    ],
  );

  const rollQuestion = useCallback(
    async (categoryOverride?: QuestionCategory) => {
      void Haptics.selectionAsync().catch(() => null);
      const targetCat = categoryOverride || qaFilter;
      if (categoryOverride) setQaFilter(categoryOverride);

      const pool =
        targetCat === 'ALL'
          ? COUPLE_QUESTION_BANK
          : COUPLE_QUESTION_BANK.filter((q) => q.category === targetCat);

      // Ưu tiên chọn những câu hai đứa chưa từng trả lời
      const answeredIds = new Set(history.map((h) => h.questionId));
      const unansweredPool = pool.filter(
        (q) => !answeredIds.has(q.id) && q.id !== activeQA.questionId,
      );
      const candidatePool =
        unansweredPool.length > 0
          ? unansweredPool
          : pool.filter((q) => q.id !== activeQA.questionId);
      const finalPool = candidatePool.length > 0 ? candidatePool : pool;

      const picked: CoupleQuestionItem =
        finalPool[Math.floor(Math.random() * finalPool.length)];

      const existingHistoryItem = history.find((h) => h.questionId === picked.id);
      const nextQA: DailyQAState = existingHistoryItem || {
        questionId: picked.id,
        category: picked.category,
        questionText: picked.text,
        hint: picked.hint,
        myAnswer: '',
        partnerAnswer: null,
        hasPartnerAnswered: false,
        bothAnswered: false,
        answeredAt: null,
        answersByUserId: {},
      };

      prevBothAnsweredRef.current = nextQA.bothAnswered;
      setActiveQA(nextQA);

      if (socketRef.current?.connected) {
        socketRef.current.emit('qa:roll_question', {
          questionId: picked.id,
          questionText: picked.text,
          category: picked.category,
        });
      }
    },
    [qaFilter, history, activeQA.questionId],
  );

  const selectQuestionFromHistory = useCallback((item: DailyQAState) => {
    void Haptics.selectionAsync().catch(() => null);
    prevBothAnsweredRef.current = item.bothAnswered;
    setActiveQA(item);
  }, []);

  const totalQuestionsCount = COUPLE_QUESTION_BANK.length;
  const completedBothCount = useMemo(
    () => history.filter((h) => h.bothAnswered).length,
    [history],
  );

  return {
    activeQA,
    qaFilter,
    qaHistory: history,
    socketConnected,
    partnerTypingName,
    totalQuestionsCount,
    completedBothCount,
    notifyTyping,
    submitAnswer,
    rollQuestion,
    selectQuestionFromHistory,
    refreshQa: fetchInitialQaData,
  };
}