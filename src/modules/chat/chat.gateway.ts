import {
  Logger,
  UsePipes,
  ValidationPipe,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { AppConfig } from '../../config/configuration';
import {
  extractSocketToken,
  resolveJwtVerifyOptions,
} from '../../common/auth/jwt-verify.util';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ChatService } from './chat.service';
import {
  SocketReadDto,
  SocketSendMessageDto,
  SocketSubscribeDto,
} from './dto/chat.dto';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = extractSocketToken(client.handshake);
    if (!token) {
      client.emit('auth:error', { message: 'Missing access token' });
      client.disconnect(true);
      return;
    }

    try {
      const opts = resolveJwtVerifyOptions(this.config);
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: opts.secret,
        algorithms: opts.algorithms,
      });
      if (!payload?.sub) throw new Error('missing sub');
      client.data.userId = payload.sub;
      await client.join(`user:${payload.sub}`);
    } catch (err) {
      this.logger.debug(`Socket auth failed: ${(err as Error).message}`);
      client.emit('auth:error', { message: 'Invalid or expired token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data?.userId as string | undefined;
    if (userId) {
      this.logger.debug(`Socket disconnected user=${userId} sid=${client.id}`);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  isUserOnline(userId: string): boolean {
    if (!this.server?.sockets?.adapter?.rooms) return false;
    const room = this.server.sockets.adapter.rooms.get(`user:${userId}`);
    return !!room && room.size > 0;
  }

  @SubscribeMessage('conversation:subscribe')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SocketSubscribeDto,
  ) {
    const userId = client.data.userId as string;
    await this.chat.requireParticipant(userId, dto.conversationId);
    await client.join(`conversation:${dto.conversationId}`);
    return { ok: true, conversationId: dto.conversationId };
  }

  @SubscribeMessage('message:send')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SocketSendMessageDto,
  ) {
    const userId = client.data.userId as string;
    const { message, recipientId, senderName } = await this.chat.createMessage(
      userId,
      dto.conversationId,
      { body: dto.body, attachmentUrl: dto.attachmentUrl },
    );

    this.server
      .to(`conversation:${dto.conversationId}`)
      .emit('message:new', message);
    // Also fan-out to personal rooms so offline clients that only joined user rooms see it.
    this.emitToUser(recipientId, 'message:new', message);
    this.emitToUser(userId, 'message:new', message);

    if (!this.isUserOnline(recipientId)) {
      await this.chat.notifyOfflineRecipient(
        recipientId,
        senderName,
        dto.conversationId,
      );
    }

    return message;
  }

  @SubscribeMessage('message:read')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SocketReadDto,
  ) {
    const userId = client.data.userId as string;
    await this.chat.markReadUpTo(userId, dto.conversationId, dto.upToMessageId);
    const ack = {
      conversationId: dto.conversationId,
      readerId: userId,
      upToMessageId: dto.upToMessageId,
    };
    this.server.to(`conversation:${dto.conversationId}`).emit('message:read_ack', ack);
    return ack;
  }

  @SubscribeMessage('typing:start')
  async onTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const userId = client.data.userId as string;
    if (!body?.conversationId) return;
    await this.chat.requireParticipant(userId, body.conversationId);
    client
      .to(`conversation:${body.conversationId}`)
      .emit('typing:start', { conversationId: body.conversationId, userId });
  }

  @SubscribeMessage('typing:stop')
  async onTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const userId = client.data.userId as string;
    if (!body?.conversationId) return;
    await this.chat.requireParticipant(userId, body.conversationId);
    client
      .to(`conversation:${body.conversationId}`)
      .emit('typing:stop', { conversationId: body.conversationId, userId });
  }
}
