import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { AppConfig } from '../../config/configuration';
import { SEARCH_SYNC_QUEUE } from './search.constants';

export interface SearchSyncJob {
  listingId: string;
  reason: 'changed' | 'removed';
}

/**
 * Owns the BullMQ producer for the search-sync queue. Enqueues one job per
 * listing lifecycle change; the worker re-reads current DB state so an
 * out-of-order job never indexes stale status.
 */
@Injectable()
export class SearchSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchSyncService.name);
  private queue!: Queue<SearchSyncJob>;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    this.queue = new Queue<SearchSyncJob>(SEARCH_SYNC_QUEUE, {
      connection: { url: this.config.get('REDIS_URL', { infer: true }) },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async enqueue(job: SearchSyncJob): Promise<void> {
    try {
      await this.queue.add('sync', job, {
        jobId: `${job.reason}:${job.listingId}:${Date.now()}`,
      });
    } catch (err) {
      this.logger.warn(`Failed to enqueue search sync: ${(err as Error).message}`);
    }
  }
}
