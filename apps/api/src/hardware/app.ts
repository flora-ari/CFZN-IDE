import 'reflect-metadata';
import { Body, Controller, Get, HttpCode, Inject, Module, Param, Post, Query } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type RequestHandler } from 'express';
import { ApiExceptionFilter } from '../common/api-exception.filter';
import type { HardwareConfig } from './config';
import { HardwareExecutor, type ExecutorOptions } from './executor';
import { HardwareOwnership } from './ownership';
import { SerialDirectory } from './serial-directory';
import { loadSerialDriver } from './serial-driver';
import { SerialManager } from './serial-manager';
import { SERIAL_MANAGER, SerialController } from './serial-controller';
import { listLocalPorts } from './ports';

const EXECUTOR = Symbol('HARDWARE_EXECUTOR');
@Controller()
class HardwareController {
  constructor(@Inject(EXECUTOR) private readonly executor: HardwareExecutor, @Inject(SERIAL_MANAGER) private readonly serial: SerialManager) {}
  @Get('capabilities') capabilities() { return { ...this.executor.capabilities(), serial: this.serial.capabilities() }; }
  @Get('ports') ports() { return this.executor.ports(); }
  @Post('builds') @HttpCode(202) build(@Body() body: unknown) { return this.executor.startBuild(body); }
  @Post('uploads') @HttpCode(202) upload(@Body() body: unknown) { return this.executor.startUpload(body); }
  @Get('jobs/:id') read(@Param('id') id: string, @Query('afterLog') cursor: unknown) { return this.executor.read(id, cursor); }
  @Post('jobs/:id/cancel') @HttpCode(200) cancel(@Param('id') id: string, @Body() body: unknown) { return this.executor.cancel(id, body); }
}
@Module({ controllers: [HardwareController, SerialController] })
class HardwareModule {}

export async function createHardwareApp(config: HardwareConfig, options: ExecutorOptions = {}): Promise<NestExpressApplication> {
  const native = options.serialDriver === undefined ? await loadSerialDriver() : { driver: options.serialDriver ?? undefined };
  const ownership = options.ownership ?? new HardwareOwnership();
  const directory = options.directory ?? new SerialDirectory(options.ports ?? native.driver?.list ?? listLocalPorts);
  const executor = await HardwareExecutor.create(config, { ...options, ownership, directory });
  const serial = new SerialManager(directory, ownership, native.driver, native.reason, options.serialOptions);
  const app = await NestFactory.create<NestExpressApplication>({ module: HardwareModule, providers: [
    { provide: EXECUTOR, useValue: executor },
    { provide: SERIAL_MANAGER, useValue: serial },
    { provide: 'HARDWARE_SHUTDOWN', useValue: { onModuleDestroy: async () => { await executor.close(); await serial.shutdown(); } } },
  ] }, { bodyParser: false });
  app.setGlobalPrefix('api/v1/hardware');
  app.useGlobalFilters(new ApiExceptionFilter());
  const express = app.getHttpAdapter().getInstance();
  express.disable('etag'); express.disable('x-powered-by');
  const origins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', ...config.allowedOrigins]);
  const serialPath = (path: string) => path.toLowerCase().replace(/\/+$/, '');
  const isSerialPath = (path: string) => serialPath(path) === '/api/v1/hardware/serial' || serialPath(path).startsWith('/api/v1/hardware/serial/');
  const access: RequestHandler = (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const hostname = request.hostname;
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use the local loopback executor address.' } }); return;
    }
    const origin = request.get('origin');
    const isSerial = isSerialPath(request.path);
    if (isSerial && (!origin || !origins.has(origin))) {
      response.status(403).json({ error: { code: 'SERIAL_ORIGIN_FORBIDDEN', message: 'Use an exact allowed Origin for serial requests.' } }); return;
    }
    if (origin && !origins.has(origin)) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'This origin is not configured for the local executor.' } }); return;
    }
    if (origin) response.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': isSerial ? 'Content-Type,X-CCraft-Serial-Token' : 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true' });
    if (request.method === 'OPTIONS') { response.status(204).end(); return; }
    if (isSerial && !(request.method === 'POST' && serialPath(request.path) === '/api/v1/hardware/serial/clients')) {
      try { serial.client(origin!, request.get('X-CCraft-Serial-Token')); }
      catch (cause) { next(cause); return; }
    }
    if (request.method === 'POST' && request.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Hardware operations require application/json.' } }); return;
    }
    next();
  };
  app.use(access);
  const parseSerial = json({ limit: '96kb', inflate: false });
  const parseGeneral = json({ limit: '7mb', inflate: false });
  const parseBody: RequestHandler = (request, response, next) =>
    isSerialPath(request.path) ? parseSerial(request, response, next) : parseGeneral(request, response, next);
  app.use(parseBody);
  return app;
}
