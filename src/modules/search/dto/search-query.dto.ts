import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value as string];
};

export class SearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug (preferred)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Category UUID (optional alternative)' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  condition?: string[];

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  brand?: string[];

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  size?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    enum: ['relevance', 'newest', 'price_asc', 'price_desc'],
  })
  @IsOptional()
  @IsIn(['relevance', 'newest', 'price_asc', 'price_desc'])
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}
