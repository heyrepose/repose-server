import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListingNotFoundException } from '../listings/listings.errors';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ChatCannotMessageSelfException,
  ChatMessageEmptyException,
  ConversationForbiddenException,
  ConversationNotFoundException,
} from './chat.errors';
import {
  CreateConversationDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  SendMessageDto,
} from './dto/chat.dto';

export interface PersistedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  attachmentUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifications: NotificationsService,
  ) {}

  async findOrCreate(userId: string, dto: CreateConversationDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      },
    });
    if (!listing) throw new ListingNotFoundException();

    const parties = resolveConversationParties({
      actorId: userId,
      listingSellerId: listing.sellerId,
      sellerIdOverride: dto.sellerId,
      buyerIdOverride: dto.buyerId,
    });
    if ('error' in parties) {
      if (parties.error === 'self') throw new ChatCannotMessageSelfException();
      if (parties.error === 'buyer_required') {
        throw new ConversationForbiddenException();
      }
      throw new ListingNotFoundException();
    }
    const { buyerId, sellerId } = parties;

    const conversation = await this.prisma.conversation.upsert({
      where: {
        listingId_buyerId_sellerId: conversationUniqueKey({
          listingId: listing.id,
          buyerId,
          sellerId,
        }),
      },
      create: {
        listingId: listing.id,
        buyerId,
        sellerId,
      },
      update: {},
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
        buyer: {
          select: { id: true, username: true, avatarUrl: true, fullName: true },
        },
        seller: {
          select: { id: true, username: true, avatarUrl: true, fullName: true },
        },
      },
    });

    const other =
      conversation.buyerId === userId ? conversation.seller : conversation.buyer;

    return {
      id: conversation.id,
      listing: conversation.listing
        ? {
            id: conversation.listing.id,
            title: conversation.listing.title,
            mainImageUrl: conversation.listing.images[0]?.url ?? null,
          }
        : null,
      otherUser: {
        id: other.id,
        username: other.username,
        avatarUrl: other.avatarUrl,
      },
      lastMessage: null as null,
      unreadCount: 0,
      createdAt: conversation.createdAt.toISOString(),
    };
  }

  async listConversations(userId: string, query: ListConversationsQueryDto) {
    const limit = query.limit ?? 20;
    const rows = await this.prisma.conversation.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
        buyer: {
          select: { id: true, username: true, avatarUrl: true },
        },
        seller: {
          select: { id: true, username: true, avatarUrl: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, createdAt: true, senderId: true },
        },
      },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);

    const unreadCounts = await Promise.all(
      page.map((c) =>
        this.prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: userId },
            readAt: null,
          },
        }),
      ),
    );

    return {
      data: page.map((c, i) => {
        const other = c.buyerId === userId ? c.seller : c.buyer;
        const last = c.messages[0];
        return {
          id: c.id,
          listing: c.listing
            ? {
                id: c.listing.id,
                title: c.listing.title,
                mainImageUrl: c.listing.images[0]?.url ?? null,
              }
            : null,
          otherUser: {
            id: other.id,
            username: other.username,
            avatarUrl: other.avatarUrl,
          },
          lastMessage: last
            ? {
                body: last.body,
                createdAt: last.createdAt.toISOString(),
              }
            : null,
          unreadCount: unreadCounts[i] ?? 0,
        };
      }),
      meta: {
        nextCursor:
          rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
      },
    };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    query: ListMessagesQueryDto,
  ) {
    await this.requireParticipant(userId, conversationId);
    const limit = query.limit ?? 50;

    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    return {
      data: page.map((m) => this.serializeMessage(m)),
      meta: {
        nextCursor:
          rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
      },
    };
  }

  /**
   * Persist a message. Caller is responsible for realtime fan-out and
   * offline notification fallback (gateway / REST wrapper).
   */
  async createMessage(
    senderId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<{
    message: PersistedMessage;
    recipientId: string;
    senderName: string;
  }> {
    const conversation = await this.requireParticipant(senderId, conversationId);
    const body = dto.body?.trim() || null;
    const attachmentUrl = dto.attachmentUrl?.trim() || null;
    if (!body && !attachmentUrl) throw new ChatMessageEmptyException();

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { fullName: true },
    });

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId,
          body,
          attachmentUrl,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });

    const recipientId =
      conversation.buyerId === senderId
        ? conversation.sellerId
        : conversation.buyerId;

    return {
      message: this.serializeMessage(message),
      recipientId,
      senderName: sender?.fullName ?? 'Someone',
    };
  }

  async notifyOfflineRecipient(
    recipientId: string,
    senderName: string,
    conversationId: string,
  ): Promise<void> {
    await this.notifications.dispatch({
      userId: recipientId,
      type: NotificationType.NEW_MESSAGE,
      title: 'New message',
      body: `${senderName} sent you a message`,
      data: { route: 'chat', conversationId },
    });
  }

  async markReadUpTo(
    readerId: string,
    conversationId: string,
    upToMessageId: string,
  ): Promise<void> {
    await this.requireParticipant(readerId, conversationId);
    const upTo = await this.prisma.message.findFirst({
      where: { id: upToMessageId, conversationId },
    });
    if (!upTo) return;

    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: readerId },
        readAt: null,
        createdAt: { lte: upTo.createdAt },
      },
      data: { readAt: new Date() },
    });
  }

  async requireParticipant(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new ConversationNotFoundException();
    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ConversationForbiddenException();
    }
    return conversation;
  }

  private serializeMessage(m: {
    id: string;
    conversationId: string;
    senderId: string;
    body: string | null;
    attachmentUrl: string | null;
    readAt: Date | null;
    createdAt: Date;
  }): PersistedMessage {
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: m.body,
      attachmentUrl: m.attachmentUrl,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }
}

/** Pure helper used by unit tests — upsert identity for a listing chat. */
export function conversationUniqueKey(input: {
  listingId: string;
  buyerId: string;
  sellerId: string;
}): Prisma.ConversationListingIdBuyerIdSellerIdCompoundUniqueInput {
  return {
    listingId: input.listingId,
    buyerId: input.buyerId,
    sellerId: input.sellerId,
  };
}

export function resolveConversationParties(input: {
  actorId: string;
  listingSellerId: string;
  sellerIdOverride?: string;
  buyerIdOverride?: string;
}):
  | { buyerId: string; sellerId: string }
  | { error: 'self' | 'seller_mismatch' | 'buyer_required' } {
  const sellerId = input.sellerIdOverride ?? input.listingSellerId;
  if (input.sellerIdOverride && input.sellerIdOverride !== input.listingSellerId) {
    return { error: 'seller_mismatch' };
  }
  // Seller initiating chat with a specific buyer (order context).
  if (input.actorId === sellerId) {
    if (
      input.buyerIdOverride &&
      input.buyerIdOverride !== sellerId
    ) {
      return { buyerId: input.buyerIdOverride, sellerId };
    }
    return { error: input.buyerIdOverride ? 'self' : 'buyer_required' };
  }
  if (input.buyerIdOverride && input.buyerIdOverride !== input.actorId) {
    return { error: 'seller_mismatch' };
  }
  return { buyerId: input.actorId, sellerId };
}
