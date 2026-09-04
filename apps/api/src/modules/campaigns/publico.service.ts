import type { Channel, Prisma } from '@prisma/client';
import { badRequest } from '../../lib/errors';
import { filtroDe, politicaContatos } from '../../lib/politicas';
import { prisma } from '../../lib/prisma';
import { normalizarTags } from '../../lib/tags';
import { ciclosDosContatos } from '../crm/cicloDeVida.service';
import { descreverFiltro, filtroVazio, montarPublico, type FiltroDePublico } from './publico';

/**
 * Publico de campanha montado pelos filtros do CRM (item E.3).
 *
 * Duas escolhas de arquitetura, e as duas sao sobre nao ter uma segunda verdade:
 *
 * 1. **O filtro e o mesmo da tela de contatos.** Ciclo de vida vem de
 *    `ciclosDosContatos` (item E.4), etiquetas passam pela mesma normalizacao da
 *    escrita, origem e papel sao as colunas que a lista ja filtra. Um filtro
 *    paralelo produziria um publico diferente da lista que a pessoa acabou de
 *    conferir — e ela so descobriria isso pelo relatorio de envio.
 * 2. **A politica de visibilidade vale aqui tambem.** O publico e um subconjunto
 *    da carteira de quem pergunta. Sem isso, montar campanha seria a porta dos
 *    fundos para o vendedor alcancar a base inteira.
 *
 * Previa e gravacao chamam **a mesma resolucao** (`resolverPublico`). A primeira
 * versao deste arquivo tinha duas consultas parecidas — uma para mostrar e outra
 * para gravar — e isso contradizia o proprio motivo de existir a previa: duas
 * contas divergem, e a que a pessoa aprovou nao seria a que disparou.
 */

/** Traduz o filtro do CRM em `where` do Prisma, menos o ciclo (que e derivado). */
async function filtrosDoBanco(f: FiltroDePublico): Promise<Prisma.ContactWhereInput[]> {
  const filtros: Prisma.ContactWhereInput[] = [await filtroDe(politicaContatos)];

  if (f.tags?.length) {
    // Mesma normalizacao da escrita: sem isso, "Revenda" no filtro nao acha o
    // registro salvo como "revenda".
    filtros.push({ tags: { hasEvery: normalizarTags(f.tags) } });
  }
  if (f.origem?.length) filtros.push({ canalOrigem: { in: f.origem } });
  if (f.papel?.length) filtros.push({ papelNaConta: { in: f.papel } });
  if (f.responsavelId !== undefined) filtros.push({ responsavelId: f.responsavelId });

  return filtros;
}

/**
 * Resolve o publico uma vez: quem casa com o filtro, ja particionado.
 *
 * O ciclo de vida e aplicado **depois** do banco porque ele nao e coluna — e
 * derivado dos fatos (item E.4). A ordem nao e escolha estetica: filtrar no banco
 * primeiro reduz o conjunto que precisa de derivacao, que e a parte caro.
 */
async function resolverPublico(filtro: FiltroDePublico, canal: Channel) {
  if (filtroVazio(filtro)) {
    throw badRequest(
      'Escolha ao menos um filtro. Sem filtro o publico seria a base inteira, e a mensagem nao volta atras.',
    );
  }

  let contatos = await prisma.contact.findMany({
    where: { AND: await filtrosDoBanco(filtro) },
    select: { id: true, nome: true, email: true, telefone: true, anonimizadoEm: true },
    orderBy: { nome: 'asc' },
  });

  if (filtro.ciclo?.length) {
    const desejados = new Set(filtro.ciclo);
    const ciclos = await ciclosDosContatos({ id: { in: contatos.map((c) => c.id) } });
    contatos = contatos.filter((c) => {
      const ciclo = ciclos.get(c.id);
      return ciclo !== undefined && desejados.has(ciclo);
    });
  }

  return montarPublico(contatos, canal);
}

/**
 * A previa, que **nao escreve nada**.
 *
 * Existe para ninguem ativar campanha para um publico que nunca viu — e mostra
 * as tres contas separadas, porque somar quem nao recebe no total do publico e a
 * forma classica de a campanha prometer alcance que nao tem.
 */
export async function previaDoPublico(filtro: FiltroDePublico, canal: Channel) {
  const publico = await resolverPublico(filtro, canal);

  return {
    canal,
    descricao: descreverFiltro(filtro),
    campoExigido: publico.campoExigido,
    /** Quem realmente recebe. E este numero que a tela mostra em destaque. */
    total: publico.alcancaveis.length,
    totalFiltrado: publico.totalFiltrado,
    semEndereco: publico.semEndereco.length,
    anonimizados: publico.anonimizados.length,
    /*
     * Uma AMOSTRA, e nao a lista inteira.
     *
     * Serve para reconhecer o publico ("sao esses mesmo?"), e mandar dez mil
     * nomes para a tela trocaria essa conferencia por uma espera. Quem precisa da
     * lista completa a tem na tela de contatos, com o mesmo filtro.
     */
    amostra: publico.alcancaveis.slice(0, 20).map((c) => ({ id: c.id, nome: c.nome })),
    /** Quem falta dado: lista de trabalho, e nao erro. */
    amostraSemEndereco: publico.semEndereco.slice(0, 20).map((c) => ({ id: c.id, nome: c.nome })),
  };
}

/**
 * Grava o publico na campanha.
 *
 * So os alcancaveis entram: contato sem telefone numa campanha de WhatsApp
 * viraria item PENDENTE que falha no disparo — barulho que esconde as falhas de
 * verdade. Eles ficam contados na resposta, para a tela dizer o que ficou de fora
 * e por que.
 *
 * `skipDuplicates` porque a operacao e repetivel de proposito: quem monta publico
 * duas vezes com filtros que se sobrepoem nao quer mandar duas mensagens para a
 * mesma pessoa.
 */
export async function aplicarPublico(campanhaId: string, filtro: FiltroDePublico, canal: Channel) {
  const publico = await resolverPublico(filtro, canal);

  if (publico.alcancaveis.length === 0) {
    throw badRequest(
      publico.campoExigido === null
        ? `Campanha de ${canal} nao alcanca contato que nao escreveu primeiro — o cliente precisa iniciar a conversa`
        : `Nenhum contato do filtro tem ${publico.campoExigido} — publico vazio`,
    );
  }

  const { count } = await prisma.campaignItem.createMany({
    data: publico.alcancaveis.map((c) => ({ campanhaId, contatoId: c.id })),
    skipDuplicates: true,
  });

  return {
    adicionados: count,
    /** Ja estavam na campanha. Diferente de "adicionados: 0" por publico vazio. */
    jaEstavam: publico.alcancaveis.length - count,
    semEndereco: publico.semEndereco.length,
    anonimizados: publico.anonimizados.length,
    descricao: descreverFiltro(filtro),
  };
}
