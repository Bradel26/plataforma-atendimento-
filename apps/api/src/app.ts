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
import { channelsRoutes } from './modules/channels/channels.routes';
import { webhooksRoutes } from './modules/channels/webhooks.routes';
import { conversationsRoutes } from './modules/conversations/conversations.routes';
import { accountsRoutes } from './modules/crm/accounts.routes';
import { dadosRoutes } from './modules/dados/dados.routes';
import { catalogsRoutes, productsRoutes } from './modules/crm/catalog.routes';
import { leadsRoutes } from './modules/crm/leads.routes';
import { funnelsRoutes, opportunitiesRoutes } from './modules/crm/opportunities.routes';
import { healthRoutes } from './modules/health/health.routes';
import { queuesRoutes } from './modules/queues/queues.routes';
import { usersRoutes } from './modules/users/users.routes';
import { ticketsRoutes } from './modules/tickets/tickets.routes';
import { webchatRoutes } from './modules/webchat/webchat.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  // O webhook da Meta valida assinatura sobre o corpo BRUTO — precisa vir antes
  // do express.json, que consumiria o stream e reserializaria o payload.
  app.use('/api/webhooks', webhooksRoutes);

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
  app.use('/api/contas', accountsRoutes);
  app.use('/api/leads', leadsRoutes);
  app.use('/api/oportunidades', opportunitiesRoutes);
  app.use('/api/funis', funnelsRoutes);
  app.use('/api/produtos', productsRoutes);
  app.use('/api/catalogos', catalogsRoutes);
  app.use('/api/protocolos', ticketsRoutes);
  app.use('/api/dados', dadosRoutes);
  app.use('/api/canais', channelsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
