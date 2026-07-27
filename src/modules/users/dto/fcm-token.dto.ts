import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class FcmTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4096)
  token!: string;
}
