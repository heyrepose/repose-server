import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class WithdrawDto {
  @ApiProperty({ example: '500.00', description: 'Decimal string AED' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amountAed must be a positive decimal with up to 2 places',
  })
  amountAed!: string;
}
