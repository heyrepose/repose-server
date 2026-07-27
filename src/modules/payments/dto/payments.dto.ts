import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export class DevConfirmPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  orderId!: string;

  @ApiProperty({ enum: ['SUCCESS', 'DECLINED'] })
  @IsIn(['SUCCESS', 'DECLINED'])
  outcome!: 'SUCCESS' | 'DECLINED';
}
