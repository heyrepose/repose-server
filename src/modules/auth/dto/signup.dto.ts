import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SignupDto {
  @ApiPropertyOptional({ example: '+971501234567' })
  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'phone must be a valid phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'amara@repose.ae' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Amara Studio' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Optional for phone-only OTP accounts' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;
}
