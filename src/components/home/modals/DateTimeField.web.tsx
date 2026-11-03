// src/components/home/modals/DateTimeField.web.tsx
// Bản WEB: dùng <input type="date|time"> của trình duyệt trong một hộp thoại nhỏ.
// Trên điện thoại, trình duyệt tự hiện bộ chọn ngày/giờ gốc của máy.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { ThemeColors } from '../../../constants/theme';

export interface DateTimeFieldProps {
  visible: boolean;
  mode: 'date' | 'time';
  value: Date;
  onChange: (next: Date) => void;
  onClose: () => void;
  minimumDate?: Date;
  maximumDate?: Date;
  title?: string;
  colors: ThemeColors;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const DateTimeField: React.FC<DateTimeFieldProps> = ({
  visible,
  mode,
  value,
  onChange,
  onClose,
  minimumDate,
  maximumDate,
  title,
  colors,
}) => {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (visible) setDraft(mode === 'date' ? fmtDate(value) : fmtTime(value));
  }, [visible, mode, value]);

  const confirm = () => {
    if (draft) {
      const next = new Date(value.getTime());
      if (mode === 'date') {
        const [y, m, d] = draft.split('-').map(Number);
        // Dựng theo giờ địa phương để không bị lệch ngày do múi giờ UTC
        if (y && m && d) next.setFullYear(y, m - 1, d);
      } else {
        const [h, min] = draft.split(':').map(Number);
        if (!Number.isNaN(h) && !Number.isNaN(min)) next.setHours(h, min, 0, 0);
      }
      onChange(next);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.backdrop,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 340,
            borderRadius: 20,
            padding: 20,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 14 }}>
            {title || (mode === 'date' ? 'Chọn ngày' : 'Chọn giờ')}
          </Text>

          <input
            autoFocus
            type={mode}
            value={draft}
            min={mode === 'date' && minimumDate ? fmtDate(minimumDate) : undefined}
            max={mode === 'date' && maximumDate ? fmtDate(maximumDate) : undefined}
            step={mode === 'time' ? 60 : undefined}
            onChange={(e) => setDraft(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              height: 48,
              padding: '0 14px',
              fontSize: 16,
              fontFamily: 'inherit',
              color: colors.textPrimary,
              backgroundColor: colors.surface,
              border: `1px solid ${colors.outline}`,
              borderRadius: 12,
              colorScheme: 'light dark',
            }}
          />

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
            <Pressable
              onPress={onClose}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: colors.surfaceVariant,
              }}
            >
              <Text style={{ fontWeight: '600', fontSize: 14, color: colors.textSecondary }}>Hủy</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: colors.primary,
              }}
            >
              <Text style={{ fontWeight: '700', fontSize: 14, color: '#FFFFFF' }}>Xong</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
