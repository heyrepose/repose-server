import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { CloudinaryStorageProvider } from './storage/cloudinary-storage.provider';
import { IMAGE_STORAGE } from './storage/image-storage.interface';

@Module({
  controllers: [ListingsController],
  providers: [
    ListingsService,
    CloudinaryStorageProvider,
    { provide: IMAGE_STORAGE, useExisting: CloudinaryStorageProvider },
  ],
  exports: [ListingsService],
})
export class ListingsModule {}
