export const USERNAME_PATTERN = /^[a-z0-9]{4,20}$/;
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]{2,10}$/;
export const PASSWORD_PATTERN = /^(?=[\s\S]*[a-zA-Z])(?=[\s\S]*\d)[\s\S]{8,64}$/;

export const ROOM_CODE_PATTERN = /^\d{6}$/;
export const ROOM_NAME_MAX_LENGTH = 20;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_SPECTATORS = 10;
/** 참가자와 관전자를 합한 방 전체 정원(6 + 10). */
export const MAX_ROOM_SIZE = MAX_PLAYERS + MAX_SPECTATORS;

/** 앞뒤 공백을 뺀 방 이름이 1~20자인지 */
export function validRoomName(value: string): boolean {
  const name = value.trim();
  return name.length >= 1 && name.length <= ROOM_NAME_MAX_LENGTH;
}

/** 채팅 메시지 최대 길이(FUNC-004-01) */
export const CHAT_MAX_LENGTH = 200;
