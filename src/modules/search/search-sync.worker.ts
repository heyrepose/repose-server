import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { redisConnectionFromUrl } from '../../redis/redis-connection';
import { SEARCH_SYNC_QUEUE } from './search.constants';
import { SearchSyncJob } from './search-sync.service';
import { toSearchDoc } from './search.mapper';
import {
  SEARCH_PROVIDER,
  SearchProvider,
} from './search-provider.interface';

/**
 * Consumes search-sync jobs. Always re-reads the listing from the DB so the
 * indexed document reflects the *current* status: ACTIVE -> upsert, anything
 * else (or deleted) -> remove from the index.
 */
@Injectable()
export class SearchSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchSyncWorker.name);
  private worker!: Worker<SearchSyncJob>;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
  ) {}

  onModuleInit(): void {
    const url = this.config.get('REDIS_URL', { infer: true });
    this.worker = new Worker<SearchSyncJob>(
      SEARCH_SYNC_QUEUE,
      (job) => this.process(job),
      {
        connection: redisConnectionFromUrl(url),
        concurrency: 5,
      },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`search-sync job ${job?.id} failed: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<SearchSyncJob>): Promise<void> {
    const { listingId } = job.data;
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: { select: { slug: true } },
      },
    });

    if (!listing || listing.status !== 'ACTIVE') {
      await this.search.remove(listingId);
      return;
    }
    await this.search.upsert(toSearchDoc(listing));
  }
}
