// src/services/socialAuth.ts
import { Platform } from 'react-native';

export class SocialAuthCancelledError extends Error {
  constructor() {
    super('Người dùng đã hủy đăng nhập.');
    this.name = 'SocialAuthCancelledError';
  }
}

export interface GoogleCredential {
  idToken: string;
}

export interface AppleCredential {
  idToken: string;
  fullName: string | null;
}

// Giữ lại khung hàm stub để không làm gãy type-check ở các file khác
export const configureGoogleSignIn = () => {};

export const getGoogleCredential = async (): Promise<GoogleCredential> => {
  throw new Error('Đăng nhập Google không hỗ trợ trên Expo Go. Vui lòng dùng bản Development Build.');
};

export const signOutGoogle = async () => {};

export const getAppleCredential = async (): Promise<AppleCredential> => {
  throw new Error('Đăng nhập Apple với native module không hỗ trợ trên Expo Go.');
};