import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [ListingsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
