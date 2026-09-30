/**
 * Regras puras do Ciclo de Vida do Parceiro — sem banco, para serem testadas.
 *
 * O ciclo descreve a RELACAO com o parceiro depois de credenciado, nao a
 * producao dele. O CRM ainda nao tem venda por parceiro, entao nenhuma regra
 * aqui olha venda, faturamento ou "ultima venda", e nenhum status e inferido de
 * produtividade. ATIVO quer dizer "credenciado, operacional e com relacionamento
 * ativo" — nao "vendendo".
 *
 * Automatico so o que os dados do CRM comprovam (etapas de implantacao e
 * interacoes registradas). EM_RISCO, INATIVO e REATIVADO sao julgamento humano:
 * so o consultor sabe que o parceiro "demonstrou desinteresse".
 *
 * Quando existirem dados de producao, entram como campos novos em
 * `FatosDoCiclo` e regras novas em `decidirAutomatico`, sem mexer no resto.
 */

import { DIA_MS } from './esteira';

export const STATUS_CICLO = [
  'NOVO_PARCEIRO',
  'EM_IMPLANTACAO',
  'ATIVO',
  'SEM_ACOMPANHAMENTO',
  'EM_RISCO',
  'INATIVO',
  'REATIVADO',
] as const;

export type StatusCiclo = (typeof STATUS_CICLO)[number];

/** Etapas de implantacao que o consultor marca como concluidas. */
export const ETAPAS_IMPLANTACAO = [
  { chave: 'TREINAMENTO', rotulo: 'Treinamento' },
  { chave: 'ORIENTACOES_INICIAIS', rotulo: 'Orientacoes iniciais' },
  { chave: 'LIBERACAO_ACESSO', rotulo: 'Liberacao de acesso' },
  { chave: 'CADASTRO_PLATAFORMA', rotulo: 'Cadastro em plataforma' },
  { chave: 'RECEBIMENTO_MATERIAIS', rotulo: 'Recebimento de materiais' },
] as const;

export const CHAVES_ETAPAS = ETAPAS_IMPLANTACAO.map((e) => e.chave) as [string, ...string[]];

/** Mais que isto sem interacao registrada e o parceiro vira SEM_ACOMPANHAMENTO. */
export const DIAS_SEM_ACOMPANHAMENTO = 30;
/** Quanto tempo o REATIVADO fica em observacao antes de voltar a ATIVO. */
export const DIAS_REATIVADO = 30;

/** Regras registradas no historico. `MANUAL` e a decisao de uma pessoa. */
export type RegraDoCiclo =
  | 'CREDENCIAMENTO_CONCLUIDO'
  | 'IMPLANTACAO_INICIADA'
  | 'IMPLANTACAO_CONCLUIDA'
  | 'IMPLANTACAO_REABERTA'
  | 'SEM_INTERACAO_30D'
  | 'INTERACAO_REGISTRADA'
  | 'REATIVACAO_CONCLUIDA'
  | 'MANUAL';

export type FatosDoCiclo = {
  status: StatusCiclo;
  statusDesde: Date;
  etapasConcluidas: number;
  totalEtapas: number;
  /** Ultima interacao registrada com o parceiro (conversa, ligacao, atividade). */
  ultimaInteracaoEm: Date | null;
  agora: Date;
};

export type Decisao = { para: StatusCiclo; regra: RegraDoCiclo; motivo: string };

/** Dias inteiros entre duas datas, nunca negativo. */
export const diasEntre = (de: Date, ate: Date) => Math.max(0, Math.floor((ate.getTime() - de.getTime()) / DIA_MS));

/**
 * Proxima mudanca AUTOMATICA de status, ou nulo se nada muda.
 *
 * Uma decisao por chamada: quem chama recalcula ate estabilizar (cada passo e
 * gravado no historico, entao a trilha mostra a sequencia real).
 */
export function decidirAutomatico(f: FatosDoCiclo): Decisao | null {
  switch (f.status) {
    case 'NOVO_PARCEIRO':
    case 'EM_IMPLANTACAO': {
      const alvo: StatusCiclo =
        f.etapasConcluidas >= f.totalEtapas && f.totalEtapas > 0
          ? 'ATIVO'
          : f.etapasConcluidas > 0
            ? 'EM_IMPLANTACAO'
            : 'NOVO_PARCEIRO';
      if (alvo === f.status) return null;
      if (alvo === 'ATIVO') {
        return { para: 'ATIVO', regra: 'IMPLANTACAO_CONCLUIDA', motivo: 'Implantacao concluida' };
      }
      if (alvo === 'EM_IMPLANTACAO') {
        return { para: 'EM_IMPLANTACAO', regra: 'IMPLANTACAO_INICIADA', motivo: 'Inicio da implantacao' };
      }
      return { para: 'NOVO_PARCEIRO', regra: 'IMPLANTACAO_REABERTA', motivo: 'Nenhuma etapa de implantacao concluida' };
    }

    case 'ATIVO':
    case 'REATIVADO': {
      // Sem interacao nenhuma, o relogio corre desde que entrou no status.
      const referencia =
        f.ultimaInteracaoEm && f.ultimaInteracaoEm > f.statusDesde ? f.ultimaInteracaoEm : f.statusDesde;
      const dias = diasEntre(referencia, f.agora);
      if (dias > DIAS_SEM_ACOMPANHAMENTO) {
        return { para: 'SEM_ACOMPANHAMENTO', regra: 'SEM_INTERACAO_30D', motivo: `${dias} dias sem interacao registrada` };
      }
      if (f.status === 'REATIVADO' && diasEntre(f.statusDesde, f.agora) >= DIAS_REATIVADO) {
        return { para: 'ATIVO', regra: 'REATIVACAO_CONCLUIDA', motivo: `${DIAS_REATIVADO} dias de acompanhamento apos a reativacao` };
      }
      return null;
    }

    case 'SEM_ACOMPANHAMENTO':
      // Voltou a ser acompanhado: houve interacao depois de o alerta ser levantado.
      if (f.ultimaInteracaoEm && f.ultimaInteracaoEm > f.statusDesde) {
        return { para: 'ATIVO', regra: 'INTERACAO_REGISTRADA', motivo: 'Nova interacao registrada com o parceiro' };
      }
      return null;

    // Julgamento humano: nenhuma regra automatica tira o parceiro daqui.
    case 'EM_RISCO':
    case 'INATIVO':
      return null;
  }
}

/** Status que exigem motivo escrito quando definidos por uma pessoa. */
export const EXIGEM_MOTIVO: readonly StatusCiclo[] = ['EM_RISCO', 'INATIVO'];

/**
 * Valida uma mudanca MANUAL. Devolve a mensagem de erro, ou nulo se vale.
 *
 * Manual so para o que depende de julgamento: EM_RISCO, INATIVO e REATIVADO.
 * O resto (novo, implantacao, ativo, sem acompanhamento) vem dos fatos.
 */
export function validarMudancaManual(de: StatusCiclo, para: StatusCiclo, motivo: string | undefined): string | null {
  if (para === de) return 'O parceiro ja esta neste status';
  if (para !== 'EM_RISCO' && para !== 'INATIVO' && para !== 'REATIVADO') {
    return 'Este status e definido automaticamente pelo acompanhamento e pela implantacao';
  }
  if (para === 'EM_RISCO' && de === 'INATIVO') return 'Parceiro inativo so pode ser reativado';
  if (para === 'REATIVADO' && de !== 'EM_RISCO' && de !== 'INATIVO') {
    return 'So parceiro em risco ou inativo pode ser reativado';
  }
  if (EXIGEM_MOTIVO.includes(para) && !motivo?.trim()) return 'Informe o motivo';
  return null;
}

/** Ordem de urgencia para a lista de atencao do consultor. */
export const PRIORIDADE_ATENCAO: Partial<Record<StatusCiclo, number>> = {
  EM_RISCO: 1,
  SEM_ACOMPANHAMENTO: 2,
  INATIVO: 3,
  REATIVADO: 4,
};
