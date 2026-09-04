import type { Channel, PapelNaConta } from '@prisma/client';
// O ciclo de vida NAO vem do Prisma: ele e derivado (item E.4), e o tipo mora no
// modulo que o deriva. Importar de la e o que garante que o filtro da campanha e
// a tela de contatos falem da mesma escada.
import type { CicloDeVida } from '../crm/cicloDeVida';

/**
 * Publico de campanha pelos filtros do CRM (item E.3).
 *
 * A demonstracao montava o publico com **os mesmos filtros da tela de contatos**
 * — ciclo de vida, cargo, origem, etiquetas. O que a plataforma fazia era um
 * botao "adicionar todos os contatos", que e a unica opcao que ninguem quer: ou
 * dispara para a base inteira, ou nao dispara.
 *
 * O que mora neste arquivo e o que decide se o publico **mente**. Duas perguntas,
 * e as duas tem resposta errada por omissao:
 *
 * 1. quem esta na lista e nao pode receber? (contato sem telefone numa campanha
 *    de WhatsApp entra no total e nunca recebe);
 * 2. quem esta na lista e nao deve receber? (contato anonimizado por pedido de
 *    LGPD — os dados dele foram apagados, e disparar para ele seria usar o que
 *    sobrou de um cadastro que a pessoa pediu para remover).
 *
 * Sem essas duas contas, "publico: 300" e um numero que o disparo desmente
 * depois, uma falha por vez, no relatorio.
 */

/** O que o CRM sabe filtrar hoje. */
export type FiltroDePublico = {
  ciclo?: CicloDeVida[];
  tags?: string[];
  origem?: Channel[];
  /** O "cargo" da demonstracao: o papel da pessoa dentro da conta (item 5.2). */
  papel?: PapelNaConta[];
  responsavelId?: string | null;
};

export type ContatoDoPublico = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  anonimizadoEm: Date | null;
};

/**
 * De que campo cada canal precisa para conseguir entregar.
 *
 * `null` significa "este canal nao alcanca contato que nao escreveu primeiro" —
 * webchat, Instagram e Facebook nao tem endereco proprio no cadastro, e por isso
 * a plataforma nao promete publico para eles. Dizer isso e melhor que montar uma
 * lista de 300 pessoas que nenhuma linha do sistema consegue alcancar.
 */
export const CAMPO_DO_CANAL: Record<Channel, 'telefone' | 'email' | null> = {
  WHATSAPP: 'telefone',
  VOZ: 'telefone',
  EMAIL: 'email',
  WEBCHAT: null,
  INSTAGRAM: null,
  FACEBOOK: null,
};

export type Publico = {
  /** Quem realmente vai receber. E este numero que a tela mostra em destaque. */
  alcancaveis: ContatoDoPublico[];
  /**
   * Casou com o filtro e nao tem o campo que o canal exige.
   *
   * Separado, e nao somado nem descartado em silencio: e uma lista de trabalho
   * ("complete o telefone destes 40"), e nao um erro.
   */
  semEndereco: ContatoDoPublico[];
  /** Anonimizados por LGPD. Nunca entram, e a tela diz quantos foram. */
  anonimizados: ContatoDoPublico[];
  /** Quantos casaram com o filtro, antes de qualquer exclusao. */
  totalFiltrado: number;
  /** O campo que este canal exige, ou nulo se o canal nao alcanca ninguem. */
  campoExigido: 'telefone' | 'email' | null;
};

/**
 * Separa quem recebe, quem falta dado e quem nao pode receber.
 *
 * A ordem das exclusoes importa: **anonimizado sai antes** de qualquer conta de
 * endereco. Contato anonimizado ficou com telefone em placeholder, e classifica-lo
 * como "sem endereco" convidaria alguem a "completar o cadastro" de uma pessoa
 * que pediu para ser esquecida.
 */
export function montarPublico(
  contatos: ContatoDoPublico[],
  canal: Channel,
): Publico {
  const campoExigido = CAMPO_DO_CANAL[canal];

  const anonimizados: ContatoDoPublico[] = [];
  const semEndereco: ContatoDoPublico[] = [];
  const alcancaveis: ContatoDoPublico[] = [];

  for (const c of contatos) {
    if (c.anonimizadoEm !== null) {
      anonimizados.push(c);
      continue;
    }
    if (campoExigido === null) {
      // Canal que nao alcanca ninguem: todo mundo fica em `semEndereco`, e a
      // tela explica que o cliente precisa iniciar a conversa.
      semEndereco.push(c);
      continue;
    }
    const valor = campoExigido === 'telefone' ? c.telefone : c.email;
    if (valor === null || valor.trim() === '') semEndereco.push(c);
    else alcancaveis.push(c);
  }

  return {
    alcancaveis,
    semEndereco,
    anonimizados,
    totalFiltrado: contatos.length,
    campoExigido,
  };
}

/**
 * O filtro esta vazio?
 *
 * Existe para a rota poder **exigir ao menos um filtro** antes de montar publico.
 * Sem isso, um clique acidental em "montar publico" com tudo desligado seleciona
 * a base inteira — e essa e a operacao mais caro de desfazer que existe aqui: a
 * mensagem ja saiu.
 */
export function filtroVazio(f: FiltroDePublico): boolean {
  return (
    (f.ciclo?.length ?? 0) === 0 &&
    (f.tags?.length ?? 0) === 0 &&
    (f.origem?.length ?? 0) === 0 &&
    (f.papel?.length ?? 0) === 0 &&
    f.responsavelId === undefined
  );
}

/**
 * Frase que descreve o publico, para a tela e para o registro da campanha.
 *
 * Guardar a **descricao** do filtro junto da campanha responde, tres meses
 * depois, "para quem isso foi?" — pergunta que a lista de itens ja nao responde,
 * porque um contato pode ter mudado de degrau desde o disparo.
 */
export function descreverFiltro(f: FiltroDePublico): string {
  const partes: string[] = [];
  if (f.ciclo?.length) partes.push(`ciclo: ${f.ciclo.join(', ')}`);
  if (f.origem?.length) partes.push(`origem: ${f.origem.join(', ')}`);
  if (f.papel?.length) partes.push(`papel: ${f.papel.join(', ')}`);
  if (f.tags?.length) partes.push(`etiquetas: ${f.tags.join(', ')}`);
  if (f.responsavelId !== undefined) {
    partes.push(f.responsavelId === null ? 'sem responsavel' : `responsavel: ${f.responsavelId}`);
  }
  return partes.length === 0 ? 'sem filtro' : partes.join(' · ');
}
