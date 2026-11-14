import {
  Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Put,
  Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { invalid, unsupportedMedia } from '../common/api-error';
import { BINARY_MEDIA_TYPE, MAX_ARCHIVE_BYTES, OPENBLOCK_MEDIA_TYPE } from '../config';
import { validateProjectArchive } from './project-archive.validator';
import { projectId, projectName, revisionHeader } from './project-input';
import { PROJECT_STORE, type Project, type ProjectStore } from './project-store';

function mediaType(request: Request): string | undefined {
  return request.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
}

function onlyName(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'name')) {
    throw invalid('Provide a single name field.', 'name');
  }
  return projectName((body as { name?: unknown }).name);
}

function setRevision(response: Response, project: Project): void {
  response.set({ ETag: `"${project.revision}"`, 'Cache-Control': 'no-store' });
}

function attachmentName(name: string): string {
  const safeName = Buffer.from(name.replace(/[/\\]/g, '_'), 'utf8').toString('utf8');
  const encoded = encodeURIComponent(`${safeName}.ob`).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="project.ob"; filename*=UTF-8''${encoded}`;
}

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', storage: 'local', auth: 'none' };
  }
}

@Controller('projects')
export class ProjectsController {
  constructor(@Inject(PROJECT_STORE) private readonly store: ProjectStore) {}

  @Get()
  async list() {
    return { items: await this.store.list() };
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    // Busboy marks the file truncated when it reaches fileSize, so permit the inclusive maximum.
    limits: { fileSize: MAX_ARCHIVE_BYTES + 1, files: 1, fields: 1, fieldSize: 2048 },
  }))
  async create(
    @Req() request: Request,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (mediaType(request) !== 'multipart/form-data') throw unsupportedMedia('Use multipart/form-data to create a project.');
    const name = onlyName(body);
    if (!file) throw invalid('The multipart file field is required.', 'file');
    await validateProjectArchive(file.buffer);
    const project = await this.store.create(name, file.buffer);
    setRevision(response, project);
    response.set('Location', `/api/v1/projects/${project.id}`);
    return { project };
  }

  @Get(':id')
  async read(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const project = await this.store.read(projectId(id));
    setRevision(response, project);
    return { project };
  }

  @Patch(':id')
  async rename(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const key = projectId(id);
    const revision = revisionHeader(ifMatch, true);
    if (mediaType(request) !== 'application/json') throw unsupportedMedia('Use application/json to rename a project.');
    const project = await this.store.rename(key, revision, onlyName(body));
    setRevision(response, project);
    return { project };
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @Headers('if-match') ifMatch: string | undefined) {
    await this.store.delete(projectId(id), revisionHeader(ifMatch, true));
  }

  @Get(':id/content')
  async readContent(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const { project, archive } = await this.store.readContent(projectId(id), revisionHeader(ifMatch, false));
    setRevision(response, project);
    response.status(200).set({
      'Content-Type': OPENBLOCK_MEDIA_TYPE,
      'Content-Disposition': attachmentName(project.name),
      'Content-Length': String(archive.length),
    }).end(archive);
  }

  @Put(':id/content')
  async replaceContent(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const key = projectId(id);
    const revision = revisionHeader(ifMatch, true);
    const media = mediaType(request);
    if (media !== BINARY_MEDIA_TYPE && media !== OPENBLOCK_MEDIA_TYPE) {
      throw unsupportedMedia(`Use ${BINARY_MEDIA_TYPE} or ${OPENBLOCK_MEDIA_TYPE} to upload project content.`);
    }
    const archive = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    await validateProjectArchive(archive);
    const project = await this.store.replaceContent(key, revision, archive);
    setRevision(response, project);
    return { project };
  }
}
