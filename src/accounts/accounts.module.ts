import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { MarketModule } from '../market/market.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { HoldingsController } from './holdings.controller';
import { HoldingsService } from './holdings.service';

@Module({
  imports: [MarketModule, FxModule],
  controllers: [AccountsController, HoldingsController],
  providers: [AccountsService, HoldingsService],
})
export class AccountsModule {}
