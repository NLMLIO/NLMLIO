import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ErrorCode } from '@nlmlio/shared';
import { appError } from './app-error';
import { HttpExceptionFilter } from './http-exception.filter';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        appError(
          ErrorCode.VALIDATION_FAILED,
          Object.fromEntries(
            errors.map((error) => [
              error.property,
              Object.values(error.constraints ?? {}).join(', '),
            ]),
          ),
        ),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}
