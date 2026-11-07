// src/components/home/CoupleHeroCard.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  AppState,
  AppStateStatus,
  Image,
  ImageBackground,
  Platform,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors, METRICS } from '../../constants/theme';
import { useSettingsStore } from '../../store/useSettingsStore';

interface CoupleHeroCardProps {
  colors: ThemeColors;
  anniversaryIso: string | null;
  isLoading: boolean;
  onPressEditAnniversary: () => void;
  onPressOpenProfile: () => void;
  onSendMissYou: () => void;
}

interface ChamberParticle {
  id: number;
  emoji: string;
  targetX: number;
  targetY: number;
  anim: Animated.Value;
}

const MILESTONE_TARGETS = [30, 50, 100, 200, 300, 365, 500, 730, 1000, 1500, 2000, 3650];

export const CoupleHeroCard: React.FC<CoupleHeroCardProps> = ({
  colors,
  anniversaryIso,
  isLoading,
  onPressEditAnniversary,
  onPressOpenProfile,
  onSendMissYou,
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const isSmallScreen = screenWidth < 360;

  const {
    myProfile,
    partnerProfile,
    countFromOne,
    counterStyle,
    enableHeroParticles,
    systemReduceMotion,
    heroWallpaperUri,
    streakDays,
    heartTapTotal,
    socialPrefs,
    incrementHeartTap,
  } = useSettingsStore();

  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  const [chamberParticles, setChamberParticles] = useState<ChamberParticle[]>([]);
  const [comboCount, setComboCount] = useState<number>(0);

  const [myAvatarError, setMyAvatarError] = useState(false);
  const [partnerAvatarError, setPartnerAvatarError] = useState(false);
  const [wallpaperError, setWallpaperError] = useState(false);

  useEffect(() => {
    setMyAvatarError(false);
  }, [myProfile.avatarUri]);
  useEffect(() => {
    setPartnerAvatarError(false);
  }, [partnerProfile.avatarUri]);
  useEffect(() => {
    setWallpaperError(false);
  }, [heroWallpaperUri]);

  const heartPulse = useRef(new Animated.Value(1)).current;
  const chamberScale = useRef(new Animated.Value(1)).current;
  const comboResetTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (systemReduceMotion) {
      heartPulse.setValue(1);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heartPulse, {
          toValue: 1.1,
          duration: 650,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(heartPulse, {
          toValue: 1.0,
          duration: 750,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    pulseLoop.start();
    return () => {
      pulseLoop.stop();
      if (comboResetTimer.current) clearTimeout(comboResetTimer.current);
    };
  }, [heartPulse, systemReduceMotion]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = setInterval(() => {
      setNowTick(new Date());
    }, 1000);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        setNowTick(new Date());
        if (!intervalId) {
          intervalId = setInterval(() => setNowTick(new Date()), 1000);
        }
      } else if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    });

    return () => {
      sub.remove();
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const triggerHeartChamberEffect = () => {
    if (socialPrefs.heartTapHaptics) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    void incrementHeartTap(1);

    setComboCount((prev) => prev + 1);
    if (comboResetTimer.current) clearTimeout(comboResetTimer.current);
    comboResetTimer.current = setTimeout(() => {
      setComboCount(0);
    }, 1500);

    Animated.sequence([
      Animated.timing(chamberScale, {
        toValue: 0.92,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.timing(chamberScale, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();

    if (systemReduceMotion || !enableHeroParticles) return;

    const animStyle = socialPrefs.heartAnimationStyle || 'FLOAT_UP';
    const count = animStyle === 'BURST_RADIAL' ? 5 : 3;

    const newParticles: ChamberParticle[] = Array.from({ length: count }).map((_, idx) => {
      let targetX = (Math.random() - 0.5) * 60;
      let targetY = -36 - Math.random() * 14;

      if (animStyle === 'BURST_RADIAL') {
        const angle = (Math.PI * 2 * idx) / count;
        targetX = Math.cos(angle) * 38;
        targetY = Math.sin(angle) * 28;
      } else if (animStyle === 'FOUNTAIN') {
        targetX = (idx - 1) * 24;
        targetY = 24;
      }

      return {
        id: Date.now() + Math.random() + idx,
        emoji: socialPrefs.heartBoxSkin,
        targetX,
        targetY,
        anim: new Animated.Value(0),
      };
    });

    setChamberParticles((prev) => [...prev.slice(-8), ...newParticles]);

    newParticles.forEach((p) => {
      Animated.timing(p.anim, {
        toValue: 1,
        duration: 780,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setChamberParticles((prev) => prev.filter((item) => item.id !== p.id));
      });
    });
  };

  const timeStats = React.useMemo(() => {
    if (!anniversaryIso) return null;
    const [y, m, d] = anniversaryIso.split('-').map(Number);
    if (!y || !m || !d) return null;

    const startDate = new Date(y, m - 1, d, 0, 0, 0);
    const diffMs = Math.max(0, nowTick.getTime() - startDate.getTime());
    const rawDays = Math.floor(diffMs / 86400000);
    const totalDays = countFromOne ? rawDays + 1 : rawDays;

    const years = Math.floor(rawDays / 365);
    const months = Math.floor((rawDays % 365) / 30);
    const days = (rawDays % 365) % 30;

    const hours = String(nowTick.getHours()).padStart(2, '0');
    const minutes = String(nowTick.getMinutes()).padStart(2, '0');
    const seconds = String(nowTick.getSeconds()).padStart(2, '0');

    let prevMilestone = 0;
    const nextMilestone =
      MILESTONE_TARGETS.find((target) => target > totalDays) ||
      (Math.floor(totalDays / 500) + 1) * 500;

    for (const target of MILESTONE_TARGETS) {
      if (target <= totalDays) prevMilestone = target;
    }

    const span = Math.max(1, nextMilestone - prevMilestone);
    const progressRatio = Math.min(1, Math.max(0, (totalDays - prevMilestone) / span));

    return {
      totalDays,
      years,
      months,
      days,
      hours,
      minutes,
      seconds,
      nextMilestone,
      daysRemaining: Math.max(0, nextMilestone - totalDays),
      progressRatio,
    };
  }, [anniversaryIso, nowTick, countFromOne]);

  const hasWallpaper = Boolean(heroWallpaperUri) && !wallpaperError;
  const primaryTextColor = hasWallpaper ? '#FFFFFF' : colors.textPrimary;
  const secondaryTextColor = hasWallpaper ? 'rgba(255,255,255,0.78)' : colors.textSecondary;

  const renderCardInner = () => (
    <View
      style={[
        styles.innerWrap,
        isSmallScreen && { paddingHorizontal: 14, paddingTop: 18 },
        hasWallpaper && { backgroundColor: colors.heroGradientOverlay },
      ]}
    >
      {/* HÀNG AVATAR & Ô TƯƠNG TÁC TRUNG TÂM */}
      <View style={styles.coupleAvatarRow}>
        <Pressable style={styles.personCol} onPress={onPressOpenProfile}>
          <View style={styles.avatarOuterBox}>
            <View
              style={[
                styles.avatarCircle,
                { borderColor: colors.borderSubtle, backgroundColor: colors.surfaceVariant },
              ]}
            >
              {myProfile.avatarUri && !myAvatarError ? (
                <Image
                  source={{ uri: myProfile.avatarUri }}
                  style={styles.avatarImage}
                  onError={() => setMyAvatarError(true)}
                />
              ) : (
                <Text style={[styles.avatarInitial, { color: colors.textPrimary }]}>
                  {myProfile.nickname.slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            {socialPrefs.activeStatusOnline && <View style={styles.onlineGreenDot} />}
            <View style={[styles.moodBadge, { backgroundColor: colors.surface }]}>
              <Text style={styles.moodEmojiText}>{myProfile.moodEmoji}</Text>
            </View>
          </View>
          <Text style={[styles.personName, { color: primaryTextColor }]} numberOfLines={1}>
            {myProfile.nickname}
          </Text>
        </Pressable>

        {/* Ô TƯƠNG TÁC TRÁI TIM */}
        <Animated.View style={{ transform: [{ scale: chamberScale }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chạm biểu tượng cảm xúc"
            style={[
              styles.heartChamberBox,
              isSmallScreen && { width: 68, height: 64 },
              {
                borderColor: hasWallpaper ? 'rgba(255,255,255,0.22)' : colors.borderSubtle,
                backgroundColor: hasWallpaper
                  ? 'rgba(15, 23, 42, 0.45)'
                  : colors.surfaceVariant,
              },
            ]}
            onPress={triggerHeartChamberEffect}
          >
            {chamberParticles.map((p) => {
              const translateX = p.anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, p.targetX],
              });
              const translateY = p.anim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, p.targetY],
              });
              const scale = p.anim.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: [0.5, 1.15, 0.7],
              });
              const opacity = p.anim.interpolate({
                inputRange: [0, 0.7, 1],
                outputRange: [1, 0.8, 0],
              });
              return (
                <Animated.Text
                  key={p.id}
                  style={[
                    styles.chamberParticleText,
                    {
                      opacity,
                      transform: [{ translateX }, { translateY }, { scale }],
                    },
                  ]}
                >
                  {p.emoji}
                </Animated.Text>
              );
            })}

            <Animated.Text
              style={[
                styles.chamberMainHeart,
                { transform: [{ scale: heartPulse }] },
              ]}
            >
              {socialPrefs.heartBoxSkin}
            </Animated.Text>

            <Text style={[styles.chamberCounterLabel, { color: secondaryTextColor }]}>
              {comboCount > 1 ? `x${comboCount}` : heartTapTotal > 0 ? `${heartTapTotal}` : 'Chạm'}
            </Text>
          </Pressable>
        </Animated.View>

        <Pressable style={styles.personCol} onPress={onPressOpenProfile}>
          <View style={styles.avatarOuterBox}>
            <View
              style={[
                styles.avatarCircle,
                { borderColor: colors.borderSubtle, backgroundColor: colors.surfaceVariant },
              ]}
            >
              {partnerProfile.avatarUri && !partnerAvatarError ? (
                <Image
                  source={{ uri: partnerProfile.avatarUri }}
                  style={styles.avatarImage}
                  onError={() => setPartnerAvatarError(true)}
                />
              ) : (
                <Text style={[styles.avatarInitial, { color: colors.textPrimary }]}>
                  {partnerProfile.nickname.slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            {socialPrefs.activeStatusOnline && <View style={styles.onlineGreenDot} />}
            <View style={[styles.moodBadge, { backgroundColor: colors.surface }]}>
              <Text style={styles.moodEmojiText}>{partnerProfile.moodEmoji}</Text>
            </View>
          </View>
          <Text style={[styles.personName, { color: primaryTextColor }]} numberOfLines={1}>
            {partnerProfile.nickname}
          </Text>
        </Pressable>
      </View>

      {/* BỘ ĐẾM NGÀY TRUNG TÂM */}
      {isLoading && !timeStats ? (
        <View style={styles.skeletonBlock}>
          <View style={[styles.skeletonNumber, { backgroundColor: colors.surfaceVariant }]} />
          <View style={[styles.skeletonSub, { backgroundColor: colors.surfaceVariant }]} />
        </View>
      ) : !timeStats ? (
        <View style={styles.unconfiguredBox}>
          <Text style={[styles.unconfiguredTitle, { color: primaryTextColor }]}>
            Chưa có ngày kỷ niệm
          </Text>
          <Pressable
            style={[styles.setupDateBtn, { backgroundColor: colors.primary }]}
            onPress={onPressEditAnniversary}
          >
            <Text style={styles.setupDateBtnText}>Thiết lập ngày bắt đầu</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.counterCenterWrap}>
          {counterStyle === 'YMD_BREAKDOWN' ? (
            <View style={[styles.ymdGrid, isSmallScreen && { gap: 18 }]}>
              <View style={styles.ymdCell}>
                <Text style={[styles.ymdVal, { color: primaryTextColor }]}>{timeStats.years}</Text>
                <Text style={[styles.ymdLbl, { color: secondaryTextColor }]}>năm</Text>
              </View>
              <View style={styles.ymdCell}>
                <Text style={[styles.ymdVal, { color: primaryTextColor }]}>{timeStats.months}</Text>
                <Text style={[styles.ymdLbl, { color: secondaryTextColor }]}>tháng</Text>
              </View>
              <View style={styles.ymdCell}>
                <Text style={[styles.ymdVal, { color: primaryTextColor }]}>{timeStats.days}</Text>
                <Text style={[styles.ymdLbl, { color: secondaryTextColor }]}>ngày</Text>
              </View>
            </View>
          ) : (
            <View style={styles.bigDaysRow}>
              <Text
                style={[
                  styles.bigDaysNumber,
                  isSmallScreen && { fontSize: 44 },
                  { color: primaryTextColor },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {timeStats.totalDays}
              </Text>
              <Text style={[styles.bigDaysUnit, { color: secondaryTextColor }]}>ngày</Text>
            </View>
          )}

          <Text style={[styles.liveClockText, { color: secondaryTextColor }]}>
            {timeStats.years > 0 ? `${timeStats.years} năm, ` : ''}
            {timeStats.months} tháng, {timeStats.days} ngày  •  {timeStats.hours}:{timeStats.minutes}:{timeStats.seconds}
          </Text>

          <View style={styles.milestoneProgressWrap}>
            <View style={styles.milestoneLabelRow}>
              <Text style={[styles.milestoneLabelText, { color: secondaryTextColor }]}>
                Cột mốc {timeStats.nextMilestone} ngày
              </Text>
              <Text style={[styles.milestoneRemainText, { color: primaryTextColor }]}>
                còn {timeStats.daysRemaining} ngày
              </Text>
            </View>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: hasWallpaper ? 'rgba(255,255,255,0.22)' : colors.surfaceVariant },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${Math.round(timeStats.progressRatio * 100)}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>
      )}

      {/* HÀNG THÔNG TIN NGÀY BẮT ĐẦU & GỬI TÍN HIỆU */}
      <View
        style={[
          styles.heroFooterRow,
          { borderTopColor: hasWallpaper ? 'rgba(255,255,255,0.15)' : colors.borderSubtle },
        ]}
      >
        <View style={styles.heroMetaCluster}>
          <Pressable
            accessibilityRole="button"
            style={styles.dateMetaBtn}
            onPress={onPressEditAnniversary}
            hitSlop={8}
          >
            <Text style={[styles.dateMetaLabel, { color: secondaryTextColor }]}>Từ ngày</Text>
            <Text style={[styles.dateMetaValue, { color: primaryTextColor }]}>
              {anniversaryIso || 'Chưa chọn'}
            </Text>
          </Pressable>

          <View
            style={[
              styles.verticalDivider,
              { backgroundColor: hasWallpaper ? 'rgba(255,255,255,0.15)' : colors.borderSubtle },
            ]}
          />

          <View style={styles.dateMetaBtn}>
            <Text style={[styles.dateMetaLabel, { color: secondaryTextColor }]}>Tương tác</Text>
            <Text style={[styles.dateMetaValue, { color: primaryTextColor }]}>
              {streakDays} ngày
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          style={[
            styles.sendMissYouBtn,
            { backgroundColor: colors.primary },
            isSmallScreen && { paddingHorizontal: 12 },
          ]}
          onPress={() => {
            triggerHeartChamberEffect();
            onSendMissYou();
          }}
        >
          <Text style={styles.sendMissYouBtnText}>Gửi tín hiệu</Text>
        </Pressable>
      </View>
    </View>
  );

  if (hasWallpaper && heroWallpaperUri) {
    return (
      <ImageBackground
        source={{ uri: heroWallpaperUri }}
        style={[styles.cardShell, { borderColor: colors.borderSubtle }]}
        imageStyle={{ borderRadius: METRICS.radiusLg }}
        onError={() => setWallpaperError(true)}
      >
        {renderCardInner()}
      </ImageBackground>
    );
  }

  return (
    <View
      style={[
        styles.cardShell,
        { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
      ]}
    >
      {renderCardInner()}
    </View>
  );
};

const styles = StyleSheet.create({
  cardShell: {
    borderRadius: METRICS.radiusLg,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
      },
      android: { elevation: 1 },
    }),
  },
  innerWrap: {
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  coupleAvatarRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 8,
    marginBottom: 14,
  },
  personCol: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 110,
  },
  avatarOuterBox: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 19, fontWeight: '700' },
  onlineGreenDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  moodBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  moodEmojiText: { fontSize: 12 },
  personName: { fontSize: 13, fontWeight: '600', textAlign: 'center', width: '100%' },
  heartChamberBox: {
    width: 78,
    height: 70,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  chamberParticleText: {
    position: 'absolute',
    fontSize: 14,
  },
  chamberMainHeart: {
    fontSize: 22,
  },
  chamberCounterLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  skeletonBlock: { alignItems: 'center', marginVertical: 14, width: '100%' },
  skeletonNumber: { width: 120, height: 48, borderRadius: 10, marginBottom: 8 },
  skeletonSub: { width: 160, height: 14, borderRadius: 6 },
  unconfiguredBox: { alignItems: 'center', marginVertical: 12 },
  unconfiguredTitle: { fontSize: 14, fontWeight: '500', marginBottom: 10 },
  setupDateBtn: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setupDateBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  counterCenterWrap: { width: '100%', alignItems: 'center', marginTop: 2 },
  bigDaysRow: { flexDirection: 'row', alignItems: 'baseline' },
  bigDaysNumber: {
    fontSize: 54,
    fontWeight: '800',
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  bigDaysUnit: { fontSize: 15, fontWeight: '600', marginLeft: 6 },
  ymdGrid: { flexDirection: 'row', gap: 28, marginVertical: 6 },
  ymdCell: { alignItems: 'center' },
  ymdVal: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  ymdLbl: { fontSize: 12, fontWeight: '500' },
  liveClockText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  milestoneProgressWrap: { width: '100%', marginTop: 16, marginBottom: 16 },
  milestoneLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  milestoneLabelText: { fontSize: 12, fontWeight: '500' },
  milestoneRemainText: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', width: '100%' },
  progressFill: { height: '100%', borderRadius: 3 },
  heroFooterRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  heroMetaCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  dateMetaBtn: {
    justifyContent: 'center',
  },
  dateMetaLabel: { fontSize: 11, fontWeight: '500' },
  dateMetaValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  verticalDivider: { width: 1, height: 24 },
  sendMissYouBtn: {
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendMissYouBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});