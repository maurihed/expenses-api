import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { FxService } from './fx.service';

@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rate')
  getRate(@Query('base') base?: string, @Query('quote') quote?: string) {
    return this.fx.getRate(base ?? 'USD', quote ?? 'MXN');
  }

  @Post('refresh')
  refresh(@Body() body: { base?: string; quote?: string } = {}) {
    return this.fx.refresh(body.base ?? 'USD', body.quote ?? 'MXN');
  }
}
