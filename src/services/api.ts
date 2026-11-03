// src/services/api.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { storage, setAccessToken } from './storage';

// Đổi IP này trùng với IPv4 của máy tính đang chạy Backend NestJS
export const BASE_URL = 'http://192.168.1.11:3000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Callback đăng xuất được tiêm từ useAuthStore để tránh lỗi Circular Dependency
let onUnauthorizedCallback: (() => Promise<void>) | null = null;
export const registerUnauthorizedHandler = (callback: () => Promise<void>) => {
  onUnauthorizedCallback = callback;
};

// Trạng thái khóa và hàng đợi khi đang làm mới Access Token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// 1. REQUEST INTERCEPTOR: Đính kèm Token, Timezone và Idempotency-Key
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token =
        typeof (storage as any).getToken === 'function'
          ? await (storage as any).getToken()
          : await storage.getItem('access_token');

      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      let timezone = 'Asia/Ho_Chi_Minh';
      try {
        if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
          timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
        }
      } catch {
        timezone = 'Asia/Ho_Chi_Minh';
      }

      if (config.headers) {
        config.headers['X-Timezone'] = timezone;

        // Tự động gắn Idempotency-Key cho các request thay đổi dữ liệu nếu chưa được truyền thủ công
        const method = config.method?.toUpperCase();
        if (
          (method === 'POST' || method === 'PUT' || method === 'PATCH') &&
          !config.headers['Idempotency-Key'] &&
          !config.headers['idempotency-key']
        ) {
          const randomPart = Math.random().toString(36).substring(2, 10);
          config.headers['Idempotency-Key'] = `req_${Date.now()}_${randomPart}`;
        }
      }
    } catch {
      // Bỏ qua lỗi đọc header phụ
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// 2. RESPONSE INTERCEPTOR: Tự động gia hạn Access Token khi hết hạn 15 phút
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const requestUrl = originalRequest.url || '';
    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/check-email');

    // Chỉ kích hoạt làm mới phiên khi nhận lỗi 401 từ các API nghiệp vụ
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        // Nếu đang có 1 tiến trình refresh chạy, xếp các request bị 401 khác vào hàng đợi
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const savedRefreshToken = await storage.getItem('refresh_token');
        if (!savedRefreshToken) {
          throw new Error('Missing refresh token');
        }

        // Gọi bằng instance axios độc lập để không bị lặp interceptor
        const refreshResponse = await axios.post(
          `${BASE_URL}/api/v1/auth/refresh`,
          { refreshToken: savedRefreshToken },
          { timeout: 10000 },
        );

        const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data;
        if (!accessToken) {
          throw new Error('Invalid refresh response');
        }

        await setAccessToken(accessToken);
        await storage.setItem('access_token', accessToken);
        if (newRefreshToken) {
          await storage.setItem('refresh_token', newRefreshToken);
        }

        processQueue(null, accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Nếu Refresh Token cũng hết hạn (sau 30 ngày) hoặc không hợp lệ -> Đăng xuất an toàn
        if (onUnauthorizedCallback) {
          await onUnauthorizedCallback();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;