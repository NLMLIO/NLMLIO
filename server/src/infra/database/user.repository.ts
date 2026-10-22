import { Injectable } from '@nestjs/common';
import type { PublicUser } from '@nlmlio/shared';
import type {
  ChangeAccountInput,
  CreateAccountInput,
  UserAccount,
} from '../../domain/user/account';
import { PrismaService } from './prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<UserAccount | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByUsername(username: string): Promise<UserAccount | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findByNickname(nickname: string): Promise<UserAccount | null> {
    return this.prisma.user.findUnique({ where: { nickname } });
  }

  async create(input: CreateAccountInput): Promise<UserAccount> {
    return this.prisma.user.create({ data: input });
  }

  async update(account: UserAccount, changes: ChangeAccountInput): Promise<UserAccount | null> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id: account.id, authVersion: account.authVersion },
        data: {
          ...changes,
          ...(changes.passwordHash ? { authVersion: { increment: 1 } } : {}),
        },
      });
      return result.count ? tx.user.findUnique({ where: { id: account.id } }) : null;
    });
  }
}

export function toPublicUser(user: UserAccount): PublicUser {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    point: user.point,
  };
}

export function uniqueConflict(error: unknown): string[] | null {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002')
    return null;
  const meta =
    'meta' in error
      ? (error.meta as {
          target?: string[] | string;
          constraint?: { fields?: string[]; index?: string } | string;
          driverAdapterError?: { cause?: { constraint?: { fields?: string[]; index?: string } } };
        })
      : undefined;
  const references = [meta?.target, meta?.constraint, meta?.driverAdapterError?.cause?.constraint];
  for (const reference of references) {
    if (Array.isArray(reference)) return reference;
    if (reference && typeof reference === 'object' && reference.fields) return reference.fields;
    const index = typeof reference === 'string' ? reference : reference?.index;
    if (index)
      return ['username', 'nickname', 'email'].filter((field) => index === `User_${field}_key`);
  }
  return [];
}
