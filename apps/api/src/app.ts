import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './env';
import { errorHandler, notFoundHandler } from './http/middleware/error-handler';
import { authRoutes } from './modules/auth/auth.routes';
import { brandingRoutes } from './modules/branding/branding.routes';
import { contactsRoutes } from './modules/contacts/contacts.routes';
import { conversationsRoutes } from './modules/conversations/conversations.routes';
import { healthRoutes } from './modules/health/health.routes';
import { queuesRoutes } from './modules/queues/queues.routes';
import { usersRoutes } from './modules/users/users.routes';
import { webchatRoutes } from './modules/webchat/webchat.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/usuarios', usersRoutes);
  app.use('/api/filas', queuesRoutes);
  app.use('/api/branding', brandingRoutes);
  app.use('/api/conversas', conversationsRoutes);
  app.use('/api/contatos', contactsRoutes);
  app.use('/api/webchat', webchatRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
