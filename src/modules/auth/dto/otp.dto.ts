import { ApiProperty } from '@nestjs/swagger';
import { OtpPurpose } from '@prisma/client';
import {
  IsEnum,
  IsPhoneNumber,
  IsString,
  Length,
} from 'class-validator';

export class OtpRequestDto {
  @ApiProperty({ example: '+971501234567' })
  @IsPhoneNumber()
  phone!: string;

  @ApiProperty({ enum: OtpPurpose, example: OtpPurpose.SIGNUP })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;
}

export class OtpVerifyDto {
  @ApiProperty({ example: '+971501234567' })
  @IsPhoneNumber()
  phone!: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @Length(6, 6)
  code!: string;

  @ApiProperty({ enum: OtpPurpose, example: OtpPurpose.SIGNUP })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;
}
