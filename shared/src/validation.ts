export const USERNAME_PATTERN = /^[a-z0-9]{4,20}$/;
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]{2,10}$/;
export const PASSWORD_PATTERN = /^(?=[\s\S]*[a-zA-Z])(?=[\s\S]*\d)[\s\S]{8,64}$/;

export const ROOM_CODE_PATTERN = /^\d{6}$/;
export const ROOM_NAME_MAX_LENGTH = 20;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_SPECTATORS = 10;

/** 앞뒤 공백을 뺀 방 이름이 1~20자인지 */
export function validRoomName(value: string): boolean {
  const name = value.trim();
  return name.length >= 1 && name.length <= ROOM_NAME_MAX_LENGTH;
}
