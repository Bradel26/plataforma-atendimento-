import { timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { config } from './config.js';
import { retirar } from './midia.js';
import {
  SessaoIndisponivel,
  desconectar,
  enviarArquivo,
  enviarTexto,
  garantirNoAr,
  listar,
  qrDe,
  situacaoDe,
} from './sessao.js';

/**
 * A cara HTTP da ponte — e ela fala o dialeto que a plataforma JA espera.
 *
 * Os caminhos vem de `enderecosDaPonte()` em `whatsapp.modo.ts`, do lado da
 * API: `/mensagens`, `/arquivos` e `/estado`, com o nome da sessao no fim
 * quando existe. Nao inventamos contrato novo; implementamos o que ja estava
 * escrito, e por isso a API nao muda para passar a usar esta ponte.
 *
 * O `/qr` e o unico acrescimo, e e o motivo desta ponte existir: sem ele,
 * conectar um numero exige console no servidor.
 */

/** Limite do que sai daqui. O WhatsApp recusa acima de 16 MB para midia comum. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

/**
 * Autenticacao: Bearer token unico, o mesmo `ponteToken` da tela de Canais.
 *
 * Sem isso, qualquer um que alcance a porta manda mensagem pelo numero da
 * empresa. Comparacao em tempo constante e exagero aqui? Nao: o token e fixo e
 * a porta pode estar exposta, entao vazar tamanho por tempo de resposta e um
 * presente desnecessario.
 */
function autenticar(req: Request, res: Response, proximo: NextFunction) {
  const cabecalho = req.header('authorization') ?? '';
  const recebido = cabecalho.startsWith('Bearer ') ? cabecalho.slice('Bearer '.length).trim() : '';

  const a = Buffer.from(recebido, 'utf8');
  const b = Buffer.from(config.token, 'utf8');

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ erro: 'token invalido' });
    return;
  }

  proximo();
}

/**
 * Express 4 nao captura promessa rejeitada de rota async: ela viraria
 * `unhandledRejection` e derrubaria o processo — desconectando a sessao por
 * causa de um envio que falhou. Gemeo do `asyncHandler` da API.
 */
function rota(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, proximo: NextFunction) => {
    handler(req, res).catch(proximo);
  };
}

/** O nome da sessao vem do fim da URL; sem sufixo, a padrao. */
function sessaoDaUrl(req: Request) {
  return req.params.sessao?.trim() || config.sessaoPadrao;
}

/** Digitos com pais, do mesmo jeito que `numeroNormalizado` do lado da API. */
function normalizar(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;

  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 15) return null;

  // Numero brasileiro sem o pais: 10 ou 11 digitos. Nao inventa o nono digito.
  return digitos.length <= 11 ? '55' + digitos : digitos;
}

export function criarServidor() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  /*
   * Saude sem token: e o que o orquestrador (Coolify, compose) chama para saber
   * se o container subiu. Exigir credencial do healthcheck so faria o container
   * ser marcado como morto quando estivesse vivo.
   */
  app.get('/saude', (_req, res) => {
    res.json({ ok: true, sessoes: listar() });
  });

  /*
   * Balcao de retirada da midia recebida. Sem token de propósito: a plataforma
   * busca esta URL sem cabecalho (veja `media.service.ts`), e o que protege e o
   * nome — 32 bytes aleatorios que expiram em minutos.
   */
  app.get('/midia/:token', (req, res) => {
    const item = retirar(req.params.token ?? '');
    if (!item) {
      res.status(404).json({ erro: 'midia expirada ou inexistente' });
      return;
    }

    res.setHeader('Content-Type', item.tipo);
    res.setHeader('Content-Disposition', 'inline; filename="' + item.nome.replace(/"/g, '') + '"');
    res.send(item.buffer);
  });

  app.use(autenticar);

  /** Diagnostico. O formato e o que `lerEstadoDaPonte()` sabe ler. */
  const estado = async (req: Request, res: Response) => {
    const sessao = await garantirNoAr(sessaoDaUrl(req));
    res.json(situacaoDe(sessao));
  };
  app.get('/estado', rota(estado));
  app.get('/estado/:sessao', rota(estado));

  /**
   * O QR para parear — a razao de ser desta ponte.
   *
   * Subir a sessao no GET e proposital: o QR so existe DEPOIS de o socket
   * conectar, entao abrir a tela e o que dispara o pareamento. Sem isso, quem
   * chega numa instalacao nova ve "desconectado" para sempre e nao tem botao
   * nenhum que resolva.
   */
  const qr = async (req: Request, res: Response) => {
    const sessao = await garantirNoAr(sessaoDaUrl(req));
    res.json(qrDe(sessao));
  };
  app.get('/qr', rota(qr));
  app.get('/qr/:sessao', rota(qr));

  /** Trocar de numero: desloga no aparelho e volta a pedir QR. */
  const sair = async (req: Request, res: Response) => {
    await desconectar(sessaoDaUrl(req));
    res.json({ ok: true });
  };
  app.post('/desconectar', rota(sair));
  app.post('/desconectar/:sessao', rota(sair));

  const texto = async (req: Request, res: Response) => {
    const numero = normalizar(req.body?.numero);
    if (!numero) {
      res.status(400).json({ erro: 'numero invalido' });
      return;
    }

    const conteudo = typeof req.body?.texto === 'string' ? req.body.texto : '';
    if (!conteudo.trim()) {
      res.status(400).json({ erro: 'texto vazio' });
      return;
    }

    // `idExterno` e o nome que `whatsapp.ponte.ts` procura primeiro.
    res.json({ idExterno: await enviarTexto(sessaoDaUrl(req), numero, conteudo) });
  };
  app.post('/mensagens', rota(texto));
  app.post('/mensagens/:sessao', rota(texto));

  const arquivo = async (req: Request, res: Response) => {
    const numero = normalizar(req.body?.numero);
    if (!numero) {
      res.status(400).json({ erro: 'numero invalido' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ erro: 'nenhum arquivo enviado' });
      return;
    }

    const idExterno = await enviarArquivo(sessaoDaUrl(req), numero, {
      buffer: req.file.buffer,
      nome: req.file.originalname || 'arquivo',
      tipo: req.file.mimetype || 'application/octet-stream',
      legenda: typeof req.body?.legenda === 'string' ? req.body.legenda : undefined,
    });

    res.json({ idExterno });
  };
  app.post('/arquivos', upload.single('arquivo'), rota(arquivo));
  app.post('/arquivos/:sessao', upload.single('arquivo'), rota(arquivo));

  /*
   * Tratador de erro no fim: sem ele, a promessa rejeitada de uma rota async
   * derrubaria o processo — e derrubar o processo desconecta a sessao, que e
   * exatamente o que nao pode acontecer por causa de um envio que falhou.
   */
  app.use((err: unknown, _req: Request, res: Response, _proximo: NextFunction) => {
    const http = err instanceof SessaoIndisponivel ? err.http : 500;
    const mensagem = err instanceof Error ? err.message : 'erro desconhecido';

    if (http === 500) console.error('[ponte] erro nao previsto:', err);
    res.status(http).json({ erro: mensagem });
  });

  return app;
}
