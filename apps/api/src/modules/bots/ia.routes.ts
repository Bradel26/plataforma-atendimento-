import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireIntegration } from '../../http/middleware/integration';
import { validateBody } from '../../http/middleware/validate';
import { badRequest } from '../../lib/errors';
import { limiteBytes } from '../../lib/storage';
import { registrarAnalise } from '../voice/analise.service';
import { registrarAnexoDaIa, registrarRespostaDaIa } from './ia.service';

/**
 * Rotas do motor de IA externo. Autenticadas por token de integracao, nunca por
 * sessao de usuario — quem chama aqui e maquina.
 *
 * Montadas em `/api/bots/ia` ANTES de `/api/bots` no app: `botsRoutes` aplica
 * `requireAuth` no router inteiro, e cair nele faria o plugin receber 401 com
 * um token perfeitamente valido.
 */
export const iaRoutes = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: limiteBytes, files: 1 } });

iaRoutes.use(requireIntegration('IA'));

/**
 * Confere o token sem efeito nenhum.
 *
 * Existe porque o diagnostico do plugin conferia a ponte pelo `/api/health`, que
 * e publico: ele respondia igual com token certo, errado ou vazio, e a tela
 * dizia "ponte operante" com um token que a plataforma recusaria na primeira
 * mensagem. Um endereco que exige o token transforma esse verde em verdade.
 *
 * Devolve o nome da integracao, e nao o token: serve para quem le a tela
 * descobrir QUAL token esta configurado ali, sem que a tela possa vazar o valor.
 */
iaRoutes.get(
  '/ping',
  asyncHandler(async (req, res) => {
    res.json({
      ok: true,
      integracao: req.integracao?.nome ?? null,
      escopo: req.integracao?.escopo ?? null,
    });
  }),
);

const anexoSchema = z.object({
  tipo: z.string().trim().max(20).optional(),
  url: z.string().trim().url(),
  nome: z.string().trim().max(200).nullable().optional(),
});

/**
 * Consumo declarado pelo motor (item 6.8).
 *
 * Opcional, e opcional de proposito: quem sabe token e preco e o motor externo, e
 * exigir o campo faria a plataforma recusar a resposta de um plugin mais antigo
 * — quebrando a conversa do cliente por causa de contabilidade.
 *
 * Sem ele, o uso ainda e registrado com custo nulo: a plataforma sabe que houve
 * uma resposta de IA, e nulo diz "o motor nao informou" em vez de "foi de graca".
 */
const consumoSchema = z.object({
  unidades: z.number().int().min(0).max(10_000_000).optional(),
  custo: z.number().min(0).max(100_000).nullable().optional(),
});

const mensagemSchema = z
  .object({
    canalId: z.string().trim().min(1).max(60),
    contatoId: z.string().trim().min(1).max(60),
    texto: z.string().max(4096).optional(),
    respondendoA: z.string().trim().max(120).nullable().optional(),
    anexo: anexoSchema.nullable().optional(),
    consumo: consumoSchema.optional(),
  })
  .refine((d) => Boolean(d.texto?.trim()) || Boolean(d.anexo), {
    message: 'Informe texto ou anexo',
  });

/** Resposta do agente: texto, ou midia que ja tem URL publica. */
iaRoutes.post(
  '/mensagens',
  validateBody(mensagemSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await registrarRespostaDaIa(req.body));
  }),
);

/**
 * Anexo produzido pelo agente (imagem gerada, PDF montado).
 *
 * Existe separada de `/mensagens` porque multipart e JSON nao convivem no mesmo
 * corpo. Midia que ja tem URL publica vai por `/mensagens` — fazer upload de
 * algo que ja e URL e trabalho dobrado.
 */
iaRoutes.post(
  '/anexos',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    const arquivo = req.file;
    if (!arquivo) throw badRequest('Envie o arquivo no campo `arquivo`');

    const corpo = z
      .object({
        canalId: z.string().trim().min(1).max(60),
        contatoId: z.string().trim().min(1).max(60),
        texto: z.string().max(4096).optional(),
        respondendoA: z.string().trim().max(120).nullable().optional(),
      })
      .parse(req.body);

    res.status(201).json(
      await registrarAnexoDaIa(corpo, {
        buffer: arquivo.buffer,
        nome: arquivo.originalname,
        tipo: arquivo.mimetype,
      }),
    );
  }),
);
/**
 * Analise de uma ligacao (item E.2): transcricao, resumo, sentimento e proximas
 * acoes.
 *
 * Entra pela ponte de integracao, e nao por sessao de usuario, porque quem posta
 * e maquina — e entra aqui, junto do agente de conversa, porque e o mesmo tipo
 * de ator: um motor externo que processa e devolve. A plataforma nao transcreve.
 *
 * Todos os campos sao opcionais e **ausente e diferente de nulo**: motor que so
 * transcreve nao manda `resumo`, e nao deve por isso apagar o resumo que outro
 * escreveu. Nulo explicito apaga; ausencia preserva.
 */
const analiseSchema = z.object({
  transcricao: z.string().max(200_000).nullable().optional(),
  resumo: z.string().max(20_000).nullable().optional(),
  /*
   * Nulo em sentimento significa "nao consegui ler", e nao NEUTRO.
   *
   * Motor que nao tem confianca na leitura precisa poder dizer isso: forcado a
   * escolher um dos tres, ele escolheria NEUTRO, e a gestao passaria a ver
   * neutralidade onde existe incerteza.
   */
  sentimento: z.enum(['POSITIVO', 'NEUTRO', 'NEGATIVO']).nullable().optional(),
  proximasAcoes: z.array(z.string().max(500)).max(100).optional(),
  motor: z.string().trim().min(1).max(80).optional(),
  /*
   * Quando a analise foi feita. O motor informa porque ele sabe: a fila dele
   * pode ter atrasado, e a plataforma usar o proprio relogio faria uma analise
   * de ontem parecer de agora.
   */
  analisadoEm: z.coerce.date().optional(),
  consumo: consumoSchema.optional(),
});

iaRoutes.post(
  '/chamadas/:id/analise',
  validateBody(analiseSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ analise: await registrarAnalise(req.params.id!, req.body) });
  }),
);
