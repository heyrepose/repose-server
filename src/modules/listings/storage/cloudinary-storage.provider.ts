import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { AppConfig } from '../../../config/configuration';
import { DomainException } from '../../../common/errors/domain-exception';
import {
  ImageStorageProvider,
  SignedUpload,
} from './image-storage.interface';

/**
 * Cloudinary signed upload (server signs, browser uploads directly).
 * Prefer `CLOUDINARY_URL` (API environment variable from the console):
 *   cloudinary://<api_key>:<api_secret>@<cloud_name>
 * @see https://cloudinary.com/documentation/client_side_uploading
 * @see https://cloudinary.com/documentation/index
 */
@Injectable()
export class CloudinaryStorageProvider
  implements ImageStorageProvider, OnModuleInit
{
  private readonly logger = new Logger(CloudinaryStorageProvider.name);
  private cloudName = '';
  private apiKey = '';
  private apiSecret = '';

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    this.resolveCredentials();
    if (this.cloudName && this.apiKey && this.apiSecret) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        secure: true,
      });
      this.logger.log(`Cloudinary configured for cloud="${this.cloudName}"`);
    } else {
      this.logger.warn(
        'Cloudinary credentials incomplete — photo uploads will fail until CLOUDINARY_URL (or cloud_name/api_key/api_secret) is set',
      );
    }
  }

  private get baseFolder(): string {
    return this.config.get('CLOUDINARY_UPLOAD_FOLDER', { infer: true });
  }

  private resolveCredentials(): void {
    const url = this.config.get('CLOUDINARY_URL', { infer: true });
    if (url) {
      const parsed = parseCloudinaryUrl(url);
      if (parsed) {
        this.cloudName = parsed.cloudName;
        this.apiKey = parsed.apiKey;
        this.apiSecret = parsed.apiSecret;
        return;
      }
      this.logger.warn('CLOUDINARY_URL is set but could not be parsed');
    }

    this.cloudName = this.config.get('CLOUDINARY_CLOUD_NAME', { infer: true }) ?? '';
    this.apiKey = this.config.get('CLOUDINARY_API_KEY', { infer: true }) ?? '';
    this.apiSecret = this.config.get('CLOUDINARY_API_SECRET', { infer: true }) ?? '';
  }

  assertConfigured(): void {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new DomainException(
        'LISTING_STORAGE_NOT_CONFIGURED',
        'Cloudinary is not configured. Set CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME + API_KEY + API_SECRET).',
        503,
      );
    }
  }

  createSignedUpload(subfolder: string, publicId: string): SignedUpload {
    this.assertConfigured();

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `${this.baseFolder}/${subfolder}`.replace(/\/+/g, '/');

    // Signature must include every parameter sent with the upload except
    // file / cloud_name / resource_type / api_key.
    // @see https://cloudinary.com/documentation/authentication_signatures
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder, public_id: publicId },
      this.apiSecret,
    );

    return {
      provider: 'cloudinary',
      cloudName: this.cloudName,
      apiKey: this.apiKey,
      timestamp,
      signature,
      folder,
      publicId,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
    };
  }

  isValidUrl(url: string, listingFolderHint?: string): boolean {
    if (!this.cloudName) return false;
    const prefix = `https://res.cloudinary.com/${this.cloudName}/`;
    if (!url.startsWith(prefix)) return false;
    if (listingFolderHint && !url.includes(listingFolderHint)) return false;
    return true;
  }
}

/** Parses `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`. */
export function parseCloudinaryUrl(raw: string): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} | null {
  try {
    const trimmed = raw.trim();
    const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(trimmed);
    if (!match) return null;
    const [, apiKey, apiSecret, cloudName] = match;
    if (!apiKey || !apiSecret || !cloudName) return null;
    return { apiKey, apiSecret, cloudName };
  } catch {
    return null;
  }
}
