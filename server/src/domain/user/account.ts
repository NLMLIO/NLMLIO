export interface UserAccount {
  id: number;
  username: string;
  nickname: string;
  email: string;
  passwordHash: string;
  authVersion: number;
  point: number;
  pointReachedAt: Date;
  createdAt: Date;
}

export interface CreateAccountInput {
  username: string;
  nickname: string;
  email: string;
  passwordHash: string;
}

export interface ChangeAccountInput {
  nickname?: string;
  email?: string;
  passwordHash?: string;
}
