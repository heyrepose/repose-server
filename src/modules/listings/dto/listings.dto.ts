import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingCondition } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateListingDto {
  @ApiProperty()
  @IsUUID()
  categoryId!: string;
}

export class UpdateListingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ListingCondition })
  @IsOptional()
  @IsEnum(ListingCondition)
  condition?: ListingCondition;

  @ApiPropertyOptional({ example: '149.50', description: 'Decimal string AED' })
  @IsOptional()
  @IsString()
  priceAed?: string;
}

export class PublishListingDto {
  @ApiProperty({ enum: ListingCondition })
  @IsEnum(ListingCondition)
  condition!: ListingCondition;

  @ApiProperty({ example: '149.50', description: 'Decimal string AED' })
  @IsString()
  priceAed!: string;
}

export class ConfirmImageDto {
  @ApiProperty()
  @IsUrl({ require_protocol: true })
  url!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  sortOrder!: number;
}

export class ConfirmPhotosDto {
  @ApiProperty({ type: [ConfirmImageDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ConfirmImageDto)
  images!: ConfirmImageDto[];
}

export class ReportListingDto {
  @ApiProperty({ example: 'COUNTERFEIT_SUSPECTED' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ListSellerListingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}
