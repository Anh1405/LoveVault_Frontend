// src/utils/emailValidator.ts

export interface NormalizedEmailResult {
  isValid: boolean;
  cleanEmail: string;      // Dùng để hiển thị và gửi mail
  canonicalEmail: string;  // Dùng để kiểm tra chống trùng và đăng nhập
  error?: string;
  suggestion?: string;     // Gợi ý email đúng khi phát hiện gõ sai domain
}

const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

// Từ điển tên miền gõ sai phổ biến và tên miền chuẩn tương ứng
const DOMAIN_TYPOS: Record<string, string> = {
  'gmmail.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gimail.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.coom': 'gmail.com',
  'gmail.co': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'iclou.com': 'icloud.com',
  'icloud.con': 'icloud.com',
};

// Danh sách đuôi TLD sai phổ biến do gõ nhầm bàn phím
const INVALID_TLDS = new Set(['con', 'cmo', 'coom', 'comm', 'vnn', 'gmo']);

/**
 * Xóa toàn bộ khoảng trắng và ký tự ẩn Zero-Width
 */
export const stripAllSpaces = (input: string): string => {
  if (!input) return '';
  return input.replace(/[\s\u200B-\u200D\uFEFF]+/g, '').toLowerCase();
};

/**
 * Chuẩn hóa và kiểm tra nghiêm ngặt định dạng Email
 */
export const validateAndNormalizeEmail = (
  rawInput: string,
  strictGmailOnly: boolean = false,
): NormalizedEmailResult => {
  const cleanEmail = stripAllSpaces(rawInput);

  if (!cleanEmail) {
    return {
      isValid: false,
      cleanEmail: '',
      canonicalEmail: '',
      error: 'Vui lòng nhập địa chỉ email.',
    };
  }

  const parts = cleanEmail.split('@');
  if (parts.length !== 2) {
    return {
      isValid: false,
      cleanEmail,
      canonicalEmail: cleanEmail,
      error: 'Địa chỉ email phải chứa đúng một ký tự @.',
    };
  }

  const [localPart, domainPart] = parts;

  if (!localPart || !domainPart) {
    return {
      isValid: false,
      cleanEmail,
      canonicalEmail: cleanEmail,
      error: 'Địa chỉ email không đầy đủ.',
    };
  }

  // 1. Kiểm tra từ điển tên miền gõ sai (Chặn gmmail.com, gamil.com, gmail.con...)
  if (DOMAIN_TYPOS[domainPart]) {
    const correctDomain = DOMAIN_TYPOS[domainPart];
    const suggestedEmail = `${localPart}@${correctDomain}`;
    return {
      isValid: false,
      cleanEmail,
      canonicalEmail: cleanEmail,
      error: `Tên miền "${domainPart}" có vẻ bị gõ sai.`,
      suggestion: suggestedEmail,
    };
  }

  // 2. Chặn các đuôi TLD sai phổ biến (.con, .cmo...)
  const domainSegments = domainPart.split('.');
  const tld = domainSegments[domainSegments.length - 1];

  if (INVALID_TLDS.has(tld)) {
    return {
      isValid: false,
      cleanEmail,
      canonicalEmail: cleanEmail,
      error: `Đuôi tên miền ".${tld}" không hợp lệ. Vui lòng kiểm tra lại.`,
    };
  }

  const isGmail = GMAIL_DOMAINS.includes(domainPart);

  if (strictGmailOnly && !isGmail) {
    return {
      isValid: false,
      cleanEmail,
      canonicalEmail: cleanEmail,
      error: 'Hệ thống hiện chỉ chấp nhận địa chỉ @gmail.com.',
    };
  }

  // 3. Quy tắc kiểm tra riêng cho Gmail
  if (isGmail) {
    const baseUsername = localPart.split('+')[0];
    const strippedDotsUsername = baseUsername.replace(/\./g, '');

    if (strippedDotsUsername.length < 6 || strippedDotsUsername.length > 30) {
      return {
        isValid: false,
        cleanEmail,
        canonicalEmail: '',
        error: 'Tên tài khoản Gmail phải có từ 6 đến 30 ký tự (không tính dấu chấm).',
      };
    }

    if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
      return {
        isValid: false,
        cleanEmail,
        canonicalEmail: '',
        error: 'Địa chỉ Gmail không được bắt đầu, kết thúc hoặc có hai dấu chấm liên tiếp.',
      };
    }

    if (!/^[a-z0-9.+]+$/.test(localPart)) {
      return {
        isValid: false,
        cleanEmail,
        canonicalEmail: '',
        error: 'Tài khoản Gmail chỉ được chứa chữ cái (a-z), số (0-9) và dấu chấm (.).',
      };
    }

    const canonicalEmail = `${strippedDotsUsername}@gmail.com`;
    return {
      isValid: true,
      cleanEmail: `${localPart}@gmail.com`,
      canonicalEmail,
    };
  }

  // 4. Kiểm tra cho các tên miền hợp lệ khác
  const generalEmailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!generalEmailRegex.test(cleanEmail) || localPart.includes('..')) {
    return {
      isValid: false,
      cleanEmail,
      canonicalEmail: cleanEmail,
      error: 'Định dạng địa chỉ email không hợp lệ.',
    };
  }

  return {
    isValid: true,
    cleanEmail,
    canonicalEmail: cleanEmail,
  };
};