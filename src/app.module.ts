import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { DebtsModule } from './debts/debts.module';
import { FxModule } from './fx/fx.module';
import { HealthModule } from './health/health.module';
import { PersonsModule } from './persons/persons.module';
import { PrismaModule } from './prisma/prisma.module';
import { RecurringModule } from './recurring/recurring.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    PersonsModule,
    RecurringModule,
    FxModule,
    DebtsModule,
  ],
})
export class AppModule {}
