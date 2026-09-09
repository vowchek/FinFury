import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** Логгер без шумных RouterExplorer (маршруты) для компактного dev-вывода. */
class CompactLogger extends ConsoleLogger {
  log(message: any, context?: string) {
    if (context === 'RouterExplorer') return;
    super.log(message, context);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new CompactLogger(),
  });

  app.setGlobalPrefix('api/v1');
  // CORS: список разрешённых origin'ов через запятую (env CORS_ORIGIN).
  // По умолчанию — dev-порты web (5173/5174), чтобы фронт работал из любого запуска.
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API запущен на http://localhost:${port}/api/v1`);
}

void bootstrap();