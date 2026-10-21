// HTTP 요청·응답 타입

export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: boolean;
  redis: boolean;
}
