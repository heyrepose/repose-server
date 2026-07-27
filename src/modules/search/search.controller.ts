import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SoftAuth } from '../../common/decorators/soft-auth.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get('search')
  searchListings(@Query() query: SearchQueryDto) {
    return this.search.searchListings(query);
  }

  @SoftAuth()
  @Get('feed/home')
  homeFeed() {
    return this.search.homeFeed();
  }
}
