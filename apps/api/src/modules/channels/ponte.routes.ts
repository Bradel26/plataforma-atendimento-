import { Router, raw } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { badRequest } from '../../lib/errors';
import { prismaSemIsolamento } from '../../lib/prisma';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { assinaturaValida, obterConfig } from './channels.service';
import { registrarMensagemEntrante } from './inbound.service';
import { modoEfetivo, numeroNormalizado } from './whatsapp.modo';

/**
 * Entrada do WhatsApp nao oficial: a ponte posta aqui o que o cliente mandou.
 *
 * Endereco proprio (`/api/webhooks/ponte/whatsapp/:organizacaoId`) e nao a rota
 * da Meta, por tres motivos concretos:
 *
 * 1. **O corpo e outro.** A ponte manda `{ numero, texto }`; a Meta manda a
 *    arvore `entry/changes/value`. Aceitar os dois na mesma rota exigiria
 *    adivinhar o formato, e adivinhar errado entrega mensagem no lugar errado.
 * 2. **A organizacao vem na URL.** No caminho da Meta ela sai do
 *    `phone_number_id`, que e um id global da Meta — a ponte nao tem nada
 *    equivalente, porque nao existe cadastro central. O id na URL nao e segredo:
 *    ele diz *para quem*, e a assinatura diz *se pode*.
 * 3. **A assinatura usa segredo proprio** (`ponteSegredo`), e nao o `appSecret`
 *    da Meta. Reaproveitar o segredo da Meta faria uma credencial servir para
 *    dois sistemas, e revogar um obrigaria a mexer no outro.
 *
 * A mensagem entra por `registrarMensagemEntrante`, o **mesmo** caminho do
 * webhook oficial: idempotencia por `idExterno`, reaproveitamento da conversa
 * aberta, fila do canal, entrega ao motor de IA. A conversa que chega pela ponte
 * e indistinguivel da que chega pela Cloud API para todo o resto do sistema — e e
 * isso que permite trocar de modo sem perder historico.
 */
export const ponteRoutes = Router();

const mensagemSchema = z.object({
  /** Numero de quem mandou, em qualquer formato: normalizamos aqui. */
  numero: z.string().trim().min(8).max(30),
  nome: z.string().trim().max(120).nullable().optional(),
  texto: z.string().max(4096).optional(),
  /**
   * Id da mensagem na ponte. **Obrigatorio**, e o motivo e a idempotencia: a
   * ponte reentrega quando nao recebe 200, e sem id proprio a reentrega criaria
   * mensagem duplicada na conversa do cliente.
   */
  idExterno: z.string().trim().min(1).max(200),
  anexoUrl: z.string().trim().url().nullable().optional(),
  tipoAnexo: z.enum(['TEXTO', 'IMAGEM', 'AUDIO', 'VIDEO', 'ARQUIVO']).optional(),
  anexoNome: z.string().trim().max(200).nullable().optional(),
});

/**
 * Descobre se a organizacao existe, fora de qualquer contexto.
 *
 * Roda irrestrito pelo mesmo motivo de `organizacaoDoWebhook`: e a pergunta "de
 * quem e isto?", e nao ha contexto para abrir antes da resposta.
 */
async function organizacaoExiste(id: string) {
  return semOrganizacao('webhook da ponte: descobrir a organizacao pela URL', async () => {
    const org = await prismaSemIsolamento.organizacao.findUnique({ where: { id }, select: { id: true } });
    return org !== null;
  });
}

ponteRoutes.post(
  '/whatsapp/:organizacaoId',
  // Corpo cru: a assinatura e calculada sobre os bytes originais, e reserializar
  // o JSON quebraria a validacao — a mesma razao do webhook da Meta.
  raw({ type: '*/*', limit: '2mb' }),
  asyncHandler(async (req, res) => {
    const organizacaoId = req.params.organizacaoId!;
    const corpoBruto = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    if (!(await organizacaoExiste(organizacaoId))) {
      // 404 e nao 401: o id na URL nao e credencial, e fingir que existe nao
      // protege nada — a assinatura e que protege.
      res.status(404).json({ error: { code: 'NAO_ENCONTRADO', message: 'Organizacao nao encontrada' } });
      return;
    }

    await comOrganizacao(organizacaoId, async () => {
      const config = await obterConfig('WHATSAPP');

      if (!config?.ativo || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
        res.status(503).json({
          error: {
            code: 'CANAL_INDISPONIVEL',
            message: 'O WhatsApp desta organizacao nao esta no modo nao oficial',
          },
        });
        return;
      }

      if (!config.ponteSegredo) {
        /*
         * Sem segredo configurado a rota **recusa**, em vez de aceitar sem
         * assinatura.
         *
         * Aceitar seria abrir um endereco publico por onde qualquer um injeta
         * mensagem na conversa de um cliente — e o "so por enquanto, ate
         * configurar" e exatamente como isso ficaria para sempre.
         */
        res.status(503).json({
          error: {
            code: 'PONTE_SEM_SEGREDO',
            message: 'Configure o segredo da ponte antes de receber mensagens',
          },
        });
        return;
      }

      const assinatura = req.header('x-ponte-assinatura') ?? req.header('x-hub-signature-256');
      if (!assinaturaValida(corpoBruto, assinatura, config.ponteSegredo)) {
        res
          .status(401)
          .json({ error: { code: 'ASSINATURA_INVALIDA', message: 'Assinatura da ponte invalida' } });
        return;
      }

      let corpo: z.infer<typeof mensagemSchema>;
      try {
        corpo = mensagemSchema.parse(JSON.parse(corpoBruto.toString('utf8')));
      } catch (erro) {
        // 400 e o fim da linha: a ponte nao deve reentregar o que nunca vai
        // passar, e responder 200 esconderia o defeito de integracao.
        throw badRequest(
          `Corpo invalido: ${erro instanceof Error ? erro.message.slice(0, 200) : 'nao e JSON'}`,
        );
      }

      const numero = numeroNormalizado(corpo.numero);
      if (!numero) throw badRequest(`Numero "${corpo.numero}" nao parece um telefone`);

      const tipoAnexo = corpo.tipoAnexo ?? (corpo.anexoUrl ? 'ARQUIVO' : 'TEXTO');
      const conteudo = corpo.texto?.trim() || (corpo.anexoUrl ? '[arquivo recebido]' : '');
      if (!conteudo) throw badRequest('Informe texto ou anexo');

      const resultado = await registrarMensagemEntrante({
        canal: 'WHATSAPP',
        // O endereco externo e o numero normalizado: e ele que o envio usa de
        // volta, e guardar formatos diferentes na ida e na volta faria a resposta
        // abrir uma conversa nova em vez de continuar a mesma.
        enderecoExterno: numero,
        nomeExibicao: corpo.nome ?? null,
        telefone: numero,
        idExterno: corpo.idExterno,
        conteudo,
        tipoAnexo,
        anexoUrl: corpo.anexoUrl ?? null,
        // A ponte nao tem media id: ela manda a URL ou nada.
        anexoIdExterno: null,
        anexoNome: corpo.anexoNome ?? null,
      });

      // 200 tambem para reentrega: `duplicada` diz que nada foi criado, e a ponte
      // pode parar de tentar.
      res.json({ ok: true, duplicada: 'duplicada' in resultado ? resultado.duplicada : false });
    });
  }),
);
