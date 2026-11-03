import { useMemo } from 'react';
import { DateTime } from 'luxon';

export const useRealtimeDayCounter = (startDateIso?: string, userTimezone?: string) => {
  return useMemo(() => {
    if (!startDateIso) return { daysTogether: 0, formattedStartDate: '' };

    const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
    const start = DateTime.fromISO(startDateIso).setZone(tz).startOf('day');
    const today = DateTime.now().setZone(tz).startOf('day');

    const diffDays = Math.floor(today.diff(start, 'days').days) + 1;

    return {
      daysTogether: Math.max(1, diffDays),
      formattedStartDate: start.toFormat('dd/MM/yyyy'),
    };
  }, [startDateIso, userTimezone]);
};