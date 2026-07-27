export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

export interface SignedUpload {
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  uploadUrl: string;
}

/**
 * Swappable image storage. MVP = Cloudinary signed direct upload (client uploads
 * straight to the CDN; the API only signs and later validates the returned URL).
 * Phase 2 target is S3 + CloudFront behind the same interface.
 *
 * @see https://cloudinary.com/documentation/client_side_uploading
 */
export interface ImageStorageProvider {
  /** Throws if credentials are missing/misconfigured. */
  assertConfigured(): void;
  /** Produces short-lived signed params for a direct browser → Cloudinary upload. */
  createSignedUpload(subfolder: string, publicId: string): SignedUpload;
  /** Validates that a client-reported URL belongs to our Cloudinary cloud + folder. */
  isValidUrl(url: string, listingFolderHint?: string): boolean;
}
