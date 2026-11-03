// src/services/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'access_token';
const memoryStore = new Map<string, string>();

/**
 * Chuẩn hoá token trước khi lưu/đọc:
 * - Bỏ khoảng trắng, dấu nháy bao quanh
 * - Bỏ tiền tố "Bearer "
 * - Loại giá trị rác (null, undefined)
 */
const normalizeToken = (raw: string | null | undefined): string | null => {
  if (typeof raw !== 'string') return null;
  let token = raw.trim().replace(/^["']+|["']+$/g, '').trim();
  token = token.replace(/^Bearer\s+/i, '').trim();
  if (!token || token === 'null' || token === 'undefined') return null;
  return token;
};

let initPromise: Promise<void> | null = null;

export const storage = {
  getSync(key: string): string | null {
    return memoryStore.get(key) ?? null;
  },

  setSync(key: string, value: string): void {
    if (key === TOKEN_KEY) {
      const token = normalizeToken(value);
      if (token) memoryStore.set(key, token);
      else memoryStore.delete(key);
      return;
    }
    memoryStore.set(key, value);
  },

  getToken(): string | null {
    return normalizeToken(memoryStore.get(TOKEN_KEY));
  },

  getTokenSync(): string | null {
    return normalizeToken(memoryStore.get(TOKEN_KEY));
  },

  async setToken(token: string): Promise<void> {
    const clean = normalizeToken(token);
    if (!clean) {
      await storage.removeToken();
      return;
    }
    await storage.setItem(TOKEN_KEY, clean);
  },

  async removeToken(): Promise<void> {
    await storage.removeItem(TOKEN_KEY);
  },

  /**
   * Nạp token từ ổ đĩa vào RAM. Gọi 1 lần khi mở app và await trước khi
   * gọi API đầu tiên.
   */
  init(): Promise<void> {
    if (!initPromise) {
      initPromise = (async () => {
        try {
          const token = await storage.getItem(TOKEN_KEY);
          const clean = normalizeToken(token);
          if (clean) memoryStore.set(TOKEN_KEY, clean);
          else memoryStore.delete(TOKEN_KEY);
        } catch {
          // Bỏ qua lỗi nạp RAM
        }
      })();
    }
    return initPromise;
  },

  async getItem(key: string): Promise<string | null> {
    try {
      if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
        const val = await AsyncStorage.getItem(key);
        if (val !== null) {
          const stored = key === TOKEN_KEY ? normalizeToken(val) : val;
          if (stored !== null) {
            memoryStore.set(key, stored);
            return stored;
          }
        }
      }
      return memoryStore.get(key) ?? null;
    } catch {
      return memoryStore.get(key) ?? null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    let toSave = value;
    if (key === TOKEN_KEY) {
      const clean = normalizeToken(value);
      if (!clean) {
        await storage.removeItem(key);
        return;
      }
      toSave = clean;
    }

    memoryStore.set(key, toSave);
    try {
      if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
        await AsyncStorage.setItem(key, toSave);
      }
    } catch {
      // Giữ trên RAM nếu ổ đĩa bị lỗi
    }
  },

  async removeItem(key: string): Promise<void> {
    memoryStore.delete(key);
    try {
      if (AsyncStorage && typeof AsyncStorage.removeItem === 'function') {
        await AsyncStorage.removeItem(key);
      }
    } catch {
      // Bỏ qua
    }
  },

  async clear(): Promise<void> {
    memoryStore.clear();
    initPromise = null;
    try {
      if (AsyncStorage && typeof AsyncStorage.clear === 'function') {
        await AsyncStorage.clear();
      }
    } catch {
      // Bỏ qua
    }
  },
};

export const getAccessToken = (): string | null => storage.getTokenSync();
export const setAccessToken = async (token: string): Promise<void> => storage.setToken(token);
export const clearStorage = async (): Promise<void> => storage.clear();
export const loadInitialToken = async (): Promise<string | null> => {
  await storage.init();
  return storage.getTokenSync();
};

export const appStorage = storage;
export default storage;