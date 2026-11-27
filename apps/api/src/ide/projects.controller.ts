import {
  Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Put,
  Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { ApiError, invalid, unsupportedMedia } from '../common/api-error';
import { BINARY_MEDIA_TYPE, OPENBLOCK_MEDIA_TYPE } from '../config';
import { validateProjectArchive } from '../projects/project-archive.validator';
import { revisionHeader } from '../projects/project-input';
import { attachmentName, mediaType, onlyName } from '../projects/projects.controller';
import type { IdePrincipal } from './auth';
import { IDE_CONFIG } from './auth.controller';
import { MAX_IDE_ARCHIVE_BYTES, type IdeConfig } from './config';
import type { MinioProjects } from './projects';

export const IDE_PROJECTS = Symbol('IDE_PROJECTS');

function owner(response: Response): string {
  return (response.locals.idePrincipal as IdePrincipal).owner;
}

function revision(value: string | undefined, required: true): number;
function revision(value: string | undefined, required: false): number | undefined;
function revision(value: string | undefined, required: boolean): number | undefined {
  try {
    return required ? revisionHeader(value, true) : revisionHeader(value, false);
  } catch (error) {
    if (value === undefined) throw error;
    throw new ApiError(400, 'INVALID_IF_MATCH', 'If-Match must contain a single quoted positive revision.');
  }
}

function etag(response: Response, value: number): void {
  response.set('ETag', '"' + value + '"');
}

@Controller('health')
export class IdeHealthController {
  constructor(@Inject(IDE_PROJECTS) private readonly projects: MinioProjects) {}

  @Get()
  health() {
    return this.projects.health();
  }
}

@Controller('projects')
export class IdeProjectsController {
  constructor(
    @Inject(IDE_PROJECTS) private readonly projects: MinioProjects,
    @Inject(IDE_CONFIG) private readonly config: IdeConfig,
  ) {}

  @Get()
  list(@Res({ passthrough: true }) response: Response) {
    return { items: this.projects.list(owner(response)) };
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_IDE_ARCHIVE_BYTES + 1, files: 1, fields: 1, fieldSize: 2048 },
  }))
  async create(
    @Req() request: Request,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (mediaType(request) !== 'multipart/form-data') throw unsupportedMedia('Use multipart/form-data to create a project.');
    if (!file) throw invalid('The multipart file field is required.', 'file');
    const name = onlyName(body);
    await this.validate(file.buffer);
    const project = await this.projects.create(owner(response), name, file.buffer);
    etag(response, project.revision);
    response.set('Location', '/api/v1/projects/' + project.id);
    return { project };
  }

  @Get(':id')
  read(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const project = this.projects.read(owner(response), id);
    etag(response, project.revision);
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
    if (mediaType(request) !== 'application/json') throw unsupportedMedia('Use application/json to rename a project.');
    const project = await this.projects.rename(owner(response), id, revision(ifMatch, false), onlyName(body));
    etag(response, project.revision);
    return { project };
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.projects.delete(owner(response), id, revision(ifMatch, false));
  }

  @Get(':id/content')
  async content(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const { project, archive } = await this.projects.readContent(owner(response), id, revision(ifMatch, false));
    etag(response, project.revision);
    response.status(200).set({
      'Content-Type': OPENBLOCK_MEDIA_TYPE,
      'Content-Disposition': attachmentName(project.name),
      'Content-Length': String(project.size),
      'X-Content-Type-Options': 'nosniff',
    });
    await pipeline(archive, response);
  }

  @Put(':id/content')
  async replace(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const expected = revision(ifMatch, true);
    const media = mediaType(request);
    if (media !== OPENBLOCK_MEDIA_TYPE && media !== BINARY_MEDIA_TYPE) {
      throw unsupportedMedia('Use ' + OPENBLOCK_MEDIA_TYPE + ' to upload project content.');
    }
    const archive = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    await this.validate(archive);
    const project = await this.projects.replace(owner(response), id, expected, archive);
    etag(response, project.revision);
    return { project };
  }

  private async validate(archive: Buffer): Promise<void> {
    if (archive.length === 0) throw new ApiError(400, 'EMPTY_PROJECT', 'The project archive is empty.');
    await validateProjectArchive(archive, this.config.maxBytes);
  }
}
