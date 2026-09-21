import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MarketService } from './market.service';

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/;

@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('search')
  search(@Query('q') q?: string, @Query('limit') limit?: string) {
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 25) : 10;
    return this.market.search(q ?? '', take);
  }

  @Get('quote')
  quote(@Query('symbol') symbol?: string) {
    const normalized = (symbol ?? '').trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(normalized)) {
      throw new BadRequestException('Invalid symbol');
    }
    return this.market.getQuote(normalized);
  }
}
