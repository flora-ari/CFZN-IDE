import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, raw, type RequestHandler } from 'express';
import { ArduinoLibrariesController } from './arduino-libraries/arduino-libraries.controller';
import { ARDUINO_LIBRARY_INDEX, ArduinoLibraryIndex } from './arduino-libraries/library-index';
import { unsupportedMedia } from './common/api-error';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { BINARY_MEDIA_TYPE, MAX_ARCHIVE_BYTES, OPENBLOCK_MEDIA_TYPE, projectDataDir } from './config';
import { CustomModulesController } from './custom-modules/custom-modules.controller';
import { MAX_CUSTOM_MODULE_BYTES } from './custom-modules/definition';
import { CUSTOM_MODULE_STORE, LocalModuleStore } from './custom-modules/local-module.store';
import { CUSTOM_MODULE_ROUTE, CustomModuleAccess, type CustomModuleIdentityResolver } from './custom-modules/module-access';
import { LocalProjectStore } from './projects/local-project.store';
import { PROJECT_STORE } from './projects/project-store';
import { HealthController, ProjectsController } from './projects/projects.controller';

@Module({ controllers: [HealthController, ProjectsController, CustomModulesController, ArduinoLibrariesController] })
class ApiModule {}

export interface ApiOptions {
  customModuleOrigins?: readonly string[];
  customModuleIdentity?: CustomModuleIdentityResolver;
  arduinoLibraryFetch?: typeof fetch;
}

export async function createApp(dataDir = projectDataDir(), options: ApiOptions = {}): Promise<NestExpressApplication> {
  const store = new LocalProjectStore(dataDir);
  const moduleStore = new LocalModuleStore(dataDir);
  const moduleAccess = new CustomModuleAccess(moduleStore, options.customModuleOrigins, options.customModuleIdentity);
  await Promise.all([store.initialize(), moduleStore.initialize()]);
  const app = await NestFactory.create<NestExpressApplication>(
    { module: ApiModule, providers: [
      { provide: PROJECT_STORE, useValue: store },
      { provide: CUSTOM_MODULE_STORE, useValue: moduleStore },
      { provide: ARDUINO_LIBRARY_INDEX, useValue: new ArduinoLibraryIndex(options.arduinoLibraryFetch) },
    ] },
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

  const parseModule = json({ limit: MAX_CUSTOM_MODULE_BYTES, inflate: false });
  const privateModuleAccess: RequestHandler = (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const bootstrap = request.method === 'GET' && request.path === '/';
    void moduleAccess.resolve(request, response, bootstrap).then((owner) => {
      response.locals.customModuleOwner = owner;
      if (request.method !== 'POST') return next();
      if (request.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        throw unsupportedMedia('Use application/json to create a custom module.');
      }
      return parseModule(request, response, next);
    }).catch(next);
  };
  app.use(CUSTOM_MODULE_ROUTE, privateModuleAccess);
  return app;
}
