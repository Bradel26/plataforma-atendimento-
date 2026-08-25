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
import { botsRoutes } from './modules/bots/bots.routes';
import { campanhasRoutes } from './modules/campaigns/campaigns.routes';
import { channelsRoutes } from './modules/channels/channels.routes';
import { webhooksRoutes } from './modules/channels/webhooks.routes';
import { conversationsRoutes } from './modules/conversations/conversations.routes';
import { accountsRoutes } from './modules/crm/accounts.routes';
import { dadosRoutes } from './modules/dados/dados.routes';
import { metricsRoutes } from './modules/metrics/metrics.routes';
import { relatoriosRoutes } from './modules/reports/reports.routes';
import { escalasRoutes } from './modules/shifts/shifts.routes';
import { pesquisasPublicasRoutes, pesquisasRoutes } from './modules/surveys/surveys.routes';
import { catalogsRoutes, productsRoutes } from './modules/crm/catalog.routes';
import { leadsRoutes } from './modules/crm/leads.routes';
import { funnelsRoutes, opportunitiesRoutes } from './modules/crm/opportunities.routes';
import { arquivosRoutes } from './modules/files/files.routes';
import { lgpdRoutes } from './modules/lgpd/lgpd.routes';
import { healthRoutes } from './modules/health/health.routes';
import { queuesRoutes } from './modules/queues/queues.routes';
import { usersRoutes } from './modules/users/users.routes';
import { ticketsRoutes } from './modules/tickets/tickets.routes';
import { webchatRoutes } from './modules/webchat/webchat.routes';

export function createApp() {
  const app = express();

  // Atras de proxy reverso o IP real vem no X-Forwarded-For; sem isto, o limite
  // por IP contaria todo mundo como o mesmo cliente (o proprio proxy).
  if (env.TRUST_PROXY) app.set('trust proxy', true);

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  // O webhook da Meta valida assinatura sobre o corpo BRUTO — precisa vir antes
  // do express.json, que consumiria o stream e reserializaria o payload.
  app.use('/api/webhooks', webhooksRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.use('/api/arquivos', arquivosRoutes);
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
  app.use('/api/metricas', metricsRoutes);
  app.use('/api/relatorios', relatoriosRoutes);
  app.use('/api/escalas', escalasRoutes);
  app.use('/api/pesquisas', pesquisasRoutes);
  // Publico: o cliente responde a pesquisa por link, sem conta na plataforma.
  app.use('/api/avaliacao', pesquisasPublicasRoutes);
  app.use('/api/lgpd', lgpdRoutes);
  app.use('/api/campanhas', campanhasRoutes);
  app.use('/api/bots', botsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
