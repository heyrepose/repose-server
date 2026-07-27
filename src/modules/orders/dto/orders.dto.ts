import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ type: [String], example: ['uuid'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  listingIds!: string[];

  @ApiProperty()
  @IsUUID()
  addressId!: string;
}

export class ShipOrderDto {
  @ApiProperty({ example: 'Aramex' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  courierName!: string;

  @ApiProperty({ example: 'AWB123456' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  trackingNumber!: string;
}

export class DisputeOrderDto {
  @ApiProperty({ example: 'ITEM_NOT_AS_DESCRIBED' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ListOrdersQueryDto {
  @ApiProperty({ enum: ['buyer', 'seller'] })
  @IsIn(['buyer', 'seller'])
  role!: 'buyer' | 'seller';

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
