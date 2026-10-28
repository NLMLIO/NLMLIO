import type { Socket } from 'socket.io';

/** 인증 미들웨어가 소켓에 담아 두는 값 */
export interface SocketUser {
  userId: number;
}

export const socketUser = (socket: Socket) => socket.data as SocketUser;
