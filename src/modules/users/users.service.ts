import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeOffset, encodeOffset } from '../../common/pagination/cursor.util';
import { isValidUsername } from '../auth/username.util';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  UsernameInvalidException,
  UsernameTakenException,
  UserNotFoundException,
} from './users.errors';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserNotFoundException();
    return this.privateProfile(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    if (dto.username !== undefined) {
      const normalized = dto.username.toLowerCase();
      if (!isValidUsername(normalized)) throw new UsernameInvalidException();
      const existing = await this.prisma.user.findUnique({
        where: { username: normalized },
      });
      if (existing && existing.id !== userId) throw new UsernameTakenException();
      dto.username = normalized;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
        username: dto.username,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        notifyOrderUpdates: dto.notifyOrderUpdates,
        notifyMessages: dto.notifyMessages,
        notifyMarketing: dto.notifyMarketing,
      },
    });
    return this.privateProfile(user);
  }

  async getPublicProfile(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.status === 'BANNED') throw new UserNotFoundException();
    return this.publicProfile(user);
  }

  async getByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    if (!user || user.status === 'BANNED') throw new UserNotFoundException();
    return this.publicProfile(user);
  }

  async listReviews(
    userId: string,
    opts: { cursor?: string; limit?: number },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status === 'BANNED') throw new UserNotFoundException();

    const limit = Math.min(opts.limit ?? 20, 50);
    const offset = decodeOffset(opts.cursor);

    const [rows, starGroups] = await Promise.all([
      this.prisma.review.findMany({
        where: { revieweeId: userId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit + 1,
        include: {
          reviewer: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              fullName: true,
            },
          },
        },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { revieweeId: userId },
        _count: { rating: true },
      }),
    ]);

    const page = rows.slice(0, limit);
    const starCounts: Record<string, number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    for (const g of starGroups) {
      starCounts[String(g.rating)] = g._count.rating;
    }

    return {
      data: page.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        reviewer: {
          id: r.reviewer.id,
          username: r.reviewer.username,
          avatarUrl: r.reviewer.avatarUrl,
          fullName: r.reviewer.fullName,
        },
      })),
      meta: {
        nextCursor: rows.length > limit ? encodeOffset(offset + limit) : null,
        averageRating: user.ratingAvg.toString(),
        reviewCount: user.ratingCount,
        starCounts,
      },
    };
  }

  async addFcmToken(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserNotFoundException();
    if (user.fcmTokens.includes(token)) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: { set: [...user.fcmTokens, token] } },
    });
  }

  async removeFcmToken(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserNotFoundException();
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: { set: user.fcmTokens.filter((t) => t !== token) } },
    });
  }

  private privateProfile(user: User) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role,
      status: user.status,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      ratingAvg: user.ratingAvg.toString(),
      ratingCount: user.ratingCount,
      reviewCount: user.ratingCount,
      itemsSoldCount: user.itemsSoldCount,
      itemsBoughtCount: user.itemsBoughtCount,
      notifyOrderUpdates: user.notifyOrderUpdates,
      notifyMessages: user.notifyMessages,
      notifyMarketing: user.notifyMarketing,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private publicProfile(user: User) {
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      ratingAvg: user.ratingAvg.toString(),
      ratingCount: user.ratingCount,
      reviewCount: user.ratingCount,
      itemsSoldCount: user.itemsSoldCount,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
