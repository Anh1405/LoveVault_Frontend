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

const RAW_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL || 'https://lovevault-appmoblie.onrender.com';
const SOCKET_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

export function useRealtimeDailyQA() {
  const { user, coupleId: storeCoupleId } = useAuthStore();
  const currentUserId = user?.id || (user as any)?.sub || 'local_me';
  const { myProfile } = useSettingsStore();

  const [resolvedCoupleId, setResolvedCoupleId] = useState<string | null>(
      storeCoupleId || (user as any)?.coupleId || null,
  );

  useEffect(() => {
    if (storeCoupleId) {
      setResolvedCoupleId(storeCoupleId);
    } else if ((user as any)?.coupleId) {
      setResolvedCoupleId((user as any).coupleId);
    }
  }, [storeCoupleId, user]);

  const cacheKey = useMemo(
      () => `lovevault_rt_daily_qa_v6_${resolvedCoupleId || currentUserId}`,
      [resolvedCoupleId, currentUserId],
  );

  const [qaFilter, setQaFilter] = useState<QuestionCategory>('ALL');
  const [isLive, setIsLive] = useState<boolean>(true);
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

  const activeQARef = useRef<DailyQAState>(activeQA);
  activeQARef.current = activeQA;

  const historyRef = useRef<DailyQAState[]>(history);
  historyRef.current = history;

  const isSubmittingRef = useRef<boolean>(false);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitRef = useRef<number>(0);
  const prevBothAnsweredRef = useRef<boolean>(false);

  const mapServerRecordToClient = useCallback(
      (raw: {
        questionId: string;
        category?: any;
        questionText?: string;
        answersByUserId?: Record<string, DailyQAAnswerEntry>;
        answers?: Record<string, DailyQAAnswerEntry>;
      }): DailyQAState => {
        const bankMatch =
            COUPLE_QUESTION_BANK.find((q) => q.id === raw.questionId) ||
            COUPLE_QUESTION_BANK[0];

        const map: Record<string, DailyQAAnswerEntry> =
            raw.answersByUserId || raw.answers || {};

        const myEntry = map[currentUserId];
        const partnerEntry = Object.values(map).find(
            (entry) =>
                entry &&
                entry.userId &&
                String(entry.userId) !== String(currentUserId),
        );

        const hasMyAnswer = Boolean(myEntry?.answer?.trim());
        const hasPartnerAnswered = Boolean(partnerEntry?.answer?.trim() || partnerEntry?.isLocked);
        const bothAnswered = hasMyAnswer && Boolean(partnerEntry?.answer?.trim());

        return {
          questionId: raw.questionId || bankMatch.id,
          category: raw.category || bankMatch.category || 'FUNNY',
          questionText: raw.questionText || bankMatch.text,
          hint: bankMatch.hint,
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

  // Kéo dữ liệu từ `/api/v1/couples/workspace-sync` (cổng có sẵn 100% trên Render)
  const syncFromCloud = useCallback(
      async (silent = false) => {
        if (isSubmittingRef.current) return;

        if (!silent) {
          const cachedRaw = await storage.getItem(cacheKey);
          if (cachedRaw) {
            try {
              const parsed = JSON.parse(cachedRaw);
              if (parsed.activeQA) {
                const mapped = mapServerRecordToClient(parsed.activeQA);
                setActiveQA(mapped);
                prevBothAnsweredRef.current = mapped.bothAnswered;
              }
              if (Array.isArray(parsed.history)) {
                setHistory(parsed.history.map(mapServerRecordToClient));
              }
            } catch {}
          }
        }

        try {
          let targetCoupleId = resolvedCoupleId;
          if (!targetCoupleId) {
            const counterRes = await api.get('/api/v1/couples/day-counter');
            if (counterRes.data?.coupleId) {
              targetCoupleId = counterRes.data.coupleId;
              setResolvedCoupleId(targetCoupleId);
            }
          }

          const res = await api.get('/api/v1/couples/workspace-sync', {
            params: targetCoupleId ? { coupleId: targetCoupleId } : undefined,
          });

          setIsLive(true);

          const cloudDailyQA = res.data?.dailyQA;
          const cloudHistory: any[] = Array.isArray(res.data?.qaHistory)
              ? res.data.qaHistory
              : [];

          let nextHistory = historyRef.current;
          if (cloudHistory.length > 0) {
            const byId = new Map<string, DailyQAState>();
            for (const loc of historyRef.current) {
              byId.set(loc.questionId, loc);
            }
            for (const rem of cloudHistory) {
              if (!rem?.questionId) continue;
              const existing = byId.get(rem.questionId);
              const mergedMap = {
                ...(existing?.answersByUserId || {}),
                ...(rem.answersByUserId || rem.answers || {}),
              };
              byId.set(
                  rem.questionId,
                  mapServerRecordToClient({
                    ...existing,
                    ...rem,
                    answersByUserId: mergedMap,
                  }),
              );
            }
            nextHistory = Array.from(byId.values());
            setHistory(nextHistory);
          }

          if (cloudDailyQA && cloudDailyQA.questionId) {
            // Gộp câu trả lời của mình và của đối phương để không bao giờ mất dữ liệu
            const currentLocal = activeQARef.current;
            const isSameQuestion =
                currentLocal.questionId === cloudDailyQA.questionId;

            const mergedAnswers: Record<string, DailyQAAnswerEntry> = {
              ...(isSameQuestion ? currentLocal.answersByUserId : {}),
              ...(cloudDailyQA.answersByUserId || cloudDailyQA.answers || {}),
            };

            const mappedActive = mapServerRecordToClient({
              ...cloudDailyQA,
              answersByUserId: mergedAnswers,
            });

            if (mappedActive.bothAnswered && !prevBothAnsweredRef.current) {
              void Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
              );
            }
            prevBothAnsweredRef.current = mappedActive.bothAnswered;
            setActiveQA(mappedActive);

            await storage.setItem(
                cacheKey,
                JSON.stringify({ activeQA: mappedActive, history: nextHistory }),
            );
          }
        } catch {
          // Chỉ khi mất mạng hoàn toàn mới chuyển sang false
          setIsLive(false);
        }
      },
      [resolvedCoupleId, cacheKey, mapServerRecordToClient],
  );

  // Kết nối WebSocket (nếu Backend đã mở cổng /qa) + Tự động đồng bộ 1.5s/lần qua workspace-sync
  useEffect(() => {
    void syncFromCloud(false);

    let isMounted = true;

    const connectSocket = async () => {
      const token =
          typeof (storage as any).getToken === 'function'
              ? await (storage as any).getToken()
              : await storage.getItem('access_token');

      if (!token || !isMounted) return;

      const socket = io(`${SOCKET_BASE_URL}/qa`, {
        transports: ['polling', 'websocket'],
        auth: { token },
        query: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (isMounted) setIsLive(true);
      });

      socket.on(
          'qa:partner_typing',
          (payload: { userId: string; nickname?: string; isTyping: boolean }) => {
            if (!isMounted || String(payload.userId) === String(currentUserId))
              return;
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
        if (nextState.bothAnswered && !prevBothAnsweredRef.current) {
          void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
          );
        }
        prevBothAnsweredRef.current = nextState.bothAnswered;
        setPartnerTypingName(null);
        setActiveQA(nextState);
      });
    };

    void connectSocket();

    // Vòng lặp Fast-Sync 1.8 giây đảm bảo dù WebSocket chưa bật trên Render thì 2 máy vẫn nhảy đáp án tức thì
    const pollTimer = setInterval(() => {
      if (AppState.currentState === 'active') {
        void syncFromCloud(true);
      }
    }, 1800);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncFromCloud(true);
      }
    });

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
      appStateSub.remove();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [currentUserId, syncFromCloud, mapServerRecordToClient]);

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

  // Gửi câu trả lời: Hợp nhất nguyên tử với dữ liệu mới nhất trên Server rồi lưu vào PostgreSQL
  const submitAnswer = useCallback(
      async (answerText: string) => {
        const trimmed = answerText.trim();
        if (!trimmed) return;

        notifyTyping(false);
        isSubmittingRef.current = true;
        const nowIso = new Date().toISOString();

        try {
          // 1. Kéo bản mới nhất trên Server về trước khi ghi để không bao giờ ghi đè mất câu trả lời của người kia
          const latestRes = await api
              .get('/api/v1/couples/workspace-sync', {
                params: resolvedCoupleId ? { coupleId: resolvedCoupleId } : undefined,
              })
              .catch(() => null);

          const serverDailyQA = latestRes?.data?.dailyQA;
          const serverHistory: any[] = Array.isArray(latestRes?.data?.qaHistory)
              ? latestRes.data.qaHistory
              : [];

          const existingServerItem =
              serverDailyQA?.questionId === activeQA.questionId
                  ? serverDailyQA
                  : serverHistory.find((h) => h?.questionId === activeQA.questionId);

          const mergedAnswersMap: Record<string, DailyQAAnswerEntry> = {
            ...(activeQA.answersByUserId || {}),
            ...(existingServerItem?.answersByUserId ||
                existingServerItem?.answers ||
                {}),
            [currentUserId]: {
              userId: currentUserId,
              nickname: myProfile.nickname,
              answer: trimmed,
              answeredAt: nowIso,
            },
          };

          const updatedState = mapServerRecordToClient({
            questionId: activeQA.questionId,
            category: activeQA.category,
            questionText: activeQA.questionText,
            answersByUserId: mergedAnswersMap,
          });

          setActiveQA(updatedState);

          const updatedHistory = [
            updatedState,
            ...historyRef.current.filter(
                (h) => h.questionId !== updatedState.questionId,
            ),
          ];
          setHistory(updatedHistory);

          await storage.setItem(
              cacheKey,
              JSON.stringify({ activeQA: updatedState, history: updatedHistory }),
          );

          // 2. Lưu thẳng lên bảng couple_workspace_states trong PostgreSQL
          await api.put('/api/v1/couples/workspace-sync', {
            coupleId: resolvedCoupleId,
            dailyQA: updatedState,
            qaHistory: updatedHistory,
          });

          // 3. Nếu Socket đang mở thì bắn thêm qua Socket
          if (socketRef.current?.connected) {
            socketRef.current.emit('qa:submit_answer', {
              questionId: activeQA.questionId,
              questionText: activeQA.questionText,
              category: activeQA.category,
              nickname: myProfile.nickname,
              answer: trimmed,
            });
          }

          setIsLive(true);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } finally {
          isSubmittingRef.current = false;
        }
      },
      [
        activeQA,
        currentUserId,
        myProfile.nickname,
        resolvedCoupleId,
        cacheKey,
        notifyTyping,
        mapServerRecordToClient,
      ],
  );

  // Đổi câu hỏi: Đồng bộ ngay câu hỏi mới sang màn hình của đối phương
  const rollQuestion = useCallback(
      async (categoryOverride?: QuestionCategory) => {
        void Haptics.selectionAsync().catch(() => null);
        const targetCat = categoryOverride || qaFilter;
        if (categoryOverride) setQaFilter(categoryOverride);

        const pool =
            targetCat === 'ALL'
                ? COUPLE_QUESTION_BANK
                : COUPLE_QUESTION_BANK.filter((q) => q.category === targetCat);

        const answeredIds = new Set(historyRef.current.map((h) => h.questionId));
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

        const existingHistoryItem = historyRef.current.find(
            (h) => h.questionId === picked.id,
        );

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

        await storage.setItem(
            cacheKey,
            JSON.stringify({ activeQA: nextQA, history: historyRef.current }),
        );

        await api
            .put('/api/v1/couples/workspace-sync', {
              coupleId: resolvedCoupleId,
              dailyQA: nextQA,
              qaHistory: historyRef.current,
            })
            .catch(() => null);

        if (socketRef.current?.connected) {
          socketRef.current.emit('qa:roll_question', {
            questionId: picked.id,
            questionText: picked.text,
            category: picked.category,
          });
        }
      },
      [qaFilter, activeQA.questionId, cacheKey, resolvedCoupleId],
  );

  const selectQuestionFromHistory = useCallback(
      async (item: DailyQAState) => {
        void Haptics.selectionAsync().catch(() => null);
        prevBothAnsweredRef.current = item.bothAnswered;
        setActiveQA(item);

        await api
            .put('/api/v1/couples/workspace-sync', {
              coupleId: resolvedCoupleId,
              dailyQA: item,
              qaHistory: historyRef.current,
            })
            .catch(() => null);
      },
      [resolvedCoupleId],
  );

  const totalQuestionsCount = COUPLE_QUESTION_BANK.length;
  const completedBothCount = useMemo(
      () => history.filter((h) => h.bothAnswered).length,
      [history],
  );

  return {
    activeQA,
    qaFilter,
    qaHistory: history,
    socketConnected: isLive,
    partnerTypingName,
    totalQuestionsCount,
    completedBothCount,
    notifyTyping,
    submitAnswer,
    rollQuestion,
    selectQuestionFromHistory,
    refreshQa: () => syncFromCloud(false),
  };
}