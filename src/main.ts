import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3000'];

  // Temporary diagnostic log — shows exactly what's being compared,
  // including any hidden characters (wrapped in brackets, with length).
  // Safe to remove once CORS is confirmed working.
  console.log(
    'CORS allowed origins:',
    allowedOrigins.map(o => `[${o}] (length: ${o.length})`),
  );

  app.enableCors({
    origin: (origin, callback) => {
      console.log('Incoming request Origin header:', origin ? `[${origin}] (length: ${origin.length})` : origin);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('REJECTED — no exact match in allowedOrigins');
        callback(null, false);
      }
    },
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 5000;
  await app.listen(port);
}
bootstrap();
