export const USERNAME_PATTERN = /^[a-z0-9]{4,20}$/;
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]{2,10}$/;
export const PASSWORD_PATTERN = /^(?=[\s\S]*[a-zA-Z])(?=[\s\S]*\d)[\s\S]{8,64}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}
