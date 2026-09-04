import { prisma } from '../../lib/prisma';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { apenasVisivel } from '../../lib/visibilidade';
import { filtroDe, politicaContas } from '../../lib/politicas';
import {
  apenasDigitos,
  cnpjValido,
  formatarCnpj,
  mapearCnpj,
  planoDeEnriquecimento,
  type DadosPublicos,
} from './cnpj';

/**
 * Enriquecimento por CNPJ: a parte que fala com o mundo (item 5.2).
 *
 * A consulta publica e a **unica** chamada de saida do CRM, e por isso ela e
 * tratada como o que e: uma dependencia que cai. Tem tempo limite, tem mensagem
 * propria para cada forma de falhar, e nao escreve nada no banco antes de o
 * usuario ver o que vai mudar.
 */

/** De onde vem a consulta. Trocavel por variavel de ambiente. */
const BASE = process.env.CNPJ_API_URL ?? 'https://brasilapi.com.br/api/cnpj/v1';

/**
 * Tempo limite da consulta externa.
 *
 * Oito segundos: uma consulta publica que passa disso ja nao serve para o fluxo
 * de quem esta com o cliente na linha, e deixar a requisicao pendurada prende um
 * processo do servidor por causa de um servico de terceiro.
 */
const LIMITE_MS = 8000;

/**
 * Como a plataforma se identifica na consulta publica.
 *
 * Servico publico gratuito tem todo o direito de saber quem esta chamando, e
 * varios recusam cliente anonimo — este recusa com 403.
 */
const AGENTE = process.env.CNPJ_API_AGENT ?? 'plataforma-atendimento/1.0';

/**
 * Falha da consulta publica, ja no formato que o `errorHandler` entende.
 *
 * Estende `AppError` em vez de virar um erro proprio traduzido na rota: a
 * primeira versao lancava um `Error` com `.status` colado, e o `errorHandler` —
 * que reconhece `AppError` e nada mais — devolvia 500 para tudo. O status certo
 * importa aqui mais que o normal, porque cada motivo pede uma acao diferente de
 * quem le a mensagem.
 */
export class FalhaNaConsulta extends AppError {
  constructor(status: number, mensagem: string) {
    super(
      status,
      status === 404 ? 'NOT_FOUND' : status === 400 ? 'BAD_REQUEST' : status === 429 ? 'RATE_LIMITED' : 'BAD_GATEWAY',
      mensagem,
    );
  }
}

/**
 * Busca os dados publicos de um CNPJ.
 *
 * Cada forma de falhar tem mensagem propria, porque as acoes sao diferentes:
 * numero errado se corrige digitando, empresa inexistente se resolve conferindo
 * o cadastro, e servico fora do ar so pede para tentar de novo mais tarde. Uma
 * mensagem generica faria as tres parecerem a mesma coisa.
 */
export async function consultarCnpj(entrada: string): Promise<DadosPublicos> {
  const cnpj = apenasDigitos(entrada);
  if (!cnpjValido(cnpj)) {
    throw new FalhaNaConsulta(400, `CNPJ ${formatarCnpj(entrada)} nao e valido — confira os digitos.`);
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), LIMITE_MS);

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}/${cnpj}`, {
      signal: controle.signal,
      /*
       * `user-agent` e obrigatorio na pratica, e a falta dele custou uma
       * investigacao: o `fetch` do Node nao manda nenhum, e a consulta publica
       * responde **403** para quem nao se identifica. O mesmo endereco no `curl`
       * respondia 200, o que fazia o defeito parecer bloqueio de rede.
       */
      headers: { accept: 'application/json', 'user-agent': AGENTE },
    });
  } catch (e) {
    // Inclui o `abort` do tempo limite e qualquer falha de rede. 502, e nao 500:
    // o defeito nao e nosso, e a distincao importa para quem le o log.
    const motivo = e instanceof Error && e.name === 'AbortError' ? 'demorou demais' : 'esta indisponivel';
    throw new FalhaNaConsulta(502, `A consulta publica de CNPJ ${motivo}. Tente novamente em alguns minutos.`);
  } finally {
    clearTimeout(relogio);
  }

  if (resposta.status === 404) {
    throw new FalhaNaConsulta(404, `Nenhuma empresa encontrada para o CNPJ ${formatarCnpj(cnpj)}.`);
  }
  if (resposta.status === 429) {
    throw new FalhaNaConsulta(429, 'A consulta publica de CNPJ atingiu o limite de uso. Tente novamente mais tarde.');
  }
  if (!resposta.ok) {
    throw new FalhaNaConsulta(502, `A consulta publica de CNPJ respondeu ${resposta.status}.`);
  }

  const dados = mapearCnpj(await resposta.json().catch(() => null));
  if (!dados) {
    // Resposta 200 com corpo que nao reconhecemos. Escrever o que der para
    // aproveitar seria pior: metade dos campos viria vazia e ninguem saberia
    // que a leitura falhou.
    throw new FalhaNaConsulta(502, 'A consulta publica respondeu num formato que nao reconhecemos.');
  }
  return dados;
}

/** A conta com o que o plano precisa comparar. */
async function contaParaEnriquecer(id: string) {
  const conta = await prisma.account.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaContas)),
    include: {
      contatos: { select: { id: true, nome: true, papelNaConta: true, qualificacaoQsa: true } },
    },
  });
  if (!conta) throw notFound('Cliente nao encontrado');
  if (!conta.cnpj) {
    throw badRequest('Este cliente nao tem CNPJ cadastrado. Informe o CNPJ para poder consultar o cadastro publico.');
  }
  return conta;
}

/**
 * A previa: o que a consulta diz e o que mudaria. **Nao escreve nada.**
 *
 * Duas etapas de proposito. Enriquecimento e a unica operacao da plataforma em
 * que dado de fora entra no cadastro do cliente, e ver antes de aplicar e o que
 * transforma "varinha magica" em decisao — sobretudo por causa dos conflitos, que
 * a plataforma nao resolve sozinha.
 */
export async function previaDoEnriquecimento(id: string) {
  const conta = await contaParaEnriquecer(id);
  const dados = await consultarCnpj(conta.cnpj!);
  const plano = planoDeEnriquecimento(
    {
      nome: conta.nome,
      razaoSocial: conta.razaoSocial,
      telefone: conta.telefone,
      email: conta.email,
      situacaoCadastral: conta.situacaoCadastral,
      atividadePrincipal: conta.atividadePrincipal,
    },
    dados,
    conta.contatos,
  );
  return { dados, plano, enriquecidoEm: conta.enriquecidoEm };
}

/**
 * Aplica o plano.
 *
 * Recalcula a previa em vez de receber o plano do navegador: um plano vindo de
 * fora seria uma forma de escrever qualquer coisa no cadastro do cliente pela
 * porta do enriquecimento. O custo e refazer a consulta publica no momento de
 * aplicar; a alternativa e confiar no que o navegador manda, que nao e
 * alternativa. E ha um ganho: o que se aplica e o cadastro de AGORA, nao o que a
 * tela leu ha dez minutos.
 *
 * Tudo numa transacao: conta, contatos novos e classificacoes sao a mesma
 * afirmacao ("foi isto que o cadastro publico disse neste momento"), e metade
 * aplicada deixaria a data de enriquecimento mentindo sobre o resto.
 */
export async function aplicarEnriquecimento(id: string) {
  const { dados, plano } = await previaDoEnriquecimento(id);
  const conta = await contaParaEnriquecer(id);

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: conta.id },
      data: {
        ...plano.camposParaPreencher,
        enriquecidoEm: new Date(),
      },
    });

    for (const novo of plano.contatosParaCriar) {
      await tx.contact.create({
        data: {
          nome: novo.nome,
          contaId: conta.id,
          papelNaConta: novo.papelNaConta,
          qualificacaoQsa: novo.qualificacaoQsa,
          /*
           * O contato do quadro societario nasce com o responsavel da conta.
           *
           * Contato sem dono nao aparece em lista nenhuma e morre — e aqui o
           * efeito seria pior que o normal: a plataforma criaria cinco socios
           * invisiveis e o vendedor concluiria que o enriquecimento nao fez nada.
           */
          responsavelId: conta.responsavelId,
        },
      });
    }

    for (const classificar of plano.contatosParaClassificar) {
      await tx.contact.update({
        where: { id: classificar.id },
        data: { papelNaConta: classificar.papelNaConta, qualificacaoQsa: classificar.qualificacaoQsa },
      });
    }
  });

  return { dados, plano };
}

/** Define ou limpa o papel de um contato na conta. */
export async function definirPapelNaConta(
  contatoId: string,
  papelNaConta: 'SOCIO' | 'ADMINISTRADOR' | 'DECISOR' | 'TECNICO' | 'FINANCEIRO' | 'COMPRAS' | 'OUTRO' | null,
) {
  const contato = await prisma.contact.findFirst({ where: { id: contatoId }, select: { id: true, contaId: true } });
  if (!contato) throw notFound('Contato nao encontrado');
  /*
   * Papel na conta exige conta.
   *
   * "Socio" de quem nao esta ligado a nenhuma empresa nao significa nada, e a
   * tela que lista os papeis e a da propria conta — o dado ficaria gravado e
   * invisivel.
   */
  if (!contato.contaId) {
    throw badRequest('Papel na conta so faz sentido para contato vinculado a um cliente');
  }

  return prisma.contact.update({
    where: { id: contato.id },
    data: { papelNaConta },
    select: { id: true, nome: true, papelNaConta: true, qualificacaoQsa: true },
  });
}
