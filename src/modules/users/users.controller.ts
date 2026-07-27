import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ListSellerListingsDto } from '../listings/dto/listings.dto';
import { ListingsService } from '../listings/listings.service';
import { FcmTokenDto } from './dto/fcm-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly listings: ListingsService,
  ) {}

  @ApiBearerAuth()
  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.users.getMe(userId);
  }

  @ApiBearerAuth()
  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(userId, dto);
  }

  @ApiBearerAuth()
  @Post('me/fcm-token')
  @HttpCode(204)
  async addFcmToken(
    @CurrentUser('id') userId: string,
    @Body() dto: FcmTokenDto,
  ): Promise<void> {
    await this.users.addFcmToken(userId, dto.token);
  }

  @ApiBearerAuth()
  @Delete('me/fcm-token')
  @HttpCode(204)
  async removeFcmToken(
    @CurrentUser('id') userId: string,
    @Body() dto: FcmTokenDto,
  ): Promise<void> {
    await this.users.removeFcmToken(userId, dto.token);
  }

  @Public()
  @Get('by-username/:username')
  getByUsername(@Param('username') username: string) {
    return this.users.getByUsername(username);
  }

  @Public()
  @Get(':id/listings')
  listSellerListings(
    @Param('id') id: string,
    @Query() query: ListSellerListingsDto,
  ) {
    return this.listings.listBySeller(id, query);
  }

  @Public()
  @Get(':id/reviews')
  listReviews(
    @Param('id') id: string,
    @Query() query: ListSellerListingsDto,
  ) {
    return this.users.listReviews(id, {
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Public()
  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.users.getPublicProfile(id);
  }
}
