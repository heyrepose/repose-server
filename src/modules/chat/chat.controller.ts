import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  forwardRef,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import {
  CreateConversationDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  SendMessageDto,
} from './dto/chat.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('conversations')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
  ) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.chat.listConversations(userId, query);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chat.findOrCreate(userId, dto);
  }

  @Get(':id/messages')
  listMessages(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.chat.listMessages(userId, id, query);
  }

  @Post(':id/messages')
  @HttpCode(201)
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    const { message, recipientId, senderName } = await this.chat.createMessage(
      userId,
      id,
      dto,
    );

    this.gateway.server
      ?.to(`conversation:${id}`)
      .emit('message:new', message);
    this.gateway.emitToUser(recipientId, 'message:new', message);
    this.gateway.emitToUser(userId, 'message:new', message);

    if (!this.gateway.isUserOnline(recipientId)) {
      await this.chat.notifyOfflineRecipient(recipientId, senderName, id);
    }

    return message;
  }
}
