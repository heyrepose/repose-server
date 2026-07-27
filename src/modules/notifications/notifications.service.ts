import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationType, Prisma } from "@prisma/client";
import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { ChatGateway } from "../chat/chat.gateway";
import { NotificationNotFoundException } from "./notifications.errors";
import { ListNotificationsQueryDto } from "./dto/notifications.dto";

export interface DispatchNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Single entry point for in-app + realtime + push. Always persists first;
   * socket emit and push are best-effort and never roll back the row.
   * Honors user notification preference toggles.
   */
  async dispatch(input: DispatchNotificationInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        notifyOrderUpdates: true,
        notifyMessages: true,
        notifyMarketing: true,
      },
    });
    if (!user) return null;

    if (input.type === "ORDER_UPDATE" || input.type === "ITEM_SOLD") {
      if (!user.notifyOrderUpdates) return null;
    } else if (input.type === "NEW_MESSAGE") {
      if (!user.notifyMessages) return null;
    } else if (input.type === "SYSTEM" || input.type === "OFFER_RECEIVED") {
      if (!user.notifyMarketing) return null;
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    const payload = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      readAt: notification.readAt?.toISOString() ?? null,
      isRead: notification.readAt != null,
      createdAt: notification.createdAt.toISOString(),
    };

    try {
      this.chatGateway.emitToUser(input.userId, "notification:new", payload);
    } catch (err) {
      this.logger.warn(
        `Socket emit notification:new failed: ${(err as Error).message}`,
      );
    }

    void this.sendPush(input.userId, input.title, input.body, input.data).catch(
      (err) => this.logger.warn(`sendPush failed: ${(err as Error).message}`),
    );

    return payload;
  }

  /**
   * Queue-friendly push stub. Skips when FCM is unset; otherwise logs a
   * multicast stub (no firebase-admin dependency for MVP).
   */
  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const fcmJson = this.config.get("FCM_SERVICE_ACCOUNT_JSON", {
      infer: true,
    });
    if (!fcmJson) {
      this.logger.debug(
        `FCM skipped — FCM_SERVICE_ACCOUNT_JSON unset (user=${userId})`,
      );
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmTokens: true },
    });
    if (!user?.fcmTokens.length) {
      this.logger.debug(`FCM skipped — no tokens for user=${userId}`);
      return;
    }

    this.logger.log(
      `FCM stub: would send to ${user.fcmTokens.length} token(s) user=${userId} title="${title}" dataKeys=${Object.keys(data ?? {}).join(",") || "none"} bodyLen=${body.length}`,
    );
  }

  async list(userId: string, query: ListNotificationsQueryDto) {
    const limit = query.limit ?? 20;
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });

    return {
      data: page.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        readAt: n.readAt?.toISOString() ?? null,
        isRead: n.readAt != null,
        createdAt: n.createdAt.toISOString(),
      })),
      meta: {
        nextCursor:
          rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
        unreadCount,
      },
    };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotificationNotFoundException();
    if (existing.readAt) return;
    await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
