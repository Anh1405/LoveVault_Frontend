// src/components/home/modals/DateTimeField.tsx
// Bản NATIVE (Android / iOS). Trên web, Metro tự dùng DateTimeField.web.tsx.
import React from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
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

export const DateTimeField: React.FC<DateTimeFieldProps> = ({
  visible,
  mode,
  value,
  onChange,
  onClose,
  minimumDate,
  maximumDate,
}) => {
  if (!visible) return null;

  return (
    <DateTimePicker
      value={value}
      mode={mode}
      is24Hour
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      onChange={(event, selected) => {
        onClose();
        if (event.type === 'set' && selected) onChange(selected);
      }}
    />
  );
};
