// src/components/home/LocketIcons.tsx
// Bộ icon vẽ riêng cho trang Locket của LoveVault.
// Cần react-native-svg: npx expo install react-native-svg
import React, { memo } from 'react';
import Svg, { G, Path } from 'react-native-svg';

export type FlashMode = 'off' | 'auto' | 'on';

interface IconProps {
  size?: number;
  color?: string;
}

const STROKE = 1.8;

// Trái tim chuẩn dùng chung, vẽ trong khung 24x24 (rộng 3..21, cao 4.2..20.5).
const HEART =
  'M12 20.5C5 15.6 3 12.2 3 8.8C3 6.2 5 4.2 7.6 4.2C9.4 4.2 11 5.1 12 6.7C13 5.1 14.6 4.2 16.4 4.2C19 4.2 21 6.2 21 8.8C21 12.2 19 15.6 12 20.5Z';

const BOLT = 'M13.2 2.8L5.6 13.2H11L10.2 21.2L18.4 10.6H13L13.2 2.8Z';

export const HeartIcon = memo(function HeartIcon({ size = 24, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={HEART} fill={color} />
    </Svg>
  );
});

interface FlashIconProps extends IconProps {
  mode: FlashMode;
  activeColor?: string;
}

// off: tia sét gạch chéo. auto: tia sét lệch trái kèm chữ A. on: tia sét tô đặc.
export const FlashIcon = memo(function FlashIcon({
  mode,
  size = 24,
  color = '#FFFFFF',
  activeColor = '#FFD66B',
}: FlashIconProps) {
  const lineProps = {
    stroke: color,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  if (mode === 'on') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d={BOLT}
          fill={activeColor}
          stroke={activeColor}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (mode === 'auto') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <G transform="translate(-2 0)">
          <Path d={BOLT} {...lineProps} />
        </G>
        <Path d="M15.6 21.2L18 15.4L20.4 21.2M16.5 19.3H19.5" {...lineProps} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={BOLT} {...lineProps} />
      <Path d="M3.5 3.5L20.5 20.5" {...lineProps} />
    </Svg>
  );
});

// Hai cung tròn có đầu mũi tên, tim nhỏ nằm giữa.
export const FlipIcon = memo(function FlipIcon({ size = 26, color = '#1F1A1C' }: IconProps) {
  const lineProps = {
    stroke: color,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.12 10.61A8 8 0 0 1 19.52 9.26" {...lineProps} />
      <Path d="M20.7 5.4L19.5 9.3L16.2 7.1" {...lineProps} />
      <Path d="M19.88 13.39A8 8 0 0 1 4.48 14.74" {...lineProps} />
      <Path d="M3.3 18.6L4.5 14.7L7.8 16.9" {...lineProps} />
      <G transform="translate(7.74 7.61) scale(0.355)">
        <Path d={HEART} fill={color} />
      </G>
    </Svg>
  );
});

// Khung ảnh bo tròn, đồi núi bên trong, tim thay cho mặt trời.
export const GalleryIcon = memo(function GalleryIcon({ size = 26, color = '#1F1A1C' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8 4H16C18.2 4 20 5.8 20 8V16C20 18.2 18.2 20 16 20H8C5.8 20 4 18.2 4 16V8C4 5.8 5.8 4 8 4Z"
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
      />
      <Path
        d="M4.4 16.4L9 11.8L12.8 15.4L15.4 12.8L19.6 17"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <G transform="translate(12.88 4.99) scale(0.26)">
        <Path d={HEART} fill={color} />
      </G>
    </Svg>
  );
});

export const SendIcon = memo(function SendIcon({ size = 26, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 3L14.5 21L10.5 13.5L3 9.5L21 3Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M21 3L10.5 13.5" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
});

export const CloseIcon = memo(function CloseIcon({ size = 24, color = '#1F1A1C' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 6L18 18M18 6L6 18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
});

export const PencilIcon = memo(function PencilIcon({ size = 16, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 20L4.8 16.2L16.4 4.6C17.2 3.8 18.4 3.8 19.2 4.6L19.4 4.8C20.2 5.6 20.2 6.8 19.4 7.6L7.8 19.2L4 20Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
});

export const ChevronDownIcon = memo(function ChevronDownIcon({
  size = 16,
  color = '#7A6F73',
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 9L12 15L18 9"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
});
