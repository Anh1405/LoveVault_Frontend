// src/utils/imageUtils.ts
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export const pickImageAsBase64 = async (maxSize = 800): Promise<string | null> => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.65,
    base64: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  // 1. Xử lý trên Web: Dùng Canvas nén ảnh trực tiếp thành Data URL Base64 vĩnh viễn (Xóa bỏ hoàn toàn link blob:)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        } else {
          resolve(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = asset.uri;
    });
  }

  // 2. Xử lý trên iOS / Android Mobile
  if (asset.base64) {
    return `data:image/jpeg;base64,${asset.base64}`;
  }

  try {
    const base64FromFile = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${base64FromFile}`;
  } catch (err) {
    console.error('Lỗi chuyển ảnh sang Base64:', err);
    return null;
  }
};