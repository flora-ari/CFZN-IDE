import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { moduleFromBody } from './definition';
import { CUSTOM_MODULE_STORE, LocalModuleStore } from './local-module.store';
import type { OwnerScope } from './module-access';

type ScopedResponse = Response<unknown, { customModuleOwner: OwnerScope }>;

@Controller('custom-modules')
export class CustomModulesController {
  constructor(@Inject(CUSTOM_MODULE_STORE) private readonly store: LocalModuleStore) {}

  @Get()
  async list(@Res({ passthrough: true }) response: ScopedResponse) {
    return { items: await this.store.list(response.locals.customModuleOwner) };
  }

  @Post()
  async create(@Body() body: unknown, @Res({ passthrough: true }) response: ScopedResponse) {
    return { item: await this.store.create(response.locals.customModuleOwner, moduleFromBody(body)) };
  }

  @Get(':id')
  async read(@Param('id') id: string, @Res({ passthrough: true }) response: ScopedResponse) {
    return { item: await this.store.read(response.locals.customModuleOwner, id) };
  }

  @Delete(':id')
  @HttpCode(204)
  async hide(@Param('id') id: string, @Res({ passthrough: true }) response: ScopedResponse) {
    await this.store.hide(response.locals.customModuleOwner, id);
  }
}
