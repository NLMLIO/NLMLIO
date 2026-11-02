import type { AuthResponse, ErrorCode, ErrorResponse } from '@nlmlio/shared';

let accessToken = '';
let refreshing: Promise<AuthResponse> | null = null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: ErrorResponse,
  ) {
    super(detail.message ?? detail.code);
  }
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function getAccessToken(): string {
  return accessToken;
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body as ErrorResponse);
  return body as T;
}

export async function refreshSession(): Promise<AuthResponse> {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
  })
    .then(parse<AuthResponse>)
    .then((session) => {
      accessToken = session.accessToken;
      return session;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  try {
    return await parse<T>(
      await fetch(`/api${path}`, {
        ...options,
        credentials: 'same-origin',
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...options.headers,
        },
      }),
    );
  } catch (error) {
    if (
      retry &&
      !path.startsWith('/auth/') &&
      error instanceof ApiError &&
      ['TOKEN_EXPIRED', 'TOKEN_INVALID'].includes(error.detail.code)
    ) {
      try {
        await refreshSession();
      } catch (refreshError) {
        accessToken = '';
        window.dispatchEvent(new Event('nlmlio:session-expired'));
        throw refreshError;
      }
      return api<T>(path, options, false);
    }
    throw error;
  }
}

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: '입력값의 형식과 길이를 확인해주세요.',
  INVALID_CREDENTIALS: '아이디 또는 비밀번호가 맞지 않습니다.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다.',
  USERNAME_TAKEN: '이미 가입된 아이디입니다.',
  TOKEN_EXPIRED: '로그인이 만료되었습니다. 다시 로그인해주세요.',
  TOKEN_INVALID: '다시 로그인해주세요.',
  ALREADY_IN_ROOM: '이미 다른 방에 참가 중입니다.',
  NOT_IN_ROOM: '참가 중인 방이 없습니다.',
  ROOM_NOT_FOUND: '없는 방 코드예요. 코드를 다시 확인해주세요.',
  ROOM_FULL: '자리가 가득 찼어요.',
  ROOM_IN_GAME: '이미 게임이 시작된 방이에요.',
  NOT_ROOM_HOST: '방장만 할 수 있어요.',
  NOT_ENOUGH_PLAYERS: '참가자가 2명 이상이어야 시작할 수 있어요.',
  USER_NOT_FOUND: '이미 방을 나간 회원이에요.',
  CHAT_TOO_LONG: '메시지는 1~200자로 보내주세요.',
  RATE_LIMITED: '너무 빨리 보내고 있어요. 잠시 후 다시 보내주세요.',
  INTERNAL_ERROR: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
};

export function codeMessage(code: ErrorCode): string {
  return MESSAGES[code] ?? '요청을 처리하지 못했습니다.';
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';
  return codeMessage(error.detail.code);
}
