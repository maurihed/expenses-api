import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const DEFAULT_CORS_ORIGINS = [
  'https://expenses-peach.vercel.app',
  'https://expenses-v2-jet.vercel.app',
  'https://expenses.maurihed.com',
  'http://localhost:5173',
  'http://localhost:5174',
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : DEFAULT_CORS_ORIGINS;
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}
bootstrap();
