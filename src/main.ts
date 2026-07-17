import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const configuredOrigins = configService
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const fallbackOrigins = [
    configService.get<string>('FRONTEND_ADMIN_URL', ''),
    configService.get<string>('FRONTEND_FACILITY_URL', ''),
  ].filter(Boolean);
  const allowedOrigins =
    configuredOrigins.length > 0 ? configuredOrigins : fallbackOrigins;

  app.enableCors({
    origin:
      allowedOrigins.length > 0
        ? allowedOrigins
        : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(configService.get<number>('PORT', 4000));
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Backend startup failed: ${message}`);
  if (error instanceof Error && error.stack) {
    logger.error(error.stack);
  }
  process.exit(1);
});
