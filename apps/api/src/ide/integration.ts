import { json, type RequestHandler } from 'express';
import { ApiError } from '../common/api-error';
import { IDE_AUTH_ROUTE, IdeAuth } from './auth';
import { IDE_AUTH, IDE_CONFIG, IdeAuthController, RateLimit, authHeaders, sameOrigin } from './auth.controller';
import type { IdeConfig } from './config';
import { MakerAccounts, assertWritable, type MakerTransport } from './maker';
import { MinioProjectObjects, type ProjectObjects } from './objects';
import { MinioProjects } from './projects';
import { IDE_PROJECTS, IdeHealthController, IdeProjectsController } from './projects.controller';
import { openIdeState } from './state';

export interface IdeIntegrationOptions {
  config: IdeConfig;
  makerFetch?: MakerTransport;
  objects?: ProjectObjects;
}

export function parseIdeJson(limit: string): RequestHandler {
  const parser = json({ limit, inflate: false });
  return (request, response, next) => parser(request, response, (error?: { status?: number }) => {
    if (error?.status === 400) return next(new ApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.'));
    next(error);
  });
}

export async function prepareIde(options: IdeIntegrationOptions) {
  const { config, makerFetch } = options;
  const objects = options.objects ?? new MinioProjectObjects(config);
  const db = await openIdeState(config.stateDir);
  const projects = new MinioProjects(db, config, objects);
  try {
    await projects.initialize();
  } catch (error) {
    db.close();
    throw error;
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    db.close();
  };
  const auth = new IdeAuth(db, config, new MakerAccounts(config, makerFetch));
  const limits = new RateLimit();
  let uploads = 0;
  const authorizeProject: RequestHandler = (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    void auth.principal(request).then((principal) => {
      const expected = request.get('x-ide-account-id');
      if (expected !== undefined && expected !== encodeURIComponent(principal.owner)) {
        throw new ApiError(409, 'ACCOUNT_CHANGED', 'The signed-in account changed. Reload and try again.');
      }
      limits.check('projects:' + principal.owner, 600);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (!request.get('authorization')) sameOrigin(request, config.publicOrigin);
        assertWritable(principal.user);
      }
      if (request.method === 'POST' || request.method === 'PUT') {
        if (uploads >= 4) throw new ApiError(503, 'UPLOAD_BUSY', 'Too many uploads are processing. Try again shortly.');
        uploads++;
        const release = () => {
          uploads--;
          response.off('finish', release);
          response.off('close', release);
        };
        if (response.destroyed) {
          release();
          return;
        }
        response.once('finish', release);
        response.once('close', release);
      }
      response.locals.idePrincipal = principal;
      next();
    }).catch(next);
  };
  return {
    close,
    config,
    controllers: [IdeAuthController, IdeHealthController, IdeProjectsController],
    providers: [
      { provide: IDE_AUTH, useValue: auth },
      { provide: IDE_CONFIG, useValue: config },
      { provide: IDE_PROJECTS, useValue: projects },
      { provide: Symbol('IDE_STATE_LIFECYCLE'), useValue: { onModuleDestroy: close } },
    ],
    authRoute: IDE_AUTH_ROUTE,
    authHeaders: authHeaders(config),
    authParser: parseIdeJson('16kb'),
    nameParser: parseIdeJson('8kb'),
    authorizeProject,
  };
}
