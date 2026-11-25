import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SerialManager } from './serial-manager';
import { serialObject, serialQueryInteger } from './serial-input';

export const SERIAL_MANAGER = Symbol('SERIAL_MANAGER');
@Controller('serial')
export class SerialController {
  constructor(@Inject(SERIAL_MANAGER) private readonly manager: SerialManager) {}
  private client(request: Request) { return this.manager.client(request.get('origin')!, request.get('X-CCraft-Serial-Token')); }

  @Post('clients') create(@Req() request: Request, @Body() body: unknown) {
    return this.manager.createClient(request.get('origin')!, body);
  }
  @Get('devices') devices(@Req() request: Request) { return this.manager.devices(this.client(request)); }
  @Post('sessions') open(@Req() request: Request, @Body() body: unknown) { return this.manager.open(this.client(request), body); }
  @Get('sessions/:id') status(@Req() request: Request, @Param('id') id: string) { return this.manager.status(this.client(request), id); }
  @Get('sessions/:id/read') async read(
    @Req() request: Request, @Res({ passthrough: true }) response: Response,
    @Param('id') id: string, @Query() query: unknown,
  ) {
    const client = this.client(request);
    const fields = serialObject(query, ['after', 'waitMs']);
    const after = serialQueryInteger(fields.after, 'after', Number.MAX_SAFE_INTEGER);
    const waitMs = serialQueryInteger(fields.waitMs, 'waitMs', 15000, 15000);
    const abort = new AbortController();
    const disconnected = () => { if (!response.writableEnded) abort.abort(); };
    response.on('close', disconnected);
    try { return await this.manager.read(client, id, after, waitMs, abort.signal); }
    finally { response.off('close', disconnected); }
  }
  @Post('sessions/:id/write') @HttpCode(200) write(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.manager.write(this.client(request), id, body);
  }
  @Post('sessions/:id/close') @HttpCode(200) close(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.manager.close(this.client(request), id, body);
  }
}
