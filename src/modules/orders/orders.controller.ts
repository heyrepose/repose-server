import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateOrderDto,
  DisputeOrderDto,
  ListOrdersQueryDto,
  ShipOrderDto,
} from './dto/orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateOrderDto) {
    return this.orders.create(userId, dto);
  }

  @Get()
  list(@CurrentUser('id') userId: string, @Query() query: ListOrdersQueryDto) {
    return this.orders.list(userId, query);
  }

  @Get(':id')
  getOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.getById(userId, id);
  }

  @Patch(':id/ship')
  ship(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShipOrderDto,
  ) {
    return this.orders.ship(userId, id, dto);
  }

  @Patch(':id/confirm-receipt')
  confirmReceipt(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.confirmReceipt(userId, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.cancel(userId, id);
  }

  @Post(':id/dispute')
  dispute(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisputeOrderDto,
  ) {
    return this.orders.dispute(userId, id, dto);
  }
}
