import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ARDUINO_LIBRARY_INDEX, ArduinoLibraryIndex } from './library-index';

@Controller('arduino/libraries')
export class ArduinoLibrariesController {
  constructor(@Inject(ARDUINO_LIBRARY_INDEX) private readonly index: ArduinoLibraryIndex) {}

  @Get('search')
  async search(@Query('q') query: unknown) {
    return { items: await this.index.search(query) };
  }
}
