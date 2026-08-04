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
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { SoftAuth } from '../../common/decorators/soft-auth.decorator';
import {
  ConfirmPhotosDto,
  CreateListingDto,
  ListSellerListingsDto,
  PublishListingDto,
  ReportListingDto,
  UpdateListingDto,
} from './dto/listings.dto';
import { ListingsService } from './listings.service';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @ApiBearerAuth()
  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateListingDto,
  ) {
    return this.listings.createDraft(userId, dto);
  }

  @ApiBearerAuth()
  @Get('saved')
  listSaved(
    @CurrentUser('id') userId: string,
    @Query() query: ListSellerListingsDto,
  ) {
    return this.listings.listSaved(userId, {
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @ApiBearerAuth()
  @Post(':id/photos/upload-url')
  @HttpCode(200)
  createUploadUrl(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.listings.createUploadUrl(userId, id);
  }

  @ApiBearerAuth()
  @Post(':id/photos')
  @HttpCode(200)
  confirmPhotos(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ConfirmPhotosDto,
  ) {
    return this.listings.confirmPhotos(userId, id, dto);
  }

  @ApiBearerAuth()
  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listings.update(userId, id, dto);
  }

  @ApiBearerAuth()
  @Patch(':id/publish')
  publish(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: PublishListingDto,
  ) {
    return this.listings.publish(userId, id, dto);
  }

  @ApiBearerAuth()
  @Patch(':id/unpublish')
  unpublish(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.listings.unpublish(userId, id);
  }

  @ApiBearerAuth()
  @Post(':id/relist')
  @HttpCode(201)
  relist(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.listings.relist(userId, id);
  }

  @SoftAuth()
  @Get(':id/similar')
  listSimilar(
    @Param('id') id: string,
    @Query() query: ListSellerListingsDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.listings.listSimilar(id, {
      cursor: query.cursor,
      limit: query.limit,
      viewerId: user?.id,
    });
  }

  @SoftAuth()
  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.listings.getById(id, user?.id);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.listings.remove(userId, id);
  }

  @ApiBearerAuth()
  @Post(':id/report')
  @HttpCode(200)
  report(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReportListingDto,
  ) {
    return this.listings.report(userId, id, dto);
  }

  @ApiBearerAuth()
  @Post(':id/save')
  @HttpCode(204)
  async save(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.listings.save(userId, id);
  }

  @ApiBearerAuth()
  @Delete(':id/save')
  @HttpCode(204)
  async unsave(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.listings.unsave(userId, id);
  }
}
