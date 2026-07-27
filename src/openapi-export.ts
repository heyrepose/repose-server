import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

/**
 * Exports the OpenAPI spec to apps/api/openapi.json without starting the HTTP
 * server. `packages/api-types` generates its TS types from this file so web
 * builds against the exact contract. Run: pnpm --filter @repose/api openapi:export
 */
async function exportSpec(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  const config = new DocumentBuilder()
    .setTitle('Repose API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const outPath = join(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));
  console.log(`OpenAPI spec written to ${outPath}`);
  await app.close();
}

void exportSpec();
