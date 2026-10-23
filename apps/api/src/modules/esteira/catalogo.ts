/**
 * Catálogo de etapas das esteiras TIM e Starlink — puro, sem banco.
 *
 * Cada etapa tem uma CHAVE estável (não muda se o ADMIN renomear a coluna).
 * Regras, gates e o papel consolidado (Dashboard, Gestão, Ciclo) usam a chave.
 * `trilho` é a posição no trilho principal; desvios e saídas não têm.
 * `ordem` é a ordem de coluna: trilho primeiro, depois desvios, depois saídas.
 */
import type { MotivoPerdaStarlink, Operacao } from '@prisma/client';
import type { PapelDoEstagio } from '../crm/esteira';

export type ChaveTim =
  | 'TIM_NEGOCIACAO' | 'TIM_DOCUMENTACAO' | 'TIM_CRED_ANDAMENTO' | 'TIM_CRED_OK' | 'TIM_POS_CRED'
  | 'TIM_VENDA_LIBERADA' | 'TIM_ACOMPANHAMENTO' | 'TIM_DESISTENCIA' | 'TIM_DESCREDENCIADO';
export type ChaveStarlink =
  | 'SL_AGUARDANDO' | 'SL_EM_ATENDIMENTO' | 'SL_MEI' | 'SL_ALT_CNAE' | 'SL_CREDENCIAMENTO'
  | 'SL_TREINAMENTO' | 'SL_PARCEIRO' | 'SL_CONTRATO' | 'SL_PRONTO_VENDA' | 'SL_NURTURE' | 'SL_DESCARTADO';
export type ChaveEtapa = ChaveTim | ChaveStarlink;

export type EtapaCatalogo = {
  chave: ChaveEtapa;
  nome: string;
  tipo: 'NORMAL' | 'DESVIO' | 'SAIDA';
  ordem: number;
  papel: PapelDoEstagio | null;
  trilho: number | null;
};

type Definicao = Omit<EtapaCatalogo, 'ordem'>;

/** Atribui `ordem` 1..N na sequência declarada (trilho, desvios, saídas). */
const montar = (defs: Definicao[]): EtapaCatalogo[] => defs.map((d, i) => ({ ...d, ordem: i + 1 }));

export const ETAPAS: Record<Operacao, EtapaCatalogo[]> = {
  TIM: montar([
    { chave: 'TIM_NEGOCIACAO', nome: 'Em negociação', tipo: 'NORMAL', papel: 'NOVO', trilho: 1 },
    { chave: 'TIM_DOCUMENTACAO', nome: 'Em andamento/Doc', tipo: 'NORMAL', papel: 'PENDENCIA', trilho: 2 },
    { chave: 'TIM_CRED_ANDAMENTO', nome: 'Credenciamento em andamento', tipo: 'NORMAL', papel: 'ANALISE', trilho: 3 },
    { chave: 'TIM_CRED_OK', nome: 'Credenciamento OK', tipo: 'NORMAL', papel: 'CREDENCIADO', trilho: 4 },
    { chave: 'TIM_POS_CRED', nome: 'Pós-credenciamento/Operacional', tipo: 'NORMAL', papel: 'CREDENCIADO', trilho: 5 },
    { chave: 'TIM_VENDA_LIBERADA', nome: 'Venda liberada', tipo: 'NORMAL', papel: 'ATIVO', trilho: 6 },
    { chave: 'TIM_ACOMPANHAMENTO', nome: 'Acompanhamento', tipo: 'NORMAL', papel: 'ATIVO', trilho: 7 },
    { chave: 'TIM_DESISTENCIA', nome: 'Desistência', tipo: 'SAIDA', papel: null, trilho: null },
    { chave: 'TIM_DESCREDENCIADO', nome: 'Descredenciado', tipo: 'SAIDA', papel: null, trilho: null },
  ]),
  STARLINK: montar([
    { chave: 'SL_AGUARDANDO', nome: 'Aguardando contato', tipo: 'NORMAL', papel: 'NOVO', trilho: 1 },
    { chave: 'SL_EM_ATENDIMENTO', nome: 'Em atendimento', tipo: 'NORMAL', papel: 'NOVO', trilho: 2 },
    { chave: 'SL_CREDENCIAMENTO', nome: 'Em credenciamento', tipo: 'NORMAL', papel: 'ANALISE', trilho: 3 },
    { chave: 'SL_TREINAMENTO', nome: 'Em treinamento', tipo: 'NORMAL', papel: 'CREDENCIADO', trilho: 4 },
    { chave: 'SL_PARCEIRO', nome: 'Parceiro', tipo: 'NORMAL', papel: 'CREDENCIADO', trilho: 5 },
    { chave: 'SL_CONTRATO', nome: 'Contrato assinado', tipo: 'NORMAL', papel: 'CREDENCIADO', trilho: 6 },
    { chave: 'SL_PRONTO_VENDA', nome: 'Pronto p/ venda', tipo: 'NORMAL', papel: 'ATIVO', trilho: 7 },
    { chave: 'SL_MEI', nome: 'Quer abrir MEI', tipo: 'DESVIO', papel: 'PENDENCIA', trilho: null },
    { chave: 'SL_ALT_CNAE', nome: 'Alteração de CNAE', tipo: 'DESVIO', papel: 'PENDENCIA', trilho: null },
    { chave: 'SL_NURTURE', nome: 'Nurture', tipo: 'SAIDA', papel: null, trilho: null },
    { chave: 'SL_DESCARTADO', nome: 'Descartado', tipo: 'SAIDA', papel: null, trilho: null },
  ]),
};

const POR_CHAVE = new Map<string, EtapaCatalogo>(
  Object.values(ETAPAS).flatMap((lista) => lista.map((e) => [e.chave, e] as const)),
);

/** Etapa do catálogo pela chave; lança se a chave for desconhecida. */
export function etapa(chave: ChaveEtapa): EtapaCatalogo {
  const e = POR_CHAVE.get(chave);
  if (!e) throw new Error(`Chave de etapa desconhecida: ${String(chave)}`);
  return e;
}

/** Verdadeiro se a chave existe no catálogo (inclusive as de saída, sem papel). */
export const chaveConhecida = (chave: string | null | undefined): boolean => !!chave && POR_CHAVE.has(chave);

/** Papel consolidado da chave; nulo para saídas, chave nula ou desconhecida. */
export function papelDaChave(chave: string | null): PapelDoEstagio | null {
  if (!chave) return null;
  return POR_CHAVE.get(chave)?.papel ?? null;
}

export const MOTIVOS_PERDA: Record<MotivoPerdaStarlink, { rotulo: string; classe: 'RECUPERAVEL' | 'DEFINITIVO' }> = {
  NAO_RESPONDEU: { rotulo: 'Não respondeu', classe: 'RECUPERAVEL' },
  SEM_CONTATO: { rotulo: 'Sem contato', classe: 'RECUPERAVEL' },
  OUTRO_PARCEIRO: { rotulo: 'Foi para outro parceiro', classe: 'RECUPERAVEL' },
  SEM_ESTRUTURA: { rotulo: 'Sem estrutura', classe: 'RECUPERAVEL' },
  SEM_INTERESSE: { rotulo: 'Sem interesse', classe: 'DEFINITIVO' },
  SEM_PERFIL: { rotulo: 'Sem perfil', classe: 'DEFINITIVO' },
  CNPJ_IRREGULAR: { rotulo: 'CNPJ irregular', classe: 'DEFINITIVO' },
  REPROVADO_VIVENSIS: { rotulo: 'Reprovado na Vivensis', classe: 'DEFINITIVO' },
  OUTRO: { rotulo: 'Outro', classe: 'DEFINITIVO' },
};

/** Operação a partir do trecho da URL ('tim' | 'starlink', sem diferenciar caixa). */
export function operacaoDaUrl(s: string): Operacao | null {
  const v = s.toLowerCase();
  if (v === 'tim') return 'TIM';
  if (v === 'starlink') return 'STARLINK';
  return null;
}
