// src/components/home/DatePlanTicketCard.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { ThemeColors } from '../../constants/theme';
import {
  ImportantEvent,
  openAddressInGoogleMaps,
  computeDaysUntilNextOccurrence,
} from '../../hooks/useCoupleWorkspace';
import { DATE_ACTIVITY_OPTIONS, TRANSPORT_OPTIONS } from './modals/modalConstantsAndUtils';

interface DatePlanTicketCardProps {
  item: ImportantEvent;
  colors: ThemeColors;
  onEdit: (item: ImportantEvent) => void;
  onDelete: (id: string) => void;
}

export const DatePlanTicketCard: React.FC<DatePlanTicketCardProps> = ({
  item,
  colors,
  onEdit,
  onDelete,
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const isSmallScreen = screenWidth < 360;

  const plan = item.datePlan;
  const daysLeft = computeDaysUntilNextOccurrence(item.eventDate, false);

  const activityMeta = plan
    ? DATE_ACTIVITY_OPTIONS.find((a) => a.id === plan.activityType)
    : null;
  const transportMeta = plan
    ? TRANSPORT_OPTIONS.find((t) => t.id === plan.transport)
    : null;

  return (
    <Pressable
      style={[
        styles.ticketCard,
        isSmallScreen && { padding: 12 },
        { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
      ]}
      onPress={() => onEdit(item)}
    >
      {/* HEADER TICKET */}
      <View style={styles.ticketHeader}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={styles.badgeWrapRow}>
            <Text style={styles.passBadgeText}>🥂 KÈO ĐI CHƠI</Text>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: daysLeft === 0 ? '#DC2626' : colors.primaryContainer },
              ]}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '800',
                  color: daysLeft === 0 ? '#FFFFFF' : colors.onPrimaryContainer,
                }}
              >
                {daysLeft === 0 ? 'HÔM NAY' : `CÒN ${daysLeft} NGÀY`}
              </Text>
            </View>
          </View>

          <Text style={[styles.ticketTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {item.title}
          </Text>
        </View>

        <Pressable
          style={[styles.mapShortcutBtn, { backgroundColor: '#16A34A' }]}
          onPress={() => {
            openAddressInGoogleMaps(
              plan?.address || plan?.locationName,
              plan?.googleMapsUrl,
            );
          }}
        >
          <Text style={styles.mapShortcutText}>🗺️ Maps</Text>
        </Pressable>
      </View>

      {/* DASHED LINE SEPARATOR */}
      <View style={[styles.dashedLine, { borderColor: colors.borderSubtle }]} />

      {/* TIME & LOCATION MAIN ROW */}
      <View style={styles.infoRow}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>THỜI GIAN ĐÓN</Text>
          <Text style={[styles.metaValue, { color: colors.primary }]}>
            ⏰ {item.eventDate} ({item.notifyAtTime})
          </Text>
        </View>

        {Boolean(plan?.estimatedBudget) && (
          <View style={isSmallScreen ? { alignItems: 'flex-start' } : { alignItems: 'flex-end' }}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>DỰ TRÙ TỔNG</Text>
            <Text style={[styles.metaValue, { color: '#15803D' }]}>
              💰 ~{plan?.estimatedBudget?.toLocaleString('vi-VN')}đ
            </Text>
          </View>
        )}
      </View>

      {/* LOCATION & ADDRESS */}
      {(Boolean(plan?.locationName) || Boolean(plan?.address)) && (
        <View style={[styles.locationBox, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={[styles.locationTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            📍 {plan?.locationName || 'Địa điểm chính'}
          </Text>
          {Boolean(plan?.address) && (
            <Text style={[styles.locationSub, { color: colors.textSecondary }]} numberOfLines={2}>
              {plan?.address}
            </Text>
          )}
        </View>
      )}

      {/* ROUTE TIMELINE SUMMARY */}
      {plan?.stops && plan.stops.length > 0 && (
        <View style={styles.routeSummaryBox}>
          <Text style={[styles.metaLabel, { color: colors.textSecondary, marginBottom: 4 }]}>
            LỘ TRÌNH ĐI CHƠI ({plan.stops.length + 1} ĐIỂM DỪNG)
          </Text>

          <View style={styles.routeStepsContainer}>
            <Text style={[styles.stepChipText, { color: colors.textPrimary }]}>
              {item.notifyAtTime} Xuất phát
            </Text>
            {plan.stops.map((s) => (
              <React.Fragment key={s.id}>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>➔</Text>
                <Text
                  style={[styles.stepChipText, { color: colors.textPrimary, flexShrink: 1 }]}
                  numberOfLines={1}
                >
                  {s.timeHm} {s.title}
                </Text>
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      {/* FOOTER ACTIONS */}
      <View style={styles.cardFooter}>
        <View style={styles.tagsWrapRow}>
          {activityMeta && (
            <View style={[styles.tagBadge, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={{ fontSize: 11, color: colors.textPrimary }}>
                {activityMeta.icon} {activityMeta.label}
              </Text>
            </View>
          )}
          {transportMeta && (
            <View style={[styles.tagBadge, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={{ fontSize: 11, color: colors.textPrimary }}>
                {transportMeta.icon} {transportMeta.label}
              </Text>
            </View>
          )}
        </View>

        <Pressable onPress={() => onDelete(item.id)} hitSlop={10}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.error }}>Xóa kèo</Text>
        </Pressable>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  ticketCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    width: '100%',
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgeWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  passBadgeText: { fontSize: 10, fontWeight: '900', color: '#8B5CF6', letterSpacing: 0.5 },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  ticketTitle: { fontSize: 16, fontWeight: '800', marginTop: 4, lineHeight: 22 },
  mapShortcutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    flexShrink: 0,
  },
  mapShortcutText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  dashedLine: {
    borderWidth: 0.5,
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  metaLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  metaValue: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  locationBox: {
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  locationTitle: { fontSize: 13, fontWeight: '700' },
  locationSub: { fontSize: 11, marginTop: 2, lineHeight: 16 },
  routeSummaryBox: { marginBottom: 10 },
  routeStepsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  stepChipText: { fontSize: 11, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 8,
  },
  tagsWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});