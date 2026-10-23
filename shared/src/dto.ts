// HTTP 요청·응답 타입

export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: boolean;
  redis: boolean;
}

export interface PublicUser {
  id: number;
  username: string;
  nickname: string;
  createdAt: string;
  point: number;
}

export interface PlayerStats {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  bellSuccess: number;
  bellFail: number;
  bellSuccessRate: number;
  averageReactionMs: number | null;
  departures: number;
}

export interface DashboardResponse {
  user: PublicUser;
  rank: number;
  stats: PlayerStats;
}

export interface GameHistoryItem {
  gameId: string;
  roomName: string;
  playedAt: string;
  players: number;
  rank: number;
  point: number;
  departed: boolean;
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HistoryResponse extends PageResponse<GameHistoryItem> {
  stats: PlayerStats;
}

export interface RankingEntry {
  userId: number;
  nickname: string;
  wins: number;
  losses: number;
  rank: number;
}

export interface RankingResponse extends PageResponse<RankingEntry> {
  me: RankingEntry;
}

export interface NicknameCheckResponse {
  nickname: string;
  available: boolean;
  checkToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  nickname: string;
  nicknameCheckToken: string;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

export interface UpdateProfileRequest {
  nickname?: string;
  nicknameCheckToken?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateProfileResponse {
  user: PublicUser;
  requiresLogin: boolean;
}

/** 서버 게임 모듈만 호출한다. 클라이언트에서 결과를 제출할 수 없다. */
export interface SettleGameInput {
  gameId: string;
  roomCode: string;
  roomName: string;
  startedAt: string;
  endedAt: string;
  players: {
    userId: number;
    rank: number;
    departed: boolean;
    bellSuccess: number;
    bellFail: number;
    reactionSumMs: number;
  }[];
}
