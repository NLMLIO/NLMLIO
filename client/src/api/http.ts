import type { AuthResponse, ErrorResponse } from '@nlmlio/shared';

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

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';
  const messages: Partial<Record<ErrorResponse['code'], string>> = {
    VALIDATION_FAILED: '입력값의 형식과 길이를 확인해주세요.',
    INVALID_CREDENTIALS: '아이디 또는 비밀번호가 맞지 않습니다.',
    NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다.',
    EMAIL_TAKEN: '이미 가입된 이메일입니다.',
    USERNAME_TAKEN: '이미 가입된 아이디입니다.',
    TOKEN_EXPIRED: '로그인이 만료되었습니다. 다시 로그인해주세요.',
    TOKEN_INVALID: '다시 로그인해주세요.',
    INTERNAL_ERROR: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
  };
  return messages[error.detail.code] ?? '요청을 처리하지 못했습니다.';
}
