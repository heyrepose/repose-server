import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/cart.dto';

@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser('id') userId: string) {
    return this.cart.getCart(userId);
  }

  @Post('items')
  add(@CurrentUser('id') userId: string, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(userId, dto.listingId);
  }

  @Delete('items/:listingId')
  @HttpCode(204)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ): Promise<void> {
    await this.cart.removeItem(userId, listingId);
  }

  @Post('items/:listingId/move-to-saved')
  moveToSaved(
    @CurrentUser('id') userId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.cart.moveToSaved(userId, listingId);
  }
}
