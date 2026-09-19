import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RecurringService } from './recurring.service';

const ONE_HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class RecurringScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurringScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly recurring: RecurringService) {}

  onModuleInit() {
    // The engine is global: running it during e2e would materialize rules
    // created by other suites and pollute their assertions/cleanup.
    if (process.env.NODE_ENV === 'test') return;

    this.run();
    this.timer = setInterval(() => this.run(), ONE_HOUR_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private run() {
    void this.recurring.runDue(new Date()).catch((error) => {
      this.logger.error(
        'Recurring runDue failed',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }
}
