// src/utils/error.ts
// Chuyển mọi lỗi (NestJS / Axios / mạng) thành thông báo tiếng Việt dễ hiểu.

const DEFAULT_MESSAGE = 'Không thể thực hiện yêu cầu. Vui lòng thử lại.';

// ---------- 1. Theo mã HTTP ----------
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.',
  401: 'Phiên đăng nhập đã hết hạn hoặc thông tin xác thực không đúng. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu được yêu cầu.',
  405: 'Phương thức yêu cầu không được hỗ trợ.',
  408: 'Yêu cầu quá thời gian chờ. Vui lòng thử lại.',
  409: 'Dữ liệu bị trùng hoặc xung đột với dữ liệu đã có.',
  413: 'Dữ liệu gửi lên quá lớn.',
  415: 'Định dạng dữ liệu không được hỗ trợ.',
  422: 'Dữ liệu không thể xử lý. Vui lòng kiểm tra lại.',
  429: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  500: 'Máy chủ gặp sự cố. Vui lòng thử lại sau.',
  501: 'Chức năng này chưa được hỗ trợ.',
  502: 'Máy chủ tạm thời không phản hồi. Vui lòng thử lại sau.',
  503: 'Máy chủ đang bảo trì hoặc quá tải. Vui lòng thử lại sau.',
  504: 'Máy chủ phản hồi quá chậm. Vui lòng thử lại sau.',
};

// ---------- 2. Thông điệp mặc định của NestJS (khớp nguyên câu) ----------
const EXACT_MESSAGES: Record<string, string> = {
  'unauthorized': STATUS_MESSAGES[401],
  'forbidden': STATUS_MESSAGES[403],
  'forbidden resource': 'Bạn không có quyền truy cập tài nguyên này.',
  'not found': STATUS_MESSAGES[404],
  'bad request': STATUS_MESSAGES[400],
  'bad request exception': STATUS_MESSAGES[400],
  'conflict': STATUS_MESSAGES[409],
  'internal server error': STATUS_MESSAGES[500],
  'service unavailable': STATUS_MESSAGES[503],
  'gateway timeout': STATUS_MESSAGES[504],
  'bad gateway': STATUS_MESSAGES[502],
  'request timeout': STATUS_MESSAGES[408],
  'payload too large': STATUS_MESSAGES[413],
  'unprocessable entity': STATUS_MESSAGES[422],
  'too many requests': STATUS_MESSAGES[429],
  'throttlerexception: too many requests': STATUS_MESSAGES[429],
  'invalid credentials': 'Tên đăng nhập hoặc mật khẩu không đúng.',
  'invalid token': 'Token không hợp lệ. Vui lòng đăng nhập lại.',
  'jwt expired': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'jwt malformed': 'Token không hợp lệ. Vui lòng đăng nhập lại.',
  'invalid signature': 'Token không hợp lệ. Vui lòng đăng nhập lại.',
  'no auth token': 'Bạn chưa đăng nhập.',
  'validation failed': 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
  'user not found': 'Không tìm thấy người dùng.',
  'email already exists': 'Email này đã được sử dụng.',
  'user already exists': 'Tài khoản đã tồn tại.',
};

// ---------- 3. Tên trường thường gặp ----------
const FIELD_NAMES: Record<string, string> = {
  email: 'Email',
  password: 'Mật khẩu',
  confirmPassword: 'Mật khẩu xác nhận',
  oldPassword: 'Mật khẩu cũ',
  newPassword: 'Mật khẩu mới',
  username: 'Tên đăng nhập',
  name: 'Tên',
  fullName: 'Họ và tên',
  phone: 'Số điện thoại',
  phoneNumber: 'Số điện thoại',
  address: 'Địa chỉ',
  otp: 'Mã OTP',
  code: 'Mã xác nhận',
  token: 'Token',
  title: 'Tiêu đề',
  content: 'Nội dung',
  description: 'Mô tả',
  price: 'Giá',
  quantity: 'Số lượng',
  id: 'ID',
};

const fieldLabel = (raw: string): string => {
  const key = raw.trim();
  return FIELD_NAMES[key] ?? key;
};

// ---------- 4. Thông điệp class-validator (khớp theo mẫu) ----------
const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^(.+) should not be empty$/i, (m) => `${fieldLabel(m[1])} không được để trống`],
  [/^(.+) must be an email$/i, (m) => `${fieldLabel(m[1])} không đúng định dạng`],
  [/^(.+) must be a string$/i, (m) => `${fieldLabel(m[1])} phải là chuỗi ký tự`],
  [/^(.+) must be a number.*$/i, (m) => `${fieldLabel(m[1])} phải là số`],
  [/^(.+) must be an integer number$/i, (m) => `${fieldLabel(m[1])} phải là số nguyên`],
  [/^(.+) must be a boolean value$/i, (m) => `${fieldLabel(m[1])} phải là giá trị đúng/sai`],
  [/^(.+) must be an array$/i, (m) => `${fieldLabel(m[1])} phải là danh sách`],
  [/^(.+) must be a valid phone number.*$/i, (m) => `${fieldLabel(m[1])} không hợp lệ`],
  [/^(.+) must be a UUID$/i, (m) => `${fieldLabel(m[1])} không hợp lệ`],
  [/^(.+) must be a valid ISO 8601 date string$/i, (m) => `${fieldLabel(m[1])} phải là ngày hợp lệ`],
  [/^(.+) must be a Date instance.*$/i, (m) => `${fieldLabel(m[1])} phải là ngày hợp lệ`],
  [/^(.+) must be a URL address$/i, (m) => `${fieldLabel(m[1])} phải là đường dẫn hợp lệ`],
  [
    /^(.+) must be longer than or equal to (\d+) characters$/i,
    (m) => `${fieldLabel(m[1])} phải có ít nhất ${m[2]} ký tự`,
  ],
  [
    /^(.+) must be shorter than or equal to (\d+) characters$/i,
    (m) => `${fieldLabel(m[1])} chỉ được tối đa ${m[2]} ký tự`,
  ],
  [/^(.+) must not be less than (-?\d+(?:\.\d+)?)$/i, (m) => `${fieldLabel(m[1])} không được nhỏ hơn ${m[2]}`],
  [/^(.+) must not be greater than (-?\d+(?:\.\d+)?)$/i, (m) => `${fieldLabel(m[1])} không được lớn hơn ${m[2]}`],
  [/^(.+) must be a positive number$/i, (m) => `${fieldLabel(m[1])} phải là số dương`],
  [/^(.+) must be one of the following values: (.+)$/i, (m) => `${fieldLabel(m[1])} chỉ nhận một trong các giá trị: ${m[2]}`],
  [/^(.+) must match .+ regular expression$/i, (m) => `${fieldLabel(m[1])} không đúng định dạng`],
  [/^(.+) must contain .+$/i, (m) => `${fieldLabel(m[1])} không hợp lệ`],
  [/^property (.+) should not exist$/i, (m) => `Trường "${m[1]}" không được phép gửi lên`],
  [/^(.+) must be unique$/i, (m) => `${fieldLabel(m[1])} đã tồn tại`],
  [/^(.+) (?:already exists|already in use|is already taken)$/i, (m) => `${fieldLabel(m[1])} đã được sử dụng`],
  [/^(.+) not found$/i, (m) => `Không tìm thấy ${fieldLabel(m[1]).toLowerCase()}`],
  [/^cannot (get|post|put|patch|delete) (.+)$/i, () => 'Đường dẫn API không tồn tại. Vui lòng kiểm tra lại cấu hình.'],
  [/^duplicate entry/i, () => 'Dữ liệu bị trùng với dữ liệu đã có.'],
  [/unique constraint/i, () => 'Dữ liệu bị trùng với dữ liệu đã có.'],
];

const VIETNAMESE_CHARS =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const translateOne = (raw: string): string => {
  const text = raw.trim();
  if (!text) return '';

  // Backend đã trả tiếng Việt thì giữ nguyên
  if (VIETNAMESE_CHARS.test(text)) return text;

  const exact = EXACT_MESSAGES[text.toLowerCase()];
  if (exact) return exact;

  for (const [regex, build] of PATTERNS) {
    const match = text.match(regex);
    if (match) return build(match);
  }

  return text; // Không nhận diện được: giữ nguyên để dễ debug
};

const unique = (items: string[]): string[] => Array.from(new Set(items));

// Rút thông điệp thô từ body NestJS: string | string[] | { message } | { error }
const extractMessages = (data: any): string[] => {
  if (!data) return [];
  if (typeof data === 'string') {
    // Tránh hiển thị cả trang HTML lỗi
    return data.trim().startsWith('<') ? [] : [data];
  }

  const msg = data.message;
  if (Array.isArray(msg)) {
    return msg.flatMap((m: any) => extractMessages(m));
  }
  if (typeof msg === 'string') return [msg];
  if (msg && typeof msg === 'object') return extractMessages(msg);
  if (typeof data.error === 'string') return [data.error];
  return [];
};

export const getErrorStatus = (error: any): number | undefined =>
  error?.response?.status ?? error?.response?.data?.statusCode;

export const getErrorMessage = (error: any): string => {
  if (!error) return 'Đã có lỗi không xác định xảy ra.';

  // --- Có phản hồi từ server (NestJS) ---
  const response = error?.response;
  if (response) {
    const status = getErrorStatus(error);
    const messages = unique(
      extractMessages(response.data)
        .map(translateOne)
        .filter(Boolean),
    );

    if (messages.length > 0) return messages.join('\n');
    if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
    if (status && status >= 500) return STATUS_MESSAGES[500];
    return DEFAULT_MESSAGE;
  }

  // --- Không có phản hồi: lỗi mạng / timeout ---
  const code: string | undefined = error?.code;
  const rawMessage: string = typeof error?.message === 'string' ? error.message : '';

  if (code === 'ECONNABORTED' || /timeout/i.test(rawMessage)) {
    return 'Máy chủ phản hồi quá chậm. Vui lòng kiểm tra mạng và thử lại.';
  }
  if (code === 'ERR_NETWORK' || /network error/i.test(rawMessage) || error?.request) {
    return 'Không thể kết nối tới máy chủ Backend. Vui lòng kiểm tra IP LAN và cổng 3000.';
  }
  if (code === 'ERR_CANCELED' || /canceled|aborted/i.test(rawMessage)) {
    return 'Yêu cầu đã bị hủy.';
  }

  if (rawMessage) return translateOne(rawMessage);

  return DEFAULT_MESSAGE;
};

export default getErrorMessage;