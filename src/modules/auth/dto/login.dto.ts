import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Email or phone', example: '+971501234567' })
  @IsString()
  identifier!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshDto {
  @ApiPropertyOptional({
    description: 'Refresh token — provided in body by mobile; web uses the httpOnly cookie',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
