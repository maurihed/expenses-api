import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({ imports: [HealthModule, PrismaModule, AccountsModule] })
export class AppModule {}
