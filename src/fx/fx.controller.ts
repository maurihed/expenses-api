import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { FxService } from './fx.service';
import { SUPPORTED_PAIRS } from './fx.types';

const CURRENCY_CODE = /^[A-Z]{3}$/;

function normalizePair(base?: string, quote?: string): { base: string; quote: string } {
  const normalizedBase = (base ?? 'USD').toUpperCase();
  const normalizedQuote = (quote ?? 'MXN').toUpperCase();
  if (
    !CURRENCY_CODE.test(normalizedBase) ||
    !CURRENCY_CODE.test(normalizedQuote) ||
    !SUPPORTED_PAIRS.has(`${normalizedBase}:${normalizedQuote}`)
  ) {
    throw new BadRequestException(
      `Unsupported currency pair ${normalizedBase}/${normalizedQuote}`,
    );
  }
  return { base: normalizedBase, quote: normalizedQuote };
}

@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rate')
  getRate(@Query('base') base?: string, @Query('quote') quote?: string) {
    const pair = normalizePair(base, quote);
    return this.fx.getRate(pair.base, pair.quote);
  }

  @Post('refresh')
  refresh(@Body() body: { base?: string; quote?: string } = {}) {
    const pair = normalizePair(body.base, body.quote);
    return this.fx.refresh(pair.base, pair.quote);
  }
}
