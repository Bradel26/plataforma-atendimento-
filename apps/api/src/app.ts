import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './env';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { errorHandler, notFoundHandler } from './http/middleware/error-handler';
import { authRoutes } from './modules/auth/auth.routes';
import { brandingRoutes } from './modules/branding/branding.routes';
import { contactsRoutes } from './modules/contacts/contacts.routes';
import { botsRoutes } from './modules/bots/bots.routes';
import { iaRoutes } from './modules/bots/ia.routes';
import { integracoesRoutes } from './modules/integrations/tokens.routes';
import { campanhasRoutes } from './modules/campaigns/campaigns.routes';
import { channelsRoutes } from './modules/channels/channels.routes';
import { webhooksRoutes } from './modules/channels/webhooks.routes';
import { vozRoutes, vozWebhookRoutes } from './modules/voice/voice.routes';
import { conversationsRoutes } from './modules/conversations/conversations.routes';
import { accountsRoutes } from './modules/crm/accounts.routes';
import { dadosRoutes } from './modules/dados/dados.routes';
import { metricsRoutes } from './modules/metrics/metrics.routes';
import { relatoriosRoutes } from './modules/reports/reports.routes';
import { escalasRoutes } from './modules/shifts/shifts.routes';
import { pesquisasPublicasRoutes, pesquisasRoutes } from './modules/surveys/surveys.routes';
import { catalogsRoutes, productsRoutes } from './modules/crm/catalog.routes';
import { leadsRoutes } from './modules/crm/leads.routes';
import { tagsRoutes } from './modules/crm/tags.routes';
import { funnelsRoutes, opportunitiesRoutes } from './modules/crm/opportunities.routes';
import { atividadesRoutes, fichaRoutes } from './modules/crm/ficha.routes';
import { arquivosRoutes } from './modules/files/files.routes';
import { widgetRoutes } from './modules/widget/widget.routes';
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
  // A assinatura do provedor de voz e sobre os parametros do formulario, nao
  // sobre o corpo bruto — mas a rota fica aqui junto dos outros webhooks para o
  // express.json nao consumir o stream antes do urlencoded do proprio router.
  app.use('/api/webhooks/voz', vozWebhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

  /*
   * Nada da API entra em cache por padrao.
   *
   * O Express manda ETag e nenhum Cache-Control, e sem Cache-Control o
   * navegador aplica frescor heuristico: depois de gravar algo e recarregar a
   * pagina, o GET podia ser servido do cache com o valor de ANTES. Quem mexeu na
   * configuracao via a alteracao desaparecer.
   *
   * As rotas que se beneficiam de cache definem o proprio cabecalho depois desta
   * linha e vencem: o anexo assinado (`/api/arquivos`) e o script do widget.
   */
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Servido em /api para caber numa unica tag <script> no site do cliente.
  app.use('/api', widgetRoutes);
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
  app.use('/api/tags', tagsRoutes);
  app.use('/api/oportunidades', opportunitiesRoutes);
  app.use('/api/funis', funnelsRoutes);
  app.use('/api/produtos', productsRoutes);
  app.use('/api/catalogos', catalogsRoutes);
  app.use('/api/ficha', fichaRoutes);
  app.use('/api/atividades', atividadesRoutes);
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
  app.use('/api/voz', vozRoutes);
  app.use('/api/campanhas', campanhasRoutes);
  // Antes de /api/bots: aquele router aplica requireAuth em tudo, e o motor de
  // IA autentica por token de integracao, nao por sessao de usuario.
  app.use('/api/bots/ia', iaRoutes);
  app.use('/api/bots', botsRoutes);
  app.use('/api/integracoes', integracoesRoutes);

  // O front, quando servido por este processo (ver servirFront).
  const comFront = servirFront(app);
  if (comFront) console.log(`Front servido por esta API a partir de ${env.STATIC_DIR}`);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Serve o front compilado pelo proprio processo da API.
 *
 * Existe para o caso em que nao ha um nginx nosso na frente — VPS onde outro
 * proxy (Traefik do Coolify, por exemplo) e o dono das portas 80 e 443, e nao
 * ha subdominio proprio para separar front e API em dois enderecos.
 *
 * Fica desligado quando a pasta nao existe, que e o caso em desenvolvimento (o
 * Vite serve o front) e no deploy com nginx separado. Ligar sem querer nao
 * quebra nada; nao ligar quando precisa deixaria o site fora do ar.
 */
function servirFront(app: Express) {
  const pasta = resolve(process.cwd(), env.STATIC_DIR);
  if (!existsSync(join(pasta, 'index.html'))) return false;

  /**
   * O Webchat vive num iframe dentro do site do cliente. Servido por nginx isso
   * era automatico — arquivo estatico nao passa pelo helmet. Servido por aqui,
   * passa: o helmet manda X-Frame-Options SAMEORIGIN e frame-ancestors 'self',
   * e o widget para de carregar em qualquer dominio que nao seja o nosso.
   *
   * Entao esta rota, e so ela, libera o enquadramento. As demais continuam
   * protegidas contra clickjacking.
   */
  const liberarEnquadramento = (res: express.Response) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "font-src 'self' https: data:",
        "form-action 'self'",
        // A unica diferenca em relacao ao padrao do helmet.
        'frame-ancestors *',
        "img-src 'self' data:",
        "object-src 'none'",
        "script-src 'self'",
        "script-src-attr 'none'",
        "style-src 'self' https: 'unsafe-inline'",
        'upgrade-insecure-requests',
      ].join(';'),
    );
  };

  // O bundle tem hash no nome: pode ser cacheado para sempre. O index nunca,
  // senao o navegador fica preso numa versao apontando para arquivos que nao
  // existem mais.
  app.use(
    express.static(pasta, {
      index: false,
      setHeaders: (res, caminho) => {
        if (caminho.includes(`${sep}assets${sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // SPA: qualquer rota que nao seja da API devolve o index e o React resolve o
  // caminho. Precisa vir depois de todas as rotas /api, e antes do 404.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.path.startsWith('/webchat')) liberarEnquadramento(res);
    res.sendFile(join(pasta, 'index.html'));
  });

  return true;
}
