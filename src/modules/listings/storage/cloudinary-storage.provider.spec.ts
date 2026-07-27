import { parseCloudinaryUrl } from './cloudinary-storage.provider';

describe('parseCloudinaryUrl', () => {
  it('parses the Cloudinary API environment variable format', () => {
    const parsed = parseCloudinaryUrl(
      'cloudinary://123456789012345:AbCdEfGhIjKlMnOp@my-cloud',
    );
    expect(parsed).toEqual({
      apiKey: '123456789012345',
      apiSecret: 'AbCdEfGhIjKlMnOp',
      cloudName: 'my-cloud',
    });
  });

  it('rejects garbage', () => {
    expect(parseCloudinaryUrl('not-a-url')).toBeNull();
    expect(parseCloudinaryUrl('')).toBeNull();
  });
});
