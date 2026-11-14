import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, raw, type RequestHandler } from 'express';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { BINARY_MEDIA_TYPE, MAX_ARCHIVE_BYTES, OPENBLOCK_MEDIA_TYPE, projectDataDir } from './config';
import { LocalProjectStore } from './projects/local-project.store';
import { PROJECT_STORE } from './projects/project-store';
import { HealthController, ProjectsController } from './projects/projects.controller';

@Module({ controllers: [HealthController, ProjectsController] })
class ApiModule {}

export async function createApp(dataDir = projectDataDir()): Promise<NestExpressApplication> {
  const store = new LocalProjectStore(dataDir);
  await store.initialize();
  const app = await NestFactory.create<NestExpressApplication>(
    { module: ApiModule, providers: [{ provide: PROJECT_STORE, useValue: store }] },
    { bodyParser: false },
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  const express = app.getHttpAdapter().getInstance();
  express.disable('etag');
  express.disable('x-powered-by');

  const parseName = json({ limit: '8kb', inflate: false });
  const parseArchive = raw({
    type: [BINARY_MEDIA_TYPE, OPENBLOCK_MEDIA_TYPE],
    limit: MAX_ARCHIVE_BYTES,
    inflate: false,
  });
  const parseBody: RequestHandler = (request, response, next) => {
    if (request.method === 'PATCH') return parseName(request, response, next);
    if (request.method === 'PUT') return parseArchive(request, response, next);
    next();
  };
  app.use('/api/v1/projects', parseBody);
  return app;
}
