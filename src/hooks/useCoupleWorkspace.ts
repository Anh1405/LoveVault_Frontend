// src/hooks/useCoupleWorkspace.ts
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Alert, Linking, AppState, AppStateStatus, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { api } from '../services/api';
import { storage } from '../services/storage';
import {
  uploadMediaToCloudAndSaveDb,
  deleteCloudMediaById,
  fetchFullCoupleRoomFromCloud,
  pushCoupleRoomSnapshotToCloud,
  flushPendingRoomSnapshot,
  flushPendingCloudMediaQueue,
} from '../services/cloudMediaService';
import { LocalNotificationService, AiToneStyle } from '../services/notification.service';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';

export type SyncStatus = 'SYNCED' | 'PENDING_SYNC';
export type QuestionCategory = 'ALL' | 'FUNNY' | 'DEEP' | 'FUTURE';

export type DatePlanActivityType =
  | 'EAT_AND_DRINK'
  | 'EAT'
  | 'DRINK'
  | 'MOVIE'
  | 'WALK'
  | 'OTHER';

export type TransportMode =
  | 'PICKUP'
  | 'MOTORBIKE'
  | 'CAR_TAXI'
  | 'BUS_METRO'
  | 'WALK';

export interface DatePlanStop {
  id: string;
  timeHm: string;
  activityType: 'EAT' | 'DRINK' | 'MOVIE' | 'WALK' | 'OTHER';
  title: string;
  address: string;
  googleMapsUrl?: string;
  busRouteNote?: string;
}

export interface DatePlanDetails {
  activityType: DatePlanActivityType;
  transport: TransportMode;
  transportNote?: string;
  startTimeHm: string;
  endTimeHm?: string;
  enableEndTime?: boolean;
  notifyStartTime?: boolean;
  startRemindMinutesBefore?: number;
  notifyEndTime?: boolean;
  endNotificationId?: string | null;
  locationName: string;
  address: string;
  googleMapsUrl?: string;
  estimatedBudget?: number;
  stops?: DatePlanStop[];
  selectedBusItinerary?: BusRouteItinerary | null;
}

export interface ImportantEvent {
  id: string;
  title: string;
  eventDate: string;
  category: 'ANNIVERSARY' | 'BIRTHDAY' | 'DATE_PLAN' | 'CUSTOM';
  notifyDaysBefore: number;
  notifyAtTime: string;
  customMessage: string;
  aiTone?: AiToneStyle;
  autoDailyAi?: boolean;
  lastAiGeneratedDate?: string;
  notificationId?: string | null;
  isAutoBirthday?: boolean;
  ownerUserId?: string;
  datePlan?: DatePlanDetails | null;
  syncStatus: SyncStatus;
}

export interface MomoGoalTransaction {
  id: string;
  type: 'IN' | 'OUT';
  amount: number;
  actorId?: string;
  actor: string;
  note: string;
  createdAt: string;
}

// ============================================================================
// HỆ THỐNG TÌM KIẾM TUYẾN XE BUÝT & METRO TP. HỒ CHÍ MINH
// ============================================================================

export type SaigonTransitVehicleType = 'BUS' | 'METRO' | 'AIRPORT_BUS';

export interface SaigonBusStop {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  keywords: string[];
}

export interface SaigonBusRoute {
  routeNo: string;
  name: string;
  vehicleType: SaigonTransitVehicleType;
  operatingHours: string;
  frequencyMinutes: number;
  ticketPriceVnd: number;
  studentPriceVnd: number;
  stopIds: string[];
  keywords: string[];
}

export interface BusTransitLeg {
  routeNo: string;
  routeName: string;
  vehicleType: SaigonTransitVehicleType;
  boardStop: SaigonBusStop;
  alightStop: SaigonBusStop;
  intermediateStops: SaigonBusStop[];
  stopCount: number;
  estimatedRideMinutes: number;
  fareVnd: number;
  studentFareVnd: number;
}

export interface BusRouteItinerary {
  id: string;
  transferCount: number;
  summaryTitle: string;
  legs: BusTransitLeg[];
  originLabel: string;
  destinationLabel: string;
  walkToStationMeters: number;
  walkFromStationMeters: number;
  totalEstimatedMinutes: number;
  totalFareVnd: number;
  totalStudentFareVnd: number;
  googleMapsTransitUrl: string;
  formattedTransportNote: string;
}

export interface FindSaigonBusParams {
  originQuery?: string;
  originCoords?: { lat: number; lng: number } | null;
  destinationQuery: string;
  destinationMapsUrl?: string;
  destinationCoords?: { lat: number; lng: number } | null;
  maxResults?: number;
}

const SAIGON_BUS_STOPS: Record<string, SaigonBusStop> = {
  BEN_THANH: {
    id: 'BEN_THANH',
    name: 'Chợ Bến Thành',
    address: 'Chợ Bến Thành, TP. Hồ Chí Minh',
    lat: 10.7725,
    lng: 106.698,
    keywords: ['cho ben thanh', 'ben thanh', 'metro ben thanh', 'trung tam'],
  },
  THAO_CAM_VIEN: {
    id: 'THAO_CAM_VIEN',
    name: 'Thảo Cầm Viên Sài Gòn',
    address: '2 Nguyễn Bỉnh Khiêm, TP. Hồ Chí Minh',
    lat: 10.7875,
    lng: 106.7053,
    keywords: ['thao cam vien', 'so thu', 'nguyen binh khiem'],
  },
  DH_KHOA_HOC_XA_HOI_NHAN_VAN: {
    id: 'DH_KHOA_HOC_XA_HOI_NHAN_VAN',
    name: 'Trường Đại học Khoa học Xã hội và Nhân văn - Đại học Quốc gia TP.HCM',
    address: '10-12 Đinh Tiên Hoàng, TP. Hồ Chí Minh',
    lat: 10.7859,
    lng: 106.7027,
    keywords: ['nhan van', 'dinh tien hoang', 'dai hoc khoa hoc xa hoi va nhan van'],
  },
  DH_KHOA_HOC_TU_NHIEN: {
    id: 'DH_KHOA_HOC_TU_NHIEN',
    name: 'Trường Đại học Khoa học Tự nhiên - Đại học Quốc gia TP.HCM',
    address: '227 Nguyễn Văn Cừ, TP. Hồ Chí Minh',
    lat: 10.7626,
    lng: 106.6824,
    keywords: ['khoa hoc tu nhien', 'nguyen van cu', 'dh khtn'],
  },
  BX_CHO_LON: {
    id: 'BX_CHO_LON',
    name: 'Bến Xe Chợ Lớn',
    address: '46 Lê Quang Sung, TP. Hồ Chí Minh',
    lat: 10.7516,
    lng: 106.6518,
    keywords: ['ben xe cho lon', 'cho lon', 'le quang sung'],
  },
  SAN_BAY_TAN_SON_NHAT: {
    id: 'SAN_BAY_TAN_SON_NHAT',
    name: 'Cảng hàng không quốc tế Tân Sơn Nhất',
    address: 'Trường Sơn, TP. Hồ Chí Minh',
    lat: 10.8185,
    lng: 106.6588,
    keywords: ['san bay', 'tan son nhat', 'truong son', 'cang hang khong'],
  },
  BX_MIEN_DONG_CU: {
    id: 'BX_MIEN_DONG_CU',
    name: 'Bến Xe Miền Đông',
    address: '292 Đinh Bộ Lĩnh, TP. Hồ Chí Minh',
    lat: 10.8142,
    lng: 106.7114,
    keywords: ['ben xe mien dong', 'dinh bo linh'],
  },
  BX_AN_SUONG: {
    id: 'BX_AN_SUONG',
    name: 'Bến Xe An Sương',
    address: 'QL22, TP. Hồ Chí Minh',
    lat: 10.8436,
    lng: 106.6133,
    keywords: ['ben xe an suong', 'an suong', 'ql22'],
  },
  SUOI_TIEN: {
    id: 'SUOI_TIEN',
    name: 'Công viên văn hóa Suối Tiên',
    address: '120 Song Hành Xa Lộ Hà Nội, TP. Hồ Chí Minh',
    lat: 10.8661,
    lng: 106.8031,
    keywords: ['suoi tien', 'cong vien van hoa suoi tien', 'xa lo ha noi'],
  },
  DH_QUOC_TE_DHQG: {
    id: 'DH_QUOC_TE_DHQG',
    name: 'Trường Đại học Quốc Tế - Đại học Quốc gia TP.HCM',
    address: 'Khu đô thị Đại học Quốc gia TP.HCM, TP. Hồ Chí Minh',
    lat: 10.8776,
    lng: 106.8016,
    keywords: ['dai hoc quoc gia', 'lang dai hoc', 'dai hoc quoc te', 'dhqg'],
  },
  BX_MIEN_DONG_MOI: {
    id: 'BX_MIEN_DONG_MOI',
    name: 'Bến xe Miền Đông mới',
    address: '501 Hoàng Hữu Nam, TP. Hồ Chí Minh',
    lat: 10.8794,
    lng: 106.8148,
    keywords: ['ben xe mien dong moi', 'hoang huu nam', 'metro mien dong moi'],
  },
};

export const SAIGON_BUS_ROUTES: SaigonBusRoute[] = [
  {
    routeNo: 'Metro số 1',
    name: 'Tuyến Metro số 1: Chợ Bến Thành ⇄ Bến xe Miền Đông mới',
    vehicleType: 'METRO',
    operatingHours: '05:00 - 22:00',
    frequencyMinutes: 8,
    ticketPriceVnd: 15000,
    studentPriceVnd: 10000,
    stopIds: ['BEN_THANH', 'THAO_CAM_VIEN', 'SUOI_TIEN', 'BX_MIEN_DONG_MOI'],
    keywords: ['metro', 'metro so 1', 'ben thanh', 'suoi tien', 'ben xe mien dong moi'],
  },
  {
    routeNo: '01',
    name: 'Tuyến 01: Chợ Bến Thành ⇄ Bến Xe Chợ Lớn',
    vehicleType: 'BUS',
    operatingHours: '05:00 - 20:30',
    frequencyMinutes: 10,
    ticketPriceVnd: 6000,
    studentPriceVnd: 3000,
    stopIds: ['BEN_THANH', 'DH_KHOA_HOC_TU_NHIEN', 'BX_CHO_LON'],
    keywords: ['01', 'tuyen 1', 'ben thanh', 'cho lon'],
  },
  {
    routeNo: '04',
    name: 'Tuyến 04: Chợ Bến Thành ⇄ Cảng hàng không quốc tế Tân Sơn Nhất ⇄ Bến Xe An Sương',
    vehicleType: 'BUS',
    operatingHours: '05:00 - 20:15',
    frequencyMinutes: 12,
    ticketPriceVnd: 7000,
    studentPriceVnd: 3000,
    stopIds: ['BEN_THANH', 'SAN_BAY_TAN_SON_NHAT', 'BX_AN_SUONG'],
    keywords: ['04', 'tuyen 4', 'ben thanh', 'tan son nhat', 'an suong'],
  },
  {
    routeNo: '08',
    name: 'Tuyến 08: Bến Xe Chợ Lớn ⇄ Bến Xe Miền Đông ⇄ Đại học Quốc gia TP.HCM',
    vehicleType: 'BUS',
    operatingHours: '04:40 - 20:30',
    frequencyMinutes: 10,
    ticketPriceVnd: 7000,
    studentPriceVnd: 3000,
    stopIds: [
      'BX_CHO_LON',
      'DH_KHOA_HOC_TU_NHIEN',
      'BX_MIEN_DONG_CU',
      'SUOI_TIEN',
      'DH_QUOC_TE_DHQG',
    ],
    keywords: ['08', 'tuyen 8', 'cho lon', 'mien dong', 'dai hoc quoc gia', 'suoi tien'],
  },
  {
    routeNo: '14',
    name: 'Tuyến 14: Bến Xe Miền Đông ⇄ Chợ Bến Thành ⇄ Bến Xe Chợ Lớn',
    vehicleType: 'BUS',
    operatingHours: '04:30 - 20:30',
    frequencyMinutes: 12,
    ticketPriceVnd: 6000,
    studentPriceVnd: 3000,
    stopIds: ['BX_MIEN_DONG_CU', 'THAO_CAM_VIEN', 'BEN_THANH', 'BX_CHO_LON'],
    keywords: ['14', 'tuyen 14', 'mien dong', 'ben thanh', 'cho lon'],
  },
  {
    routeNo: '19',
    name: 'Tuyến 19: Chợ Bến Thành ⇄ Thảo Cầm Viên Sài Gòn ⇄ Đại học Quốc gia TP.HCM',
    vehicleType: 'BUS',
    operatingHours: '05:00 - 20:15',
    frequencyMinutes: 10,
    ticketPriceVnd: 7000,
    studentPriceVnd: 3000,
    stopIds: [
      'BEN_THANH',
      'DH_KHOA_HOC_XA_HOI_NHAN_VAN',
      'THAO_CAM_VIEN',
      'SUOI_TIEN',
      'DH_QUOC_TE_DHQG',
    ],
    keywords: ['19', 'tuyen 19', 'ben thanh', 'nhan van', 'thao cam vien', 'suoi tien', 'dai hoc quoc gia'],
  },
  {
    routeNo: '33',
    name: 'Tuyến 33: Bến Xe An Sương ⇄ Suối Tiên ⇄ Đại học Quốc gia TP.HCM',
    vehicleType: 'BUS',
    operatingHours: '04:30 - 20:30',
    frequencyMinutes: 10,
    ticketPriceVnd: 7000,
    studentPriceVnd: 3000,
    stopIds: ['BX_AN_SUONG', 'SUOI_TIEN', 'DH_QUOC_TE_DHQG'],
    keywords: ['33', 'tuyen 33', 'an suong', 'suoi tien', 'dai hoc quoc gia'],
  },
  {
    routeNo: '45',
    name: 'Tuyến 45: Trường Đại học Khoa học Tự nhiên ⇄ Chợ Bến Thành ⇄ Bến Xe Miền Đông',
    vehicleType: 'BUS',
    operatingHours: '05:00 - 19:30',
    frequencyMinutes: 15,
    ticketPriceVnd: 6000,
    studentPriceVnd: 3000,
    stopIds: [
      'DH_KHOA_HOC_TU_NHIEN',
      'BEN_THANH',
      'DH_KHOA_HOC_XA_HOI_NHAN_VAN',
      'THAO_CAM_VIEN',
      'BX_MIEN_DONG_CU',
    ],
    keywords: ['45', 'tuyen 45', 'khoa hoc tu nhien', 'ben thanh', 'mien dong'],
  },
  {
    routeNo: '53',
    name: 'Tuyến 53: Trường Đại học Khoa học Tự nhiên ⇄ Chợ Bến Thành ⇄ Đại học Quốc gia TP.HCM',
    vehicleType: 'BUS',
    operatingHours: '05:00 - 19:30',
    frequencyMinutes: 12,
    ticketPriceVnd: 7000,
    studentPriceVnd: 3000,
    stopIds: [
      'DH_KHOA_HOC_TU_NHIEN',
      'BEN_THANH',
      'THAO_CAM_VIEN',
      'SUOI_TIEN',
      'DH_QUOC_TE_DHQG',
    ],
    keywords: ['53', 'tuyen 53', 'khoa hoc tu nhien', 'ben thanh', 'dai hoc quoc gia'],
  },
  {
    routeNo: '56',
    name: 'Tuyến 56: Bến Xe Chợ Lớn ⇄ Chợ Bến Thành ⇄ Bến xe Miền Đông mới',
    vehicleType: 'BUS',
    operatingHours: '05:00 - 20:00',
    frequencyMinutes: 12,
    ticketPriceVnd: 7000,
    studentPriceVnd: 3000,
    stopIds: [
      'BX_CHO_LON',
      'DH_KHOA_HOC_TU_NHIEN',
      'BEN_THANH',
      'THAO_CAM_VIEN',
      'SUOI_TIEN',
      'BX_MIEN_DONG_MOI',
    ],
    keywords: ['56', 'tuyen 56', 'cho lon', 'ben thanh', 'ben xe mien dong moi'],
  },
  {
    routeNo: '93',
    name: 'Tuyến 93: Chợ Bến Thành ⇄ Bến Xe Miền Đông ⇄ Bến xe Miền Đông mới',
    vehicleType: 'BUS',
    operatingHours: '05:00 - 20:00',
    frequencyMinutes: 12,
    ticketPriceVnd: 7000,
    studentPriceVnd: 3000,
    stopIds: [
      'BEN_THANH',
      'DH_KHOA_HOC_XA_HOI_NHAN_VAN',
      'BX_MIEN_DONG_CU',
      'SUOI_TIEN',
      'DH_QUOC_TE_DHQG',
      'BX_MIEN_DONG_MOI',
    ],
    keywords: ['93', 'tuyen 93', 'ben thanh', 'mien dong', 'ben xe mien dong moi'],
  },
  {
    routeNo: '109',
    name: 'Tuyến 109: Cảng hàng không quốc tế Tân Sơn Nhất ⇄ Chợ Bến Thành',
    vehicleType: 'AIRPORT_BUS',
    operatingHours: '05:30 - 22:00',
    frequencyMinutes: 20,
    ticketPriceVnd: 15000,
    studentPriceVnd: 15000,
    stopIds: ['SAN_BAY_TAN_SON_NHAT', 'BEN_THANH'],
    keywords: ['109', 'tuyen 109', 'san bay', 'tan son nhat', 'ben thanh'],
  },
  {
    routeNo: '150',
    name: 'Tuyến 150: Bến Xe Chợ Lớn ⇄ Thảo Cầm Viên Sài Gòn ⇄ Bến xe Miền Đông mới',
    vehicleType: 'BUS',
    operatingHours: '04:30 - 21:00',
    frequencyMinutes: 10,
    ticketPriceVnd: 7000,
    studentPriceVnd: 3000,
    stopIds: [
      'BX_CHO_LON',
      'DH_KHOA_HOC_TU_NHIEN',
      'THAO_CAM_VIEN',
      'SUOI_TIEN',
      'BX_MIEN_DONG_MOI',
    ],
    keywords: ['150', 'tuyen 150', 'cho lon', 'suoi tien', 'ben xe mien dong moi'],
  },
  {
    routeNo: '152',
    name: 'Tuyến 152: Cảng hàng không quốc tế Tân Sơn Nhất ⇄ Chợ Bến Thành',
    vehicleType: 'AIRPORT_BUS',
    operatingHours: '05:15 - 19:00',
    frequencyMinutes: 15,
    ticketPriceVnd: 6000,
    studentPriceVnd: 3000,
    stopIds: ['SAN_BAY_TAN_SON_NHAT', 'BEN_THANH'],
    keywords: ['152', 'tuyen 152', 'san bay', 'tan son nhat', 'ben thanh'],
  },
];

export function normalizeVietnameseText(input?: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeHaversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function extractCoordinatesFromMapsUrl(
  url?: string,
): { lat: number; lng: number } | null {
  if (!url) return null;
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }
  const qMatch = url.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  }
  return null;
}

const geocodeMemoryCache = new Map<string, { lat: number; lng: number }>();

export async function resolveSaigonPlaceCoordinates(
  queryText?: string,
  directMapsUrl?: string,
  fallbackCoords?: { lat: number; lng: number } | null,
): Promise<{
  stop: SaigonBusStop;
  walkingMeters: number;
  resolvedCoords: { lat: number; lng: number };
}> {
  const allStops = Object.values(SAIGON_BUS_STOPS);

  if (fallbackCoords) {
    const nearest = findNearestBusStopByCoords(fallbackCoords.lat, fallbackCoords.lng);
    return {
      stop: nearest.stop,
      walkingMeters: nearest.distanceMeters,
      resolvedCoords: fallbackCoords,
    };
  }

  const urlCoords = extractCoordinatesFromMapsUrl(directMapsUrl);
  if (urlCoords) {
    const nearest = findNearestBusStopByCoords(urlCoords.lat, urlCoords.lng);
    return {
      stop: nearest.stop,
      walkingMeters: nearest.distanceMeters,
      resolvedCoords: urlCoords,
    };
  }

  const normQuery = normalizeVietnameseText(queryText);
  if (!normQuery) {
    const defaultStop = SAIGON_BUS_STOPS.BEN_THANH;
    return {
      stop: defaultStop,
      walkingMeters: 120,
      resolvedCoords: { lat: defaultStop.lat, lng: defaultStop.lng },
    };
  }

  let bestStop: SaigonBusStop | null = null;
  let bestScore = 0;

  for (const stop of allStops) {
    const normStopName = normalizeVietnameseText(stop.name);
    if (normQuery.includes(normStopName) || normStopName.includes(normQuery)) {
      bestStop = stop;
      bestScore = 100;
      break;
    }
    for (const kw of stop.keywords) {
      if (normQuery.includes(kw)) {
        const score = kw.length;
        if (score > bestScore) {
          bestScore = score;
          bestStop = stop;
        }
      }
    }
  }

  if (bestStop && bestScore >= 6) {
    return {
      stop: bestStop,
      walkingMeters: 150,
      resolvedCoords: { lat: bestStop.lat, lng: bestStop.lng },
    };
  }

  const cached = geocodeMemoryCache.get(normQuery);
  if (cached) {
    const nearest = findNearestBusStopByCoords(cached.lat, cached.lng);
    return {
      stop: nearest.stop,
      walkingMeters: nearest.distanceMeters,
      resolvedCoords: cached,
    };
  }

  try {
    const searchQuery = encodeURIComponent(`${queryText?.trim()}, Thành phố Hồ Chí Minh, Việt Nam`);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${searchQuery}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LoveVaultCoupleApp/1.0',
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        const coords = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
        geocodeMemoryCache.set(normQuery, coords);
        const nearest = findNearestBusStopByCoords(coords.lat, coords.lng);
        return {
          stop: nearest.stop,
          walkingMeters: nearest.distanceMeters,
          resolvedCoords: coords,
        };
      }
    }
  } catch {
    // Fallback xuống khớp từ khóa gần đúng nhất nếu offline
  }

  const fallbackStop = bestStop || SAIGON_BUS_STOPS.BEN_THANH;
  return {
    stop: fallbackStop,
    walkingMeters: 300,
    resolvedCoords: { lat: fallbackStop.lat, lng: fallbackStop.lng },
  };
}

export function findNearestBusStopByCoords(
  lat: number,
  lng: number,
): { stop: SaigonBusStop; distanceMeters: number } {
  const allStops = Object.values(SAIGON_BUS_STOPS);
  let nearest = allStops[0];
  let minDistance = Number.MAX_SAFE_INTEGER;

  for (const stop of allStops) {
    const dist = computeHaversineMeters(lat, lng, stop.lat, stop.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = stop;
    }
  }

  return { stop: nearest, distanceMeters: minDistance };
}

export function buildGoogleMapsTransitUrl(
  destinationQuery: string,
  originQuery?: string,
): string {
  const destEncoded = encodeURIComponent(
    destinationQuery.toLowerCase().includes('hồ chí minh')
      ? destinationQuery.trim()
      : `${destinationQuery.trim()}, TP. Hồ Chí Minh`,
  );
  const originParam = originQuery?.trim()
    ? `&origin=${encodeURIComponent(
        originQuery.toLowerCase().includes('hồ chí minh')
          ? originQuery.trim()
          : `${originQuery.trim()}, TP. Hồ Chí Minh`,
      )}`
    : '';
  return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${destEncoded}&travelmode=transit`;
}

function buildLegBetweenStops(
  route: SaigonBusRoute,
  fromStopId: string,
  toStopId: string,
): BusTransitLeg | null {
  const idxA = route.stopIds.indexOf(fromStopId);
  const idxB = route.stopIds.indexOf(toStopId);
  if (idxA === -1 || idxB === -1 || idxA === idxB) return null;

  const orderedIds =
    idxA < idxB
      ? route.stopIds.slice(idxA, idxB + 1)
      : route.stopIds.slice(idxB, idxA + 1).reverse();

  const stops = orderedIds.map((id) => SAIGON_BUS_STOPS[id]).filter(Boolean);
  if (stops.length < 2) return null;

  const stopCount = stops.length - 1;
  const minutesPerHop = route.vehicleType === 'METRO' ? 5 : 9;
  const estimatedRideMinutes = Math.max(8, stopCount * minutesPerHop);

  return {
    routeNo: route.routeNo,
    routeName: route.name,
    vehicleType: route.vehicleType,
    boardStop: stops[0],
    alightStop: stops[stops.length - 1],
    intermediateStops: stops.slice(1, -1),
    stopCount,
    estimatedRideMinutes,
    fareVnd: route.ticketPriceVnd,
    studentFareVnd: route.studentPriceVnd,
  };
}

export async function findSaigonBusItineraries(
  params: FindSaigonBusParams,
): Promise<BusRouteItinerary[]> {
  const {
    originQuery,
    originCoords,
    destinationQuery,
    destinationMapsUrl,
    destinationCoords,
    maxResults = 5,
  } = params;

  const [originResolved, destResolved] = await Promise.all([
    resolveSaigonPlaceCoordinates(
      originQuery || 'Chợ Bến Thành',
      undefined,
      originCoords,
    ),
    resolveSaigonPlaceCoordinates(
      destinationQuery,
      destinationMapsUrl,
      destinationCoords,
    ),
  ]);

  const startStop = originResolved.stop;
  const endStop = destResolved.stop;
  const originLabel = originQuery?.trim() || startStop.name;
  const destinationLabel = destinationQuery.trim() || endStop.name;
  const transitUrl = buildGoogleMapsTransitUrl(destinationLabel, originQuery);

  const itineraries: BusRouteItinerary[] = [];

  if (startStop.id === endStop.id) {
    const passingRoutes = SAIGON_BUS_ROUTES.filter((r) =>
      r.stopIds.includes(startStop.id),
    );
    for (const route of passingRoutes.slice(0, maxResults)) {
      const leg: BusTransitLeg = {
        routeNo: route.routeNo,
        routeName: route.name,
        vehicleType: route.vehicleType,
        boardStop: startStop,
        alightStop: endStop,
        intermediateStops: [],
        stopCount: 1,
        estimatedRideMinutes: 10,
        fareVnd: route.ticketPriceVnd,
        studentFareVnd: route.studentPriceVnd,
      };
      itineraries.push({
        id: `direct_same_${route.routeNo}`,
        transferCount: 0,
        summaryTitle: `Tuyến ${route.routeNo} (Qua khu vực ${endStop.name})`,
        legs: [leg],
        originLabel,
        destinationLabel,
        walkToStationMeters: originResolved.walkingMeters,
        walkFromStationMeters: destResolved.walkingMeters,
        totalEstimatedMinutes: 15,
        totalFareVnd: route.ticketPriceVnd,
        totalStudentFareVnd: route.studentPriceVnd,
        googleMapsTransitUrl: transitUrl,
        formattedTransportNote: `🚌 Tuyến ${route.routeNo} dừng tại ${endStop.name} • ~15 phút • Vé: ${route.ticketPriceVnd.toLocaleString('vi-VN')}đ (SV: ${route.studentPriceVnd.toLocaleString('vi-VN')}đ)`,
      });
    }
    return itineraries;
  }

  const walkMinutes = Math.round(
    (originResolved.walkingMeters + destResolved.walkingMeters) / 80,
  );

  for (const route of SAIGON_BUS_ROUTES) {
    const directLeg = buildLegBetweenStops(route, startStop.id, endStop.id);
    if (!directLeg) continue;

    const totalMinutes = directLeg.estimatedRideMinutes + walkMinutes + 5;
    const badge = route.vehicleType === 'METRO' ? '🚇' : '🚌';

    itineraries.push({
      id: `direct_${route.routeNo}`,
      transferCount: 0,
      summaryTitle: `Đi thẳng ${route.vehicleType === 'METRO' ? '' : 'Tuyến '}${route.routeNo}`,
      legs: [directLeg],
      originLabel,
      destinationLabel,
      walkToStationMeters: originResolved.walkingMeters,
      walkFromStationMeters: destResolved.walkingMeters,
      totalEstimatedMinutes: totalMinutes,
      totalFareVnd: directLeg.fareVnd,
      totalStudentFareVnd: directLeg.studentFareVnd,
      googleMapsTransitUrl: transitUrl,
      formattedTransportNote: `${badge} Đi thẳng ${route.routeNo} (${startStop.name} ➔ ${endStop.name}) • ~${totalMinutes} phút • Vé: ${directLeg.fareVnd.toLocaleString('vi-VN')}đ (SV: ${directLeg.studentFareVnd.toLocaleString('vi-VN')}đ)`,
    });
  }

  const routesFromStart = SAIGON_BUS_ROUTES.filter((r) =>
    r.stopIds.includes(startStop.id),
  );
  const routesToEnd = SAIGON_BUS_ROUTES.filter((r) =>
    r.stopIds.includes(endStop.id),
  );

  for (const r1 of routesFromStart) {
    for (const r2 of routesToEnd) {
      if (r1.routeNo === r2.routeNo) continue;

      if (
        r1.stopIds.includes(endStop.id) ||
        r2.stopIds.includes(startStop.id)
      ) {
        continue;
      }

      const commonStopIds = r1.stopIds.filter(
        (stopId) =>
          stopId !== startStop.id &&
          stopId !== endStop.id &&
          r2.stopIds.includes(stopId),
      );

      for (const transferStopId of commonStopIds) {
        const leg1 = buildLegBetweenStops(r1, startStop.id, transferStopId);
        const leg2 = buildLegBetweenStops(r2, transferStopId, endStop.id);
        if (!leg1 || !leg2) continue;

        const transferStop = SAIGON_BUS_STOPS[transferStopId];
        const totalMinutes =
          leg1.estimatedRideMinutes +
          leg2.estimatedRideMinutes +
          walkMinutes +
          8;
        const totalFare = leg1.fareVnd + leg2.fareVnd;
        const totalStudentFare = leg1.studentFareVnd + leg2.studentFareVnd;

        itineraries.push({
          id: `transfer_${r1.routeNo}_${r2.routeNo}_${transferStopId}`,
          transferCount: 1,
          summaryTitle: `Tuyến ${r1.routeNo} ➔ Chuyển sang ${r2.routeNo} tại ${transferStop.name}`,
          legs: [leg1, leg2],
          originLabel,
          destinationLabel,
          walkToStationMeters: originResolved.walkingMeters,
          walkFromStationMeters: destResolved.walkingMeters,
          totalEstimatedMinutes: totalMinutes,
          totalFareVnd: totalFare,
          totalStudentFareVnd: totalStudentFare,
          googleMapsTransitUrl: transitUrl,
          formattedTransportNote: `🚌 Tuyến ${r1.routeNo} (${startStop.name} ➔ ${transferStop.name}) ➔ Đổi sang ${r2.routeNo} tới ${endStop.name} • ~${totalMinutes} phút • Tổng vé: ${totalFare.toLocaleString('vi-VN')}đ`,
        });
      }
    }
  }

  return itineraries
    .sort((a, b) => {
      if (a.transferCount !== b.transferCount) {
        return a.transferCount - b.transferCount;
      }
      return a.totalEstimatedMinutes - b.totalEstimatedMinutes;
    })
    .slice(0, maxResults);
}

export function searchSaigonBusRoutesByKeyword(
  keyword: string,
): SaigonBusRoute[] {
  const norm = normalizeVietnameseText(keyword);
  if (!norm) return SAIGON_BUS_ROUTES;

  return SAIGON_BUS_ROUTES.filter((route) => {
    if (normalizeVietnameseText(route.routeNo).includes(norm)) return true;
    if (normalizeVietnameseText(route.name).includes(norm)) return true;
    if (route.keywords.some((k) => k.includes(norm))) return true;
    return route.stopIds.some((stopId) => {
      const stop = SAIGON_BUS_STOPS[stopId];
      return (
        stop &&
        (normalizeVietnameseText(stop.name).includes(norm) ||
          stop.keywords.some((k) => k.includes(norm)))
      );
    });
  });
}

export async function openAddressInGoogleMaps(
  addressOrPlace?: string,
  directMapsUrl?: string,
  transportMode?: TransportMode,
  originAddress?: string,
): Promise<void> {
  const isTransitMode = transportMode === 'BUS_METRO';
  const cleanDirect = directMapsUrl?.trim();

  if (
    !isTransitMode &&
    cleanDirect &&
    (cleanDirect.startsWith('http://') || cleanDirect.startsWith('https://'))
  ) {
    try {
      await Linking.openURL(cleanDirect);
      return;
    } catch {
      // Fallback sang tìm kiếm theo địa chỉ bên dưới
    }
  }

  const rawQuery = addressOrPlace?.trim();
  if (!rawQuery && !cleanDirect) {
    Alert.alert(
      'Chưa có địa chỉ',
      'Vui lòng nhập tên quán, địa chỉ hoặc dán link Google Maps để mở bản đồ chỉ đường.',
    );
    return;
  }

  const normalizedDest =
    rawQuery && !rawQuery.toLowerCase().includes('hồ chí minh')
      ? `${rawQuery}, TP. Hồ Chí Minh`
      : rawQuery || '';

  const encodedDest = encodeURIComponent(normalizedDest);
  const encodedOrigin = originAddress?.trim()
    ? encodeURIComponent(
        originAddress.toLowerCase().includes('hồ chí minh')
          ? originAddress.trim()
          : `${originAddress.trim()}, TP. Hồ Chí Minh`,
      )
    : '';

  let nativeScheme: string | undefined;
  let webUrl: string;

  if (isTransitMode) {
    const saddrParam = encodedOrigin ? `saddr=${encodedOrigin}&` : '';
    nativeScheme = Platform.select({
      ios: `comgooglemaps://?${saddrParam}daddr=${encodedDest}&directionsmode=transit`,
      android: undefined,
    });
    webUrl = buildGoogleMapsTransitUrl(normalizedDest, originAddress);
  } else {
    nativeScheme = Platform.select({
      ios: `comgooglemaps://?q=${encodedDest}`,
      android: `geo:0,0?q=${encodedDest}`,
    });
    webUrl = `https://www.google.com/maps/search/?api=1&query=${encodedDest}`;
  }

  try {
    if (nativeScheme) {
      const canOpenNative = await Linking.canOpenURL(nativeScheme);
      if (canOpenNative) {
        await Linking.openURL(nativeScheme);
        return;
      }
    }
    await Linking.openURL(webUrl);
  } catch {
    Alert.alert('Không thể mở bản đồ', 'Vui lòng kiểm tra lại kết nối hoặc địa chỉ.');
  }
}

export async function openBusDirectionsInGoogleMaps(
  destinationAddress: string,
  originAddress?: string,
): Promise<void> {
  return openAddressInGoogleMaps(
    destinationAddress,
    undefined,
    'BUS_METRO',
    originAddress,
  );
}

export function parseMomoTransactionText(rawText: string): {
  type: 'IN' | 'OUT';
  amount: number;
  rawSummary: string;
} | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const normalized = rawText.trim();

  const regex = /([+-]|nhận|nạp|cộng|chuyển|trừ|rút|thanh toán)?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,9})\s*(đ|d|vnd|vnđ)/i;
  const match = normalized.match(regex);
  if (!match) return null;

  const prefix = (match[1] || '').toLowerCase();
  const digitsOnly = match[2].replace(/[.,]/g, '');
  const amount = Number(digitsOnly);

  if (!Number.isFinite(amount) || amount < 1000) return null;

  const isOutgoing =
    prefix === '-' ||
    prefix.includes('chuyển') ||
    prefix.includes('trừ') ||
    prefix.includes('rút') ||
    prefix.includes('thanh toán');

  return {
    type: isOutgoing ? 'OUT' : 'IN',
    amount,
    rawSummary: normalized.slice(0, 80),
  };
}

export interface CoupleGoalItem {
  id: string;
  title: string;
  targetDate: string;
  isCompleted: boolean;
  isMomoLinked?: boolean;
  currentAmount: number;
  targetAmount: number;
  unitLabel: string;
  notifyTime: string;
  customNotifyMessage: string;
  momoTransactions?: MomoGoalTransaction[];
  notificationId?: string | null;
  syncStatus: SyncStatus;
}

export interface CoupleMediaItem {
  id: string;
  uri: string;
  remoteUrl?: string | null;
  thumbnailUri?: string | null;
  mediaType: 'VIDEO' | 'IMAGE';
  caption: string;
  durationSec?: number;
  uploaderId?: string;
  createdAt: string;
  syncStatus: SyncStatus;
}

export interface LocketSnapItem {
  id: string;
  uri: string;
  remoteUrl?: string | null;
  ownerId?: string;
  senderId?: string;
  senderName: string;
  isMine: boolean;
  stampBadge: string;
  caption: string;
  createdAtTime: string;
  reactions: any[];
}

export interface DailyQAAnswerEntry {
  userId: string;
  nickname: string;
  answer: string;
  answeredAt: string;
}

export interface DailyQAItem {
  questionId: string;
  category: Exclude<QuestionCategory, 'ALL'>;
  questionText: string;
  myAnswer: string;
  partnerAnswer: string | null;
  answeredAt: string | null;
  answersByUserId?: Record<string, DailyQAAnswerEntry>;
}

const QUESTION_BANK: Array<{
  id: string;
  category: Exclude<QuestionCategory, 'ALL'>;
  text: string;
  mockPartnerReply: string;
}> = [
  {
    id: 'q_fun_1',
    category: 'FUNNY',
    text: 'Nếu hai đứa bị lạc trên đảo hoang, ai sẽ là người tìm ra đồ ăn trước, ai sẽ ngồi khóc?',
    mockPartnerReply: 'Chắc chắn anh đi tìm đồ ăn còn em ngồi chỉ đạo từ xa rồi!',
  },
  {
    id: 'q_fun_2',
    category: 'FUNNY',
    text: 'Thói quen kỳ quặc nào của đối phương mà bạn thấy vừa buồn cười vừa đáng yêu?',
    mockPartnerReply: 'Mỗi lần đói bụng là mặt xịu xuống nhưng hỏi ăn gì cũng kêu "gì cũng được".',
  },
  {
    id: 'q_fun_3',
    category: 'FUNNY',
    text: 'Ấn tượng đầu tiên lúc mới gặp của bạn về đối phương sai lệch thế nào so với hiện tại?',
    mockPartnerReply: 'Lúc đầu tưởng lạnh lùng ít nói, quen rồi mới biết là cây hài.',
  },
  {
    id: 'q_fun_4',
    category: 'FUNNY',
    text: 'Nếu được đổi cơ thể cho nhau trong 24 giờ, việc đầu tiên bạn làm sẽ là gì?',
    mockPartnerReply: 'Tự chụp 100 tấm hình dìm hàng làm kỷ niệm.',
  },
  {
    id: 'q_deep_1',
    category: 'DEEP',
    text: 'Khoảnh khắc nào trong thời gian qua khiến bạn thấy bình yên nhất khi ở cạnh nhau?',
    mockPartnerReply: 'Những buổi tối chở nhau đi dạo vòng quanh thành phố nghe nhạc.',
  },
  {
    id: 'q_deep_2',
    category: 'DEEP',
    text: 'Khi bạn buồn hoặc áp lực, đối phương làm điều gì sẽ giúp bạn thấy nhẹ lòng nhất?',
    mockPartnerReply: 'Chỉ cần ôm một cái thật chặt và mua cho một ly trà sữa.',
  },
  {
    id: 'q_deep_3',
    category: 'DEEP',
    text: 'Điều gì ở đối phương khiến bạn tự hào nhất khi kể với bạn bè?',
    mockPartnerReply: 'Sự tử tế, luôn kiên nhẫn lắng nghe và nhớ từng sở thích nhỏ nhặt.',
  },
  {
    id: 'q_fut_1',
    category: 'FUTURE',
    text: 'Địa điểm du lịch nào mà hai đứa nhất định phải cùng nhau đặt chân tới trong năm tới?',
    mockPartnerReply: 'Một chuyến săn mây hoặc ngắm hoàng hôn biển cùng nhau.',
  },
  {
    id: 'q_fut_2',
    category: 'FUTURE',
    text: 'Ngôi nhà mơ ước trong tương lai của hai đứa sẽ có góc nhỏ nào đặc biệt nhất?',
    mockPartnerReply: 'Một căn bếp ấm cúng và ban công trồng nhiều cây xanh để uống trà tối.',
  },
];

const buildWorkspaceKeys = (coupleId?: string | null, userId?: string | null) => {
  const roomScope = coupleId || (userId ? `single_${userId}` : 'guest');
  return {
    EVENTS: `lovevault_events_v3_${roomScope}`,
    GOALS: `lovevault_goals_v3_${roomScope}`,
    MEDIA: `lovevault_media_v3_${roomScope}`,
    LOCKET: `lovevault_locket_snaps_v3_${roomScope}`,
    DAILY_QA: `lovevault_daily_qa_v4_${roomScope}`,
    QA_HISTORY: `lovevault_qa_history_v4_${roomScope}`,
  };
};

export function computeDaysUntilNextOccurrence(isoDate: string, recurringYearly = true): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return 9999;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let target = new Date(recurringYearly ? now.getFullYear() : y, m - 1, d).getTime();
  if (recurringYearly && target < todayMidnight) {
    target = new Date(now.getFullYear() + 1, m - 1, d).getTime();
  }
  return Math.max(0, Math.round((target - todayMidnight) / 86400000));
}

export function useCoupleWorkspace() {
  const { user, coupleId } = useAuthStore();
  const currentUserId = user?.id || 'local_me';
  const { myProfile, partnerProfile, socialPrefs, notificationPrefs } = useSettingsStore();

  const workspaceKeys = useMemo(
    () => buildWorkspaceKeys(coupleId, currentUserId),
    [coupleId, currentUserId],
  );

  const [events, setEvents] = useState<ImportantEvent[]>([]);
  const [goals, setGoals] = useState<CoupleGoalItem[]>([]);
  const [mediaList, setMediaList] = useState<CoupleMediaItem[]>([]);
  const [locketSnaps, setLocketSnaps] = useState<LocketSnapItem[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const [busSearchLoading, setBusSearchLoading] = useState(false);
  const [busSearchResults, setBusSearchResults] = useState<BusRouteItinerary[]>([]);
  const [matchedBusRoutes, setMatchedBusRoutes] = useState<SaigonBusRoute[]>(SAIGON_BUS_ROUTES);
  const [selectedBusItinerary, setSelectedBusItinerary] = useState<BusRouteItinerary | null>(null);

  const isRefreshingDailyAiRef = useRef(false);
  const eventsRef = useRef<ImportantEvent[]>([]);
  eventsRef.current = events;

  const goalsRef = useRef<CoupleGoalItem[]>([]);
  goalsRef.current = goals;

  const recentAiBodiesRef = useRef<Map<string, string[]>>(new Map());

  const [qaFilter, setQaFilter] = useState<QuestionCategory>('ALL');
  const [qaHistory, setQaHistory] = useState<DailyQAItem[]>([]);
  const [rawDailyQA, setRawDailyQA] = useState<DailyQAItem>({
    questionId: QUESTION_BANK[0].id,
    category: QUESTION_BANK[0].category,
    questionText: QUESTION_BANK[0].text,
    myAnswer: '',
    partnerAnswer: QUESTION_BANK[0].mockPartnerReply,
    answeredAt: null,
    answersByUserId: {},
  });

  const rawDailyQARef = useRef<DailyQAItem>(rawDailyQA);
  rawDailyQARef.current = rawDailyQA;

  const qaHistoryRef = useRef<DailyQAItem[]>(qaHistory);
  qaHistoryRef.current = qaHistory;

  /**
   * Đẩy toàn bộ trạng thái hiện tại của phòng lên PostgreSQL để đảm bảo an toàn tuyệt đối
   */
  const syncRoomSnapshotToCloud = useCallback(
    async (overrides?: {
      events?: ImportantEvent[];
      goals?: CoupleGoalItem[];
      dailyQA?: DailyQAItem;
      qaHistory?: DailyQAItem[];
    }) => {
      if (!coupleId) return;
      await pushCoupleRoomSnapshotToCloud({
        coupleId,
        events: overrides?.events ?? eventsRef.current,
        goals: overrides?.goals ?? goalsRef.current,
        dailyQA: overrides?.dailyQA ?? rawDailyQARef.current,
        qaHistory: overrides?.qaHistory ?? qaHistoryRef.current,
      });
    },
    [coupleId],
  );

  const mapQAItemForCurrentUser = useCallback(
    (item: DailyQAItem): DailyQAItem => {
      const map = item.answersByUserId || {};
      const myEntry = map[currentUserId];
      const partnerEntry = Object.values(map).find((entry) => entry.userId !== currentUserId);

      if (Object.keys(map).length > 0) {
        const fallbackMock =
          QUESTION_BANK.find((q) => q.id === item.questionId)?.mockPartnerReply || null;
        return {
          ...item,
          myAnswer: myEntry?.answer || '',
          partnerAnswer: partnerEntry?.answer || fallbackMock,
          answeredAt: myEntry?.answeredAt || null,
        };
      }
      return item;
    },
    [currentUserId],
  );

  const dailyQA = useMemo(
    () => mapQAItemForCurrentUser(rawDailyQA),
    [rawDailyQA, mapQAItemForCurrentUser],
  );

  const mappedQaHistory = useMemo(
    () => qaHistory.map((h) => mapQAItemForCurrentUser(h)),
    [qaHistory, mapQAItemForCurrentUser],
  );

  const mappedLocketSnaps = useMemo(
    () =>
      locketSnaps.map((snap) => {
        const isCurrentUsersSnap = snap.senderId
          ? String(snap.senderId) === String(currentUserId)
          : snap.senderName === myProfile.nickname;
        return {
          ...snap,
          ownerId:
            snap.ownerId || snap.senderId || (isCurrentUsersSnap ? String(currentUserId) : ''),
          isMine: isCurrentUsersSnap,
          senderName: isCurrentUsersSnap
            ? myProfile.nickname
            : snap.senderName && snap.senderName !== myProfile.nickname
              ? snap.senderName
              : partnerProfile.nickname,
        };
      }),
    [locketSnaps, currentUserId, myProfile.nickname, partnerProfile.nickname],
  );

  const findBusRoutesToDestination = useCallback(
    async (params: FindSaigonBusParams): Promise<BusRouteItinerary[]> => {
      if (!params.destinationQuery?.trim() && !params.destinationMapsUrl?.trim()) {
        Alert.alert(
          'Thiếu địa điểm đến',
          'Vui lòng nhập tên địa điểm hoặc địa chỉ cần tới để tìm tuyến xe buýt phù hợp.',
        );
        return [];
      }

      setBusSearchLoading(true);
      try {
        const itineraries = await findSaigonBusItineraries(params);
        setBusSearchResults(itineraries);
        setSelectedBusItinerary(itineraries[0] || null);
        void Haptics.selectionAsync().catch(() => null);
        return itineraries;
      } finally {
        setBusSearchLoading(false);
      }
    },
    [],
  );

  const searchBusCatalog = useCallback((keyword: string): SaigonBusRoute[] => {
    const matches = searchSaigonBusRoutesByKeyword(keyword);
    setMatchedBusRoutes(matches);
    return matches;
  }, []);

  const buildDatePlanWithBusItinerary = useCallback(
    (
      basePlan: DatePlanDetails,
      itinerary: BusRouteItinerary,
    ): DatePlanDetails => {
      return {
        ...basePlan,
        transport: 'BUS_METRO',
        transportNote: itinerary.formattedTransportNote,
        googleMapsUrl: basePlan.googleMapsUrl || itinerary.googleMapsTransitUrl,
        selectedBusItinerary: itinerary,
      };
    },
    [],
  );

  const applyBusItineraryToEvent = useCallback(
    async (eventId: string, itinerary: BusRouteItinerary) => {
      setSelectedBusItinerary(itinerary);
      setEvents((prev) => {
        const next = prev.map((ev) => {
          if (ev.id !== eventId || !ev.datePlan) return ev;
          return {
            ...ev,
            datePlan: {
              ...ev.datePlan,
              transport: 'BUS_METRO' as TransportMode,
              transportNote: itinerary.formattedTransportNote,
              googleMapsUrl:
                ev.datePlan.googleMapsUrl || itinerary.googleMapsTransitUrl,
              selectedBusItinerary: itinerary,
            },
            syncStatus: 'PENDING_SYNC' as SyncStatus,
          };
        });
        storage.setItem(workspaceKeys.EVENTS, JSON.stringify(next)).catch(() => null);
        void syncRoomSnapshotToCloud({ events: next });
        return next;
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [workspaceKeys.EVENTS, syncRoomSnapshotToCloud],
  );

  const normalizeAiBody = useCallback((raw: string) => {
    let s = raw.toLowerCase();
    s = s.replace(
      /[\u{1F300}-\u{1F9FF}]|[\u2600-\u27BF]|[\uFE00-\uFE0F]|\u200D/gu,
      '',
    );
    s = s.replace(
      /[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi,
      ' ',
    );
    return s.replace(/\s+/g, ' ').trim();
  }, []);

  const isNearDuplicateAi = useCallback(
    (eventId: string, candidate: string, previous?: string) => {
      const norm = normalizeAiBody(candidate);
      if (!norm || norm.length < 8) return true;
      if (previous && normalizeAiBody(previous) === norm) return true;
      const history = recentAiBodiesRef.current?.get(eventId) || [];
      return history.some((h) => h === norm);
    },
    [normalizeAiBody],
  );

  const rememberAiBody = useCallback(
    (eventId: string, body: string) => {
      const norm = normalizeAiBody(body);
      if (!norm) return;
      if (!recentAiBodiesRef.current) {
        recentAiBodiesRef.current = new Map();
      }
      const prev = recentAiBodiesRef.current.get(eventId) || [];
      const next = [norm, ...prev.filter((h) => h !== norm)].slice(0, 5);
      recentAiBodiesRef.current.set(eventId, next);
    },
    [normalizeAiBody],
  );

  const generateUniqueAiReminder = useCallback(
    async (params: {
      eventId: string;
      title: string;
      category: 'BIRTHDAY' | 'ANNIVERSARY';
      daysUntilEvent: number;
      partnerName: string;
      tone?: AiToneStyle;
      previousMessage?: string;
    }) => {
      const baseTone = params.tone || (params.category === 'BIRTHDAY' ? 'GIFT_HINT' : 'FUNNY');
      const altTone: AiToneStyle = baseTone === 'FUNNY' ? 'GIFT_HINT' : 'FUNNY';

      let message = await LocalNotificationService.generateAiFunnyReminder({
        title: params.title,
        category: params.category,
        daysUntilEvent: params.daysUntilEvent,
        partnerName: params.partnerName,
        tone: baseTone,
      });

      if (isNearDuplicateAi(params.eventId, message, params.previousMessage)) {
        const altDays = Math.max(
          0,
          params.daysUntilEvent + (params.daysUntilEvent % 2 === 0 ? 1 : -1),
        );
        message = await LocalNotificationService.generateAiFunnyReminder({
          title: params.title,
          category: params.category,
          daysUntilEvent: altDays,
          partnerName: params.partnerName,
          tone: altTone,
        });
      }

      if (isNearDuplicateAi(params.eventId, message, params.previousMessage)) {
        const suffixPool = [
          ' Nhớ chuẩn bị sớm nhé.',
          ' Đừng để trôi mất ngày này.',
          ' Một chút bất ngờ sẽ rất đáng.',
        ];
        const pick = suffixPool[Math.floor(Math.random() * suffixPool.length)];
        if (!message.includes(pick.trim())) {
          message = `${message.trim()} ${pick}`.trim();
        }
      }

      rememberAiBody(params.eventId, message);
      return message;
    },
    [isNearDuplicateAi, rememberAiBody],
  );

  /**
   * Kéo toàn bộ dữ liệu phòng từ Cloud + PostgreSQL về thiết bị (khi mới cài lại app hoặc vào lại room)
   */
  const pullAndMergeCloudWorkspace = useCallback(
    async (
      localEvents: ImportantEvent[],
      localGoals: CoupleGoalItem[],
      localDailyQA: DailyQAItem | null,
      localQaHistory: DailyQAItem[],
    ) => {
      if (!coupleId) return;

      await flushPendingRoomSnapshot(coupleId).catch(() => null);
      const cloudSnapshot = await fetchFullCoupleRoomFromCloud(coupleId);
      if (!cloudSnapshot) return;

      // 1. Hợp nhất Events (Giữ lại các mục PENDING_SYNC ở local chưa lên server + toàn bộ mục trên Cloud)
      if (Array.isArray(cloudSnapshot.events) && cloudSnapshot.events.length > 0) {
        const cloudEventIds = new Set(cloudSnapshot.events.map((e) => e.id));
        const unsyncedLocalEvents = localEvents.filter(
          (loc) => loc.syncStatus === 'PENDING_SYNC' && !cloudEventIds.has(loc.id),
        );
        const mergedEvents: ImportantEvent[] = [
          ...cloudSnapshot.events.map((e) => ({
            ...e,
            syncStatus: 'SYNCED' as SyncStatus,
          })),
          ...unsyncedLocalEvents,
        ];
        setEvents(mergedEvents);
        await storage.setItem(workspaceKeys.EVENTS, JSON.stringify(mergedEvents));
      } else if (localEvents.length > 0) {
        // Nếu trên Cloud chưa có mà máy hiện tại đang có thì đẩy lên Cloud luôn
        void pushCoupleRoomSnapshotToCloud({
          coupleId,
          events: localEvents,
          goals: localGoals,
          dailyQA: localDailyQA || rawDailyQARef.current,
          qaHistory: localQaHistory,
        });
      }

      // 2. Hợp nhất Goals & giao dịch MoMo
      if (Array.isArray(cloudSnapshot.goals) && cloudSnapshot.goals.length > 0) {
        const cloudGoalIds = new Set(cloudSnapshot.goals.map((g) => g.id));
        const unsyncedLocalGoals = localGoals.filter(
          (loc) => loc.syncStatus === 'PENDING_SYNC' && !cloudGoalIds.has(loc.id),
        );
        const mergedGoals: CoupleGoalItem[] = [
          ...cloudSnapshot.goals.map((g) => ({
            ...g,
            syncStatus: 'SYNCED' as SyncStatus,
          })),
          ...unsyncedLocalGoals,
        ];
        setGoals(mergedGoals);
        await storage.setItem(workspaceKeys.GOALS, JSON.stringify(mergedGoals));
      }

      // 3. Hợp nhất Daily QA hiện tại
      if (cloudSnapshot.dailyQA && cloudSnapshot.dailyQA.questionId) {
        const mergedAnswersMap: Record<string, DailyQAAnswerEntry> = {
          ...(localDailyQA?.answersByUserId || {}),
          ...(cloudSnapshot.dailyQA.answersByUserId || {}),
        };
        const mergedDailyQA: DailyQAItem = {
          ...cloudSnapshot.dailyQA,
          answersByUserId: mergedAnswersMap,
        };
        setRawDailyQA(mergedDailyQA);
        await storage.setItem(workspaceKeys.DAILY_QA, JSON.stringify(mergedDailyQA));
      }

      // 4. Hợp nhất Lịch sử Hỏi Đáp (QA History)
      if (Array.isArray(cloudSnapshot.qaHistory) && cloudSnapshot.qaHistory.length > 0) {
        const byQuestionId = new Map<string, DailyQAItem>();
        for (const item of localQaHistory) {
          byQuestionId.set(item.questionId, item);
        }
        for (const cloudItem of cloudSnapshot.qaHistory) {
          const existing = byQuestionId.get(cloudItem.questionId);
          byQuestionId.set(cloudItem.questionId, {
            ...existing,
            ...cloudItem,
            answersByUserId: {
              ...(existing?.answersByUserId || {}),
              ...(cloudItem.answersByUserId || {}),
            },
          });
        }
        const mergedHistory = Array.from(byQuestionId.values());
        setQaHistory(mergedHistory);
        await storage.setItem(workspaceKeys.QA_HISTORY, JSON.stringify(mergedHistory));
      }
    },
    [coupleId, workspaceKeys],
  );

  // Khởi tạo dữ liệu từ bộ nhớ máy trước (Offline-first), sau đó tự động tải từ Cloud Database về
  useEffect(() => {
    let mounted = true;
    setIsLoaded(false);

    const loadWorkspace = async () => {
      const [rawEvents, rawGoals, rawMedia, rawLocket, rawQA, rawHistory] = await Promise.all([
        storage.getItem(workspaceKeys.EVENTS),
        storage.getItem(workspaceKeys.GOALS),
        storage.getItem(workspaceKeys.MEDIA),
        storage.getItem(workspaceKeys.LOCKET),
        storage.getItem(workspaceKeys.DAILY_QA),
        storage.getItem(workspaceKeys.QA_HISTORY),
      ]);
      if (!mounted) return;

      const parsedEvents: ImportantEvent[] = rawEvents ? JSON.parse(rawEvents) : [];
      const parsedGoals: CoupleGoalItem[] = rawGoals ? JSON.parse(rawGoals) : [];
      const parsedMedia: CoupleMediaItem[] = rawMedia ? JSON.parse(rawMedia) : [];
      const parsedLocket: LocketSnapItem[] = rawLocket ? JSON.parse(rawLocket) : [];
      const parsedQA: DailyQAItem | null = rawQA ? JSON.parse(rawQA) : null;
      const parsedHistory: DailyQAItem[] = rawHistory ? JSON.parse(rawHistory) : [];

      setEvents(parsedEvents);
      if (!recentAiBodiesRef.current) {
        recentAiBodiesRef.current = new Map();
      }
      parsedEvents.forEach((ev) => {
        if (ev.customMessage && ev.category !== 'DATE_PLAN') {
          const norm = normalizeAiBody(ev.customMessage);
          if (norm) {
            recentAiBodiesRef.current.set(ev.id, [norm]);
          }
        }
      });

      setGoals(parsedGoals);
      setMediaList(parsedMedia);
      setLocketSnaps(parsedLocket);
      if (parsedQA) setRawDailyQA(parsedQA);
      setQaHistory(parsedHistory);
      setIsLoaded(true);

      // Khi vào đúng room (coupleId), tự động kéo toàn bộ dữ liệu từ PostgreSQL về khôi phục
      if (coupleId) {
        await pullAndMergeCloudWorkspace(
          parsedEvents,
          parsedGoals,
          parsedQA,
          parsedHistory,
        );
      }
    };

    void loadWorkspace();
    return () => {
      mounted = false;
    };
  }, [workspaceKeys, coupleId, normalizeAiBody, pullAndMergeCloudWorkspace]);

  useEffect(() => {
    if (!isLoaded) return;

    setEvents((prev) => {
      let changed = false;
      const nextList = [...prev];

      const myBdayEventId = `auto_bday_${currentUserId}`;
      if (myProfile.birthDate) {
        const idx = nextList.findIndex((e) => e.id === myBdayEventId);
        if (idx === -1) {
          changed = true;
          nextList.push({
            id: myBdayEventId,
            ownerUserId: currentUserId,
            title: `Sinh nhật của ${myProfile.nickname}`,
            eventDate: myProfile.birthDate,
            category: 'BIRTHDAY',
            notifyDaysBefore: 1,
            notifyAtTime: '08:00',
            customMessage: `Đang cập nhật lời nhắc cho sinh nhật ${myProfile.nickname}...`,
            aiTone: 'FUNNY',
            autoDailyAi: true,
            lastAiGeneratedDate: '',
            isAutoBirthday: true,
            syncStatus: 'SYNCED',
          });
        } else if (
          nextList[idx].eventDate !== myProfile.birthDate ||
          nextList[idx].title !== `Sinh nhật của ${myProfile.nickname}`
        ) {
          changed = true;
          nextList[idx] = {
            ...nextList[idx],
            title: `Sinh nhật của ${myProfile.nickname}`,
            eventDate: myProfile.birthDate,
            lastAiGeneratedDate: '',
          };
        }
      }

      const partnerKey = partnerProfile.userId || `partner_of_${currentUserId}`;
      const partnerBdayEventId = `auto_bday_${partnerKey}`;
      if (partnerProfile.birthDate) {
        const idx = nextList.findIndex((e) => e.id === partnerBdayEventId);
        if (idx === -1) {
          changed = true;
          nextList.push({
            id: partnerBdayEventId,
            ownerUserId: partnerKey,
            title: `Sinh nhật của ${partnerProfile.nickname}`,
            eventDate: partnerProfile.birthDate,
            category: 'BIRTHDAY',
            notifyDaysBefore: 3,
            notifyAtTime: '08:30',
            customMessage: `Đang cập nhật lời nhắc cho sinh nhật ${partnerProfile.nickname}...`,
            aiTone: 'GIFT_HINT',
            autoDailyAi: true,
            lastAiGeneratedDate: '',
            isAutoBirthday: true,
            syncStatus: 'SYNCED',
          });
        } else if (
          nextList[idx].eventDate !== partnerProfile.birthDate ||
          nextList[idx].title !== `Sinh nhật của ${partnerProfile.nickname}`
        ) {
          changed = true;
          nextList[idx] = {
            ...nextList[idx],
            title: `Sinh nhật của ${partnerProfile.nickname}`,
            eventDate: partnerProfile.birthDate,
            lastAiGeneratedDate: '',
          };
        }
      }

      if (changed) {
        storage.setItem(workspaceKeys.EVENTS, JSON.stringify(nextList)).catch(() => null);
        return nextList;
      }
      return prev;
    });
  }, [
    isLoaded,
    currentUserId,
    myProfile.birthDate,
    myProfile.nickname,
    partnerProfile.userId,
    partnerProfile.birthDate,
    partnerProfile.nickname,
    workspaceKeys.EVENTS,
  ]);

  const runDailyAutoAiRefresh = useCallback(async () => {
    if (!isLoaded || !notificationPrefs.enableAiFunnyTone || isRefreshingDailyAiRef.current) {
      return;
    }

    const todayIso = new Date().toISOString().split('T')[0];
    const snapshot = eventsRef.current;
    const staleEvents = snapshot.filter(
      (ev) =>
        ev.category !== 'DATE_PLAN' &&
        ev.autoDailyAi !== false &&
        ev.lastAiGeneratedDate !== todayIso,
    );

    if (staleEvents.length === 0) return;

    isRefreshingDailyAiRef.current = true;
    try {
      const updatedMap = new Map<string, { msg: string; notifId: string | null }>();

      for (const ev of staleEvents) {
        const daysLeft = computeDaysUntilNextOccurrence(ev.eventDate);
        const freshAiMessage = await generateUniqueAiReminder({
          eventId: ev.id,
          title: ev.title,
          category: ev.category === 'BIRTHDAY' ? 'BIRTHDAY' : 'ANNIVERSARY',
          daysUntilEvent: daysLeft,
          partnerName: partnerProfile.nickname,
          tone: ev.aiTone || (ev.category === 'BIRTHDAY' ? 'GIFT_HINT' : 'FUNNY'),
          previousMessage: ev.customMessage,
        });

        await LocalNotificationService.cancelReminder(ev.id).catch(() => null);

        const notifId = await LocalNotificationService.scheduleCustomReminder({
          sourceId: ev.id,
          category: ev.category === 'BIRTHDAY' ? 'BIRTHDAY' : 'ANNIVERSARY',
          title: `${ev.category === 'BIRTHDAY' ? '🎂 Sinh nhật' : '💍 Kỷ niệm'}: ${ev.title}`,
          body: freshAiMessage,
          eventDateIso: ev.eventDate,
          daysBefore: ev.notifyDaysBefore,
          timeHm: ev.notifyAtTime,
        });

        updatedMap.set(ev.id, { msg: freshAiMessage, notifId });
      }

      if (updatedMap.size > 0) {
        setEvents((prev) => {
          const next = prev.map((item) => {
            const refreshed = updatedMap.get(item.id);
            if (!refreshed) return item;
            return {
              ...item,
              customMessage: refreshed.msg,
              notificationId: refreshed.notifId,
              lastAiGeneratedDate: todayIso,
            };
          });
          storage.setItem(workspaceKeys.EVENTS, JSON.stringify(next)).catch(() => null);
          return next;
        });
      }
    } finally {
      isRefreshingDailyAiRef.current = false;
    }
  }, [
    isLoaded,
    notificationPrefs.enableAiFunnyTone,
    partnerProfile.nickname,
    generateUniqueAiReminder,
    workspaceKeys.EVENTS,
  ]);

  useEffect(() => {
    if (!isLoaded) return;
    void runDailyAutoAiRefresh();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void runDailyAutoAiRefresh();
      }
    });

    return () => sub.remove();
  }, [isLoaded, runDailyAutoAiRefresh]);

  const captureCoupleLocket = useCallback(
    async (source: 'CAMERA' | 'GALLERY', stampBadge: string, captionText: string) => {
      if (source === 'CAMERA') {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (!camPerm.granted) {
          Alert.alert(
            'Cần quyền truy cập Máy ảnh',
            'Hãy cấp quyền Máy ảnh trong Cài đặt để chụp khoảnh khắc Locket gửi cho người yêu.',
            [
              { text: 'Đóng', style: 'cancel' },
              { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
            ],
          );
          return false;
        }
      } else {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!libPerm.granted) {
          Alert.alert(
            'Cần quyền Thư viện ảnh',
            'Hãy cấp quyền Thư viện ảnh trong Cài đặt để chia sẻ ảnh Locket.',
            [
              { text: 'Đóng', style: 'cancel' },
              { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
            ],
          );
          return false;
        }
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: socialPrefs.hdMediaUpload ? 0.92 : 0.7,
      };

      const result =
        source === 'CAMERA'
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (result.canceled || !result.assets?.[0]) return false;

      const localUri = result.assets[0].uri;
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} • ${now.toISOString().split('T')[0]}`;
      const finalStamp = stampBadge || '💕 Đang nhớ đằng ấy';
      const finalCaption = captionText.trim() || 'Gửi một chút đáng yêu ngay lúc này!';
      const tempId = `locket_${Date.now()}`;

      const newSnap: LocketSnapItem = {
        id: tempId,
        uri: localUri,
        remoteUrl: null,
        ownerId: currentUserId,
        senderId: currentUserId,
        senderName: myProfile.nickname,
        isMine: true,
        stampBadge: finalStamp,
        caption: finalCaption,
        createdAtTime: timeStr,
        reactions: ['❤️'],
      };

      setLocketSnaps((prev) => {
        const next = [newSnap, ...prev];
        storage.setItem(workspaceKeys.LOCKET, JSON.stringify(next)).catch(() => null);
        return next;
      });

      // Đẩy ảnh nhị phân lên S3/Cloudflare R2 + lưu vào PostgreSQL để cài lại app không mất ảnh
      uploadMediaToCloudAndSaveDb({
        localUri,
        category: 'LOCKET_SNAP',
        mediaType: 'IMAGE',
        stamp: finalStamp,
        caption: finalCaption,
        idempotencyKey: tempId,
      })
        .then((savedCloud) => {
          setLocketSnaps((prev) => {
            const next = prev.map((s) =>
              s.id === tempId
                ? {
                    ...s,
                    id: savedCloud.id,
                    uri: savedCloud.remoteUrl,
                    remoteUrl: savedCloud.remoteUrl,
                  }
                : s,
            );
            storage.setItem(workspaceKeys.LOCKET, JSON.stringify(next)).catch(() => null);
            return next;
          });
        })
        .catch(() => null);

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    },
    [currentUserId, myProfile.nickname, socialPrefs.hdMediaUpload, workspaceKeys.LOCKET],
  );

  const recordGoalMomoTransaction = useCallback(
    async (
      goalId: string,
      txType: 'IN' | 'OUT',
      rawAmount: number,
      noteText?: string,
    ) => {
      const amount = Math.max(0, Math.round(rawAmount));
      if (amount <= 0) return;

      const now = new Date();
      const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} • ${now.toISOString().split('T')[0]}`;

      const newTx: MomoGoalTransaction = {
        id: `tx_${Date.now()}`,
        type: txType,
        amount,
        actorId: currentUserId,
        actor: myProfile.nickname,
        note: noteText?.trim() || (txType === 'IN' ? 'Chuyển vào quỹ MoMo' : 'Rút chi tiêu từ quỹ'),
        createdAt: timeLabel,
      };

      setGoals((prev) => {
        const next = prev.map((g) => {
          if (g.id !== goalId) return g;

          const updatedCurrent =
            txType === 'IN'
              ? g.currentAmount + amount
              : Math.max(0, g.currentAmount - amount);

          const reachedTarget = g.targetAmount > 0 && updatedCurrent >= g.targetAmount;
          if (reachedTarget && !g.isCompleted) {
            void LocalNotificationService.cancelReminder(g.id);
          }

          return {
            ...g,
            currentAmount: updatedCurrent,
            isCompleted: reachedTarget,
            momoTransactions: [newTx, ...(g.momoTransactions || []).slice(0, 29)],
          };
        });

        storage.setItem(workspaceKeys.GOALS, JSON.stringify(next)).catch(() => null);
        void syncRoomSnapshotToCloud({ goals: next });
        return next;
      });

      api
        .post(`/api/v1/couples/goals/${goalId}/momo-transactions`, newTx)
        .catch(() => null);

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [currentUserId, myProfile.nickname, workspaceKeys.GOALS, syncRoomSnapshotToCloud],
  );

  const restoreWorkspaceBackup = useCallback(
    async (backupPayload: {
      events?: ImportantEvent[];
      goals?: CoupleGoalItem[];
      locketSnaps?: LocketSnapItem[];
      mediaList?: CoupleMediaItem[];
      dailyQA?: DailyQAItem;
      qaHistory?: DailyQAItem[];
    }) => {
      if (Array.isArray(backupPayload.events)) {
        setEvents(backupPayload.events);
        await storage.setItem(workspaceKeys.EVENTS, JSON.stringify(backupPayload.events));
      }
      if (Array.isArray(backupPayload.goals)) {
        setGoals(backupPayload.goals);
        await storage.setItem(workspaceKeys.GOALS, JSON.stringify(backupPayload.goals));
      }
      if (Array.isArray(backupPayload.locketSnaps)) {
        setLocketSnaps(backupPayload.locketSnaps);
        await storage.setItem(workspaceKeys.LOCKET, JSON.stringify(backupPayload.locketSnaps));
      }
      if (Array.isArray(backupPayload.mediaList)) {
        setMediaList(backupPayload.mediaList);
        await storage.setItem(workspaceKeys.MEDIA, JSON.stringify(backupPayload.mediaList));
      }
      if (backupPayload.dailyQA) {
        setRawDailyQA(backupPayload.dailyQA);
        await storage.setItem(workspaceKeys.DAILY_QA, JSON.stringify(backupPayload.dailyQA));
      }
      if (Array.isArray(backupPayload.qaHistory)) {
        setQaHistory(backupPayload.qaHistory);
        await storage.setItem(workspaceKeys.QA_HISTORY, JSON.stringify(backupPayload.qaHistory));
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [workspaceKeys],
  );

  const saveCapturedLocketUri = useCallback(
    async (uri: string, stampBadge: string, captionText: string) => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} • ${now.toISOString().split('T')[0]}`;
      const tempId = `locket_${Date.now()}`;
      const finalStamp = stampBadge || '💕 Đang nhớ đằng ấy';
      const finalCaption = captionText.trim() || 'Khoảnh khắc vừa chụp';

      const newSnap: LocketSnapItem = {
        id: tempId,
        uri,
        remoteUrl: null,
        ownerId: currentUserId,
        senderId: currentUserId,
        senderName: myProfile.nickname,
        isMine: true,
        stampBadge: finalStamp,
        caption: finalCaption,
        createdAtTime: timeStr,
        reactions: ['❤️'],
      };

      setLocketSnaps((prev) => {
        const next = [newSnap, ...prev];
        storage.setItem(workspaceKeys.LOCKET, JSON.stringify(next)).catch(() => null);
        return next;
      });

      uploadMediaToCloudAndSaveDb({
        localUri: uri,
        category: 'LOCKET_SNAP',
        mediaType: 'IMAGE',
        stamp: finalStamp,
        caption: finalCaption,
        idempotencyKey: tempId,
      })
        .then((savedCloud) => {
          setLocketSnaps((prev) => {
            const next = prev.map((s) =>
              s.id === tempId
                ? {
                    ...s,
                    id: savedCloud.id,
                    uri: savedCloud.remoteUrl,
                    remoteUrl: savedCloud.remoteUrl,
                  }
                : s,
            );
            storage.setItem(workspaceKeys.LOCKET, JSON.stringify(next)).catch(() => null);
            return next;
          });
        })
        .catch(() => null);

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [currentUserId, myProfile.nickname, workspaceKeys.LOCKET],
  );

  const forceTestGeminiOnEvent = useCallback(
    async (eventItem: ImportantEvent) => {
      const daysLeft = computeDaysUntilNextOccurrence(eventItem.eventDate);
      const startMs = Date.now();

      const freshMessage = await generateUniqueAiReminder({
        eventId: eventItem.id,
        title: eventItem.title,
        category: eventItem.category === 'BIRTHDAY' ? 'BIRTHDAY' : 'ANNIVERSARY',
        daysUntilEvent: daysLeft,
        partnerName: partnerProfile.nickname,
        tone: eventItem.aiTone || 'FUNNY',
        previousMessage: eventItem.customMessage,
      });

      const elapsedMs = Date.now() - startMs;
      const todayIso = new Date().toISOString().split('T')[0];

      setEvents((prev) => {
        const next = prev.map((ev) =>
          ev.id === eventItem.id
            ? { ...ev, customMessage: freshMessage, lastAiGeneratedDate: todayIso }
            : ev,
        );
        storage.setItem(workspaceKeys.EVENTS, JSON.stringify(next)).catch(() => null);
        void syncRoomSnapshotToCloud({ events: next });
        return next;
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return { freshMessage, elapsedMs };
    },
    [partnerProfile.nickname, generateUniqueAiReminder, workspaceKeys.EVENTS, syncRoomSnapshotToCloud],
  );

  const reactToLocketSnap = useCallback(
    async (snapId: string, emoji: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setLocketSnaps((prev) => {
        const next = prev.map((snap) =>
          snap.id === snapId
            ? { ...snap, reactions: [...snap.reactions.slice(-7), emoji] }
            : snap,
        );
        storage.setItem(workspaceKeys.LOCKET, JSON.stringify(next)).catch(() => null);
        return next;
      });
    },
    [workspaceKeys.LOCKET],
  );

  const deleteLocketSnap = useCallback(
    async (snapId: string) => {
      setLocketSnaps((prev) => {
        const next = prev.filter((s) => s.id !== snapId);
        storage.setItem(workspaceKeys.LOCKET, JSON.stringify(next)).catch(() => null);
        return next;
      });
      deleteCloudMediaById(snapId).catch(() => null);
    },
    [workspaceKeys.LOCKET],
  );

  const rollRandomQuestion = useCallback(
    async (categoryOverride?: QuestionCategory) => {
      void Haptics.selectionAsync().catch(() => {});
      const targetCat = categoryOverride || qaFilter;
      if (categoryOverride) setQaFilter(categoryOverride);

      const pool =
        targetCat === 'ALL'
          ? QUESTION_BANK
          : QUESTION_BANK.filter((q) => q.category === targetCat);

      const candidates = pool.filter((q) => q.id !== rawDailyQA.questionId);
      const finalPool = candidates.length > 0 ? candidates : pool;
      const picked = finalPool[Math.floor(Math.random() * finalPool.length)];

      const existingAnswered = qaHistory.find((h) => h.questionId === picked.id);

      const nextQA: DailyQAItem = existingAnswered || {
        questionId: picked.id,
        category: picked.category,
        questionText: picked.text,
        myAnswer: '',
        partnerAnswer: picked.mockPartnerReply,
        answeredAt: null,
        answersByUserId: {},
      };

      setRawDailyQA(nextQA);
      await storage.setItem(workspaceKeys.DAILY_QA, JSON.stringify(nextQA));
      void syncRoomSnapshotToCloud({ dailyQA: nextQA });
    },
    [qaFilter, rawDailyQA.questionId, qaHistory, workspaceKeys.DAILY_QA, syncRoomSnapshotToCloud],
  );

  const submitDailyAnswer = useCallback(
    async (answerText: string) => {
      const trimmed = answerText.trim();
      if (!trimmed) return;
      const todayIso = new Date().toISOString().split('T')[0];

      const updatedAnswersMap: Record<string, DailyQAAnswerEntry> = {
        ...(rawDailyQA.answersByUserId || {}),
        [currentUserId]: {
          userId: currentUserId,
          nickname: myProfile.nickname,
          answer: trimmed,
          answeredAt: todayIso,
        },
      };

      const updated: DailyQAItem = {
        ...rawDailyQA,
        myAnswer: trimmed,
        answeredAt: todayIso,
        answersByUserId: updatedAnswersMap,
      };

      setRawDailyQA(updated);
      await storage.setItem(workspaceKeys.DAILY_QA, JSON.stringify(updated));

      let nextHistorySnapshot: DailyQAItem[] = [];
      setQaHistory((prev) => {
        const filtered = prev.filter((item) => item.questionId !== updated.questionId);
        nextHistorySnapshot = [updated, ...filtered];
        storage.setItem(workspaceKeys.QA_HISTORY, JSON.stringify(nextHistorySnapshot)).catch(() => null);
        return nextHistorySnapshot;
      });

      api
        .post('/api/v1/daily-answers', {
          questionId: rawDailyQA.questionId,
          questionText: rawDailyQA.questionText,
          category: rawDailyQA.category,
          userId: currentUserId,
          nickname: myProfile.nickname,
          answer: trimmed,
        })
        .catch(() => null);

      void syncRoomSnapshotToCloud({
        dailyQA: updated,
        qaHistory: nextHistorySnapshot,
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [
      rawDailyQA,
      currentUserId,
      myProfile.nickname,
      workspaceKeys.DAILY_QA,
      workspaceKeys.QA_HISTORY,
      syncRoomSnapshotToCloud,
    ],
  );

  const saveEvent = useCallback(
    async (
      payload: Omit<ImportantEvent, 'id' | 'notificationId' | 'syncStatus'>,
      editingId?: string,
    ) => {
      const targetId = editingId || `evt_${Date.now()}`;
      const todayIso = new Date().toISOString().split('T')[0];

      let finalMessage = payload.customMessage.trim();
      if (payload.category !== 'DATE_PLAN' && (!finalMessage || payload.autoDailyAi !== false)) {
        const daysLeft = computeDaysUntilNextOccurrence(payload.eventDate);
        finalMessage = await generateUniqueAiReminder({
          eventId: targetId,
          title: payload.title,
          category: payload.category === 'BIRTHDAY' ? 'BIRTHDAY' : 'ANNIVERSARY',
          daysUntilEvent: daysLeft,
          partnerName: partnerProfile.nickname,
          tone: payload.aiTone || 'FUNNY',
          previousMessage: payload.customMessage,
        });
      }

      await LocalNotificationService.cancelReminder(targetId).catch(() => null);

      let notifId: string | null = null;
      let updatedDatePlan: DatePlanDetails | null = payload.datePlan || null;

      if (payload.category === 'DATE_PLAN' && payload.datePlan) {
        let dp = payload.datePlan;

        if (
          dp.transport === 'BUS_METRO' &&
          !dp.transportNote?.trim() &&
          (dp.address?.trim() || dp.locationName?.trim())
        ) {
          try {
            const autoRoutes = await findSaigonBusItineraries({
              destinationQuery: dp.address?.trim() || dp.locationName.trim(),
              destinationMapsUrl: dp.googleMapsUrl,
              maxResults: 1,
            });
            if (autoRoutes.length > 0) {
              dp = {
                ...dp,
                transportNote: autoRoutes[0].formattedTransportNote,
                googleMapsUrl: dp.googleMapsUrl || autoRoutes[0].googleMapsTransitUrl,
                selectedBusItinerary: autoRoutes[0],
              };
            }
          } catch {
            // Bỏ qua nếu không tìm được tự động
          }
        }

        const hasEndTime = dp.enableEndTime !== false && Boolean(dp.endTimeHm);

        const scheduledIds = await LocalNotificationService.scheduleDatePlanReminders({
          sourceId: targetId,
          title: payload.title,
          dateIso: payload.eventDate,
          startTimeHm: dp.startTimeHm || payload.notifyAtTime,
          endTimeHm: hasEndTime ? dp.endTimeHm : undefined,
          notifyStartTime: dp.notifyStartTime ?? true,
          startRemindMinutesBefore:
            typeof dp.startRemindMinutesBefore === 'number' ? dp.startRemindMinutesBefore : 30,
          notifyEndTime: hasEndTime ? Boolean(dp.notifyEndTime) : false,
          partnerNickname: partnerProfile.nickname,
          locationName: dp.locationName,
        });

        notifId = scheduledIds.startNotificationId;
        updatedDatePlan = {
          ...dp,
          endTimeHm: hasEndTime ? dp.endTimeHm : undefined,
          enableEndTime: hasEndTime,
          notifyEndTime: hasEndTime ? Boolean(dp.notifyEndTime) : false,
          endNotificationId: scheduledIds.endNotificationId,
        };
      } else {
        const notifTitlePrefix =
          payload.category === 'BIRTHDAY' ? '🎂 Sinh nhật' : '💍 Kỷ niệm';

        notifId = await LocalNotificationService.scheduleCustomReminder({
          sourceId: targetId,
          category: payload.category === 'BIRTHDAY' ? 'BIRTHDAY' : 'ANNIVERSARY',
          title: `${notifTitlePrefix}: ${payload.title}`,
          body: finalMessage || `Hẹn lúc ${payload.notifyAtTime} ngày ${payload.eventDate}`,
          eventDateIso: payload.eventDate,
          daysBefore: payload.notifyDaysBefore,
          timeHm: payload.notifyAtTime,
        });
      }

      let syncStatus: SyncStatus = 'PENDING_SYNC';
      try {
        if (editingId) {
          await api.patch(`/api/v1/milestones/${editingId}`, {
            ...payload,
            datePlan: updatedDatePlan,
            customMessage: finalMessage,
            idempotencyKey: targetId,
          });
        } else {
          await api.post('/api/v1/milestones', {
            ...payload,
            datePlan: updatedDatePlan,
            customMessage: finalMessage,
            idempotencyKey: targetId,
          });
        }
        syncStatus = 'SYNCED';
      } catch {
        syncStatus = 'PENDING_SYNC';
      }

      const record: ImportantEvent = {
        ...payload,
        id: targetId,
        datePlan: updatedDatePlan,
        customMessage: finalMessage,
        autoDailyAi: payload.category === 'DATE_PLAN' ? false : (payload.autoDailyAi ?? true),
        lastAiGeneratedDate: todayIso,
        notificationId: notifId,
        syncStatus,
      };

      setEvents((prev) => {
        const next = editingId
          ? prev.map((item) => (item.id === editingId ? record : item))
          : [record, ...prev];
        storage.setItem(workspaceKeys.EVENTS, JSON.stringify(next)).catch(() => null);
        void syncRoomSnapshotToCloud({ events: next });
        return next;
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [partnerProfile.nickname, generateUniqueAiReminder, workspaceKeys.EVENTS, syncRoomSnapshotToCloud],
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      await LocalNotificationService.cancelReminder(eventId);
      setEvents((prev) => {
        const next = prev.filter((item) => item.id !== eventId);
        storage.setItem(workspaceKeys.EVENTS, JSON.stringify(next)).catch(() => null);
        void syncRoomSnapshotToCloud({ events: next });
        return next;
      });
      try {
        await api.delete(`/api/v1/milestones/${eventId}`);
      } catch {
        // Đã cập nhật vào snapshot chờ đồng bộ
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [workspaceKeys.EVENTS, syncRoomSnapshotToCloud],
  );

  const saveGoal = useCallback(
    async (
      payload: Omit<CoupleGoalItem, 'id' | 'isCompleted' | 'notificationId' | 'syncStatus'>,
      editingId?: string,
    ) => {
      const targetId = editingId || `goal_${Date.now()}`;
      const isAlreadyDone = payload.targetAmount > 0 && payload.currentAmount >= payload.targetAmount;

      const notifId = isAlreadyDone
        ? null
        : await LocalNotificationService.scheduleCustomReminder({
            sourceId: targetId,
            category: 'GOAL',
            title: `🎯 Mục tiêu cặp đôi: ${payload.title}`,
            body: payload.customNotifyMessage,
            eventDateIso: payload.targetDate,
            daysBefore: 0,
            timeHm: payload.notifyTime,
          });

      let syncStatus: SyncStatus = 'PENDING_SYNC';
      try {
        if (editingId) {
          await api.patch(`/api/v1/couples/goals/${editingId}`, {
            ...payload,
            isCompleted: isAlreadyDone,
            idempotencyKey: targetId,
          });
        } else {
          await api.post('/api/v1/couples/goals', {
            ...payload,
            isCompleted: isAlreadyDone,
            idempotencyKey: targetId,
          });
        }
        syncStatus = 'SYNCED';
      } catch {
        syncStatus = 'PENDING_SYNC';
      }

      const record: CoupleGoalItem = {
        ...payload,
        id: targetId,
        isCompleted: isAlreadyDone,
        notificationId: notifId,
        syncStatus,
      };

      setGoals((prev) => {
        const next = editingId
          ? prev.map((g) => (g.id === editingId ? record : g))
          : [record, ...prev];
        storage.setItem(workspaceKeys.GOALS, JSON.stringify(next)).catch(() => null);
        void syncRoomSnapshotToCloud({ goals: next });
        return next;
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [workspaceKeys.GOALS, syncRoomSnapshotToCloud],
  );

  const toggleGoalCompletion = useCallback(
    async (goalId: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let updatedGoalRecord: CoupleGoalItem | null = null;

      setGoals((prev) => {
        const next = prev.map((g) => {
          if (g.id !== goalId) return g;
          const nextCompleted = !g.isCompleted;
          if (nextCompleted) {
            void LocalNotificationService.cancelReminder(g.id);
          } else {
            void LocalNotificationService.scheduleCustomReminder({
              sourceId: g.id,
              category: 'GOAL',
              title: `🎯 Mục tiêu cặp đôi: ${g.title}`,
              body: g.customNotifyMessage,
              eventDateIso: g.targetDate,
              daysBefore: 0,
              timeHm: g.notifyTime,
            });
          }
          updatedGoalRecord = {
            ...g,
            isCompleted: nextCompleted,
            currentAmount: nextCompleted ? g.targetAmount : g.currentAmount,
          };
          return updatedGoalRecord;
        });
        storage.setItem(workspaceKeys.GOALS, JSON.stringify(next)).catch(() => null);
        void syncRoomSnapshotToCloud({ goals: next });
        return next;
      });

      if (updatedGoalRecord) {
        api
          .patch(`/api/v1/couples/goals/${goalId}`, updatedGoalRecord)
          .catch(() => null);
      }
    },
    [workspaceKeys.GOALS, syncRoomSnapshotToCloud],
  );

  const deleteGoal = useCallback(
    async (goalId: string) => {
      await LocalNotificationService.cancelReminder(goalId);
      setGoals((prev) => {
        const next = prev.filter((g) => g.id !== goalId);
        storage.setItem(workspaceKeys.GOALS, JSON.stringify(next)).catch(() => null);
        void syncRoomSnapshotToCloud({ goals: next });
        return next;
      });
      try {
        await api.delete(`/api/v1/couples/goals/${goalId}`);
      } catch {
        // Đã cập nhật vào snapshot của phòng
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [workspaceKeys.GOALS, syncRoomSnapshotToCloud],
  );

  const pickAndSaveMedia = useCallback(
  async (type: 'VIDEO' | 'IMAGE') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Quyền truy cập bị từ chối',
        'Hãy cấp quyền Thư viện ảnh/video trong Cài đặt để lưu giữ kỷ niệm chung.',
        [
          { text: 'Đóng', style: 'cancel' },
          { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'VIDEO' ? ['videos'] : ['images'],
      allowsEditing: false,
      quality: socialPrefs.hdMediaUpload ? 0.92 : 0.75,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingMedia(true);

    try {
      const todayIso = new Date().toISOString().split('T')[0];
      const itemId = `media_${Date.now()}`;
      const captionText = `${type === 'VIDEO' ? 'Thước phim' : 'Bức ảnh'} ngày ${todayIso}`;
      
      // Trích xuất durationSec từ asset.duration (mili-giây -> giây)
      const durationSec = asset.duration ? Math.round(asset.duration / 1000) : 0;
      
      let remoteUrl: string | null = null;
      let finalId = itemId;
      let syncStatus: SyncStatus = 'PENDING_SYNC';

      // Tải luồng nhị phân lên Cloud và lưu DB (cloudMediaService tự xử lý thumbnail đệ quy)
      try {
        const cloudRecord = await uploadMediaToCloudAndSaveDb({
          localUri: asset.uri,
          category: 'ALBUM_MEDIA',
          mediaType: type,
          caption: captionText,
          durationSec,
          idempotencyKey: itemId,
        });
        remoteUrl = cloudRecord.remoteUrl;
        finalId = cloudRecord.id || itemId;
        syncStatus = 'SYNCED';
      } catch {
        syncStatus = 'PENDING_SYNC';
      }

      const newMedia: CoupleMediaItem = {
        id: finalId,
        uri: remoteUrl || asset.uri,
        remoteUrl,
        thumbnailUri: null,
        mediaType: type,
        caption: captionText,
        durationSec,
        uploaderId: currentUserId,
        createdAt: todayIso,
        syncStatus,
      };

      setMediaList((prev) => {
        const next = [newMedia, ...prev];
        storage.setItem(workspaceKeys.MEDIA, JSON.stringify(next)).catch(() => null);
        return next;
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setUploadingMedia(false);
    }
  },
  [currentUserId, socialPrefs.hdMediaUpload, workspaceKeys.MEDIA],
);

  const deleteMedia = useCallback(
    async (mediaId: string) => {
      setMediaList((prev) => {
        const next = prev.filter((m) => m.id !== mediaId);
        storage.setItem(workspaceKeys.MEDIA, JSON.stringify(next)).catch(() => null);
        return next;
      });
      deleteCloudMediaById(mediaId).catch(() => null);
    },
    [workspaceKeys.MEDIA],
  );

  const retryPendingSync = useCallback(async () => {
    setSyncingQueue(true);
    try {
      await runDailyAutoAiRefresh();
      await flushPendingCloudMediaQueue().catch(() => null);

      const updatedEvents = await Promise.all(
        events.map(async (ev) => {
          if (ev.syncStatus === 'SYNCED') return ev;
          try {
            await api.post('/api/v1/milestones', { ...ev, idempotencyKey: ev.id });
            return { ...ev, syncStatus: 'SYNCED' as SyncStatus };
          } catch {
            return ev;
          }
        }),
      );

      const updatedGoals = await Promise.all(
        goals.map(async (g) => {
          if (g.syncStatus === 'SYNCED') return g;
          try {
            await api.post('/api/v1/couples/goals', { ...g, idempotencyKey: g.id });
            return { ...g, syncStatus: 'SYNCED' as SyncStatus };
          } catch {
            return g;
          }
        }),
      );

      setEvents(updatedEvents);
      setGoals(updatedGoals);
      await Promise.all([
        storage.setItem(workspaceKeys.EVENTS, JSON.stringify(updatedEvents)),
        storage.setItem(workspaceKeys.GOALS, JSON.stringify(updatedGoals)),
      ]);

      if (coupleId) {
        await pullAndMergeCloudWorkspace(
          updatedEvents,
          updatedGoals,
          rawDailyQARef.current,
          qaHistoryRef.current,
        );
      }
    } finally {
      setSyncingQueue(false);
    }
  }, [
    events,
    goals,
    coupleId,
    runDailyAutoAiRefresh,
    workspaceKeys.EVENTS,
    workspaceKeys.GOALS,
    pullAndMergeCloudWorkspace,
  ]);

  const sortedEvents = useMemo(() => {
    return [...events].sort(
      (a, b) =>
        computeDaysUntilNextOccurrence(
          a.eventDate,
          a.category !== 'DATE_PLAN',
        ) -
        computeDaysUntilNextOccurrence(
          b.eventDate,
          b.category !== 'DATE_PLAN',
        ),
    );
  }, [events]);

  return {
    events: sortedEvents,
    nearestEvent: sortedEvents[0] || null,
    goals,
    mediaList,
    locketSnaps: mappedLocketSnaps,
    uploadingMedia,
    dailyQA,
    qaFilter,
    qaHistory: mappedQaHistory,
    syncingQueue,
    busSearchLoading,
    busSearchResults,
    matchedBusRoutes,
    selectedBusItinerary,
    setSelectedBusItinerary,
    findBusRoutesToDestination,
    searchBusCatalog,
    buildDatePlanWithBusItinerary,
    applyBusItineraryToEvent,
    openBusDirectionsInGoogleMaps,
    saveEvent,
    deleteEvent,
    saveGoal,
    toggleGoalCompletion,
    deleteGoal,
    pickAndSaveMedia,
    deleteMedia,
    captureCoupleLocket,
    reactToLocketSnap,
    deleteLocketSnap,
    submitDailyAnswer,
    rollRandomQuestion,
    retryPendingSync,
    saveCapturedLocketUri,
    forceTestGeminiOnEvent,
    recordGoalMomoTransaction,
    restoreWorkspaceBackup,
  };
}