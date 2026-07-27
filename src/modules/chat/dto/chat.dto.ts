import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ListConversationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateConversationDto {
  @ApiProperty()
  @IsUUID()
  listingId!: string;

  @ApiPropertyOptional({
    description: 'Defaults to the listing seller when omitted',
  })
  @IsOptional()
  @IsUUID()
  sellerId?: string;
}

export class SendMessageDto {
  @ApiPropertyOptional()
  @ValidateIf((o: SendMessageDto) => !o.attachmentUrl)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachmentUrl?: string;
}

export class SocketSendMessageDto {
  @ApiProperty()
  @IsUUID()
  conversationId!: string;

  @ApiPropertyOptional()
  @ValidateIf((o: SocketSendMessageDto) => !o.attachmentUrl)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachmentUrl?: string;
}

export class SocketSubscribeDto {
  @IsUUID()
  conversationId!: string;
}

export class SocketReadDto {
  @IsUUID()
  conversationId!: string;

  @IsUUID()
  upToMessageId!: string;
}
