import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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

/** Single value, repeated keys, or comma-separated → clean string[]. */
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parts = Array.isArray(value)
    ? value.flatMap((v) => String(v).split(','))
    : String(value).split(',');
  const cleaned = parts.map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
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

  @ApiPropertyOptional({
    isArray: true,
    type: String,
    description: 'Condition enum(s); comma-separated or repeated',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  condition?: string[];

  @ApiPropertyOptional({
    isArray: true,
    type: String,
    description: 'Brand(s); comma-separated or repeated',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  brand?: string[];

  @ApiPropertyOptional({
    isArray: true,
    type: String,
    description: 'Size(s); comma-separated or repeated',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  size?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
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
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}
