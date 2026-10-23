/**
 * Regras da esteira Starlink — puras, sem banco (spec 5.2).
 *
 * A etapa é DERIVADA dos campos ("furthest wins"); `estagioId` é só cache.
 * Tri-estado: NULL = não respondido, true = SIM, false = NÃO. NULL nunca é NÃO,
 * por isso toda comparação é `=== true`, `=== false` ou `== null`.
 */
import type { CredenciamentoStarlink, MotivoPerdaStarlink, VivensisStatus } from '@prisma/client';
import { MOTIVOS_PERDA, etapa, type ChaveStarlink } from './catalogo';
import type { Avaliacao } from './tipos';

/** Campos exclusivos da Starlink (espelho de CredenciamentoStarlink, sem o id do vínculo). */
export type CamposStarlink = Omit<CredenciamentoStarlink, 'credenciamentoId'>;

export const CAMPOS_STARLINK_VAZIO: CamposStarlink = {
  tipoCaptacao: null,
  primeiroContatoEm: null,
  cnpjApto: null,
  mei: null,
  altCnae: null,
  vsm: null,
  treinamento: null,
  parceiro: null,
  contrato: null,
  prontoVenda: null,
  perdido: null,
  vivensisStatus: null,
  motivoPerda: null,
};

type CampoTriEstado = 'cnpjApto' | 'mei' | 'altCnae' | 'vsm' | 'treinamento' | 'parceiro' | 'contrato' | 'prontoVenda';
type CampoTrilho = 'primeiroContatoEm' | 'cnpjApto' | 'treinamento' | 'parceiro' | 'contrato' | 'prontoVenda';

/** Campo do trilho que coloca o card em cada posição 2..7 (posição 1 = Aguardando, sem campo). */
const CAMPO_DA_POSICAO: Record<number, CampoTrilho> = {
  2: 'primeiroContatoEm',
  3: 'cnpjApto',
  4: 'treinamento',
  5: 'parceiro',
  6: 'contrato',
  7: 'prontoVenda',
};
const POSICOES = [2, 3, 4, 5, 6, 7] as const;

/** Tri-estados que, uma vez respondidos, só voltam com correção (`perdido` tem regra própria). */
const TRI_ESTADOS: CampoTriEstado[] = ['cnpjApto', 'mei', 'altCnae', 'vsm', 'treinamento', 'parceiro', 'contrato', 'prontoVenda'];

/** Pré-requisitos da tabela "Para marcar / Exige" (spec 5.2), por campo do trilho. */
const PRE_REQUISITOS: Record<CampoTrilho, Array<{ campo: keyof CamposStarlink; ok: (c: CamposStarlink) => boolean; trilho: boolean }>> = {
  primeiroContatoEm: [],
  cnpjApto: [{ campo: 'primeiroContatoEm', ok: (c) => c.primeiroContatoEm != null, trilho: true }],
  treinamento: [
    { campo: 'cnpjApto', ok: (c) => c.cnpjApto === true, trilho: true },
    { campo: 'vsm', ok: (c) => c.vsm === true, trilho: false },
    { campo: 'vivensisStatus', ok: (c) => c.vivensisStatus === 'APROVADO', trilho: false },
  ],
  parceiro: [{ campo: 'treinamento', ok: (c) => c.treinamento === true, trilho: true }],
  contrato: [{ campo: 'parceiro', ok: (c) => c.parceiro === true, trilho: true }],
  prontoVenda: [{ campo: 'contrato', ok: (c) => c.contrato === true, trilho: true }],
};

/** O campo do trilho está marcado (SIM; para o primeiro contato, data preenchida). */
const marcado = (c: CamposStarlink, campo: CampoTrilho): boolean =>
  campo === 'primeiroContatoEm' ? c.primeiroContatoEm != null : c[campo] === true;

/** Classe da perda; `perdido` sem motivo conta como DEFINITIVO. */
function classeDaPerda(motivo: MotivoPerdaStarlink | null): 'RECUPERAVEL' | 'DEFINITIVO' {
  return motivo == null ? 'DEFINITIVO' : MOTIVOS_PERDA[motivo].classe;
}

/** Posição no trilho (1..7) pelos campos, ignorando perda e desvios. */
function posicaoNoTrilho(c: CamposStarlink): number {
  for (let p = 7; p >= 2; p -= 1) if (marcado(c, CAMPO_DA_POSICAO[p]!)) return p;
  return 1;
}

/** Etapa derivada dos campos — a lista ordenada da spec 5.2 (o primeiro que casa vence). */
export function derivarEtapaStarlink(c: CamposStarlink): ChaveStarlink {
  if (c.perdido === true) return classeDaPerda(c.motivoPerda) === 'RECUPERAVEL' ? 'SL_NURTURE' : 'SL_DESCARTADO';
  if (c.prontoVenda === true) return 'SL_PRONTO_VENDA';
  if (c.contrato === true) return 'SL_CONTRATO';
  if (c.parceiro === true) return 'SL_PARCEIRO';
  if (c.treinamento === true) return 'SL_TREINAMENTO';
  if (c.cnpjApto === true) return 'SL_CREDENCIAMENTO';
  if (c.altCnae === true) return 'SL_ALT_CNAE';
  if (c.mei === true && c.cnpjApto === false) return 'SL_MEI';
  if (c.primeiroContatoEm != null) return 'SL_EM_ATENDIMENTO';
  return 'SL_AGUARDANDO';
}

/**
 * Aplica o patch e depois as travas do PDF, nesta ordem. As travas de gatilho
 * (Vivensis reprovada, parceiro SIM, altCnae SIM) disparam quando o patch LEVA o
 * campo ao valor — não pelo estado. Pelo estado, um card com altCnae = SIM nunca
 * poderia ser perdido, e "perdido SIM → parceiro NÃO" seria desfeito por
 * "parceiro SIM → perdido NÃO". As duas últimas são invariantes do estado.
 */
export function aplicarTravas(antes: CamposStarlink, patch: Partial<CamposStarlink>): CamposStarlink {
  const r: CamposStarlink = { ...antes, ...patch };
  const levou = <K extends keyof CamposStarlink>(campo: K, valor: CamposStarlink[K]) =>
    r[campo] === valor && antes[campo] !== valor;

  if (levou('vivensisStatus', 'REPROVADO')) {
    r.perdido = true;
    r.motivoPerda = 'REPROVADO_VIVENSIS';
  }
  if (levou('parceiro', true)) r.perdido = false;
  if (levou('altCnae', true)) r.perdido = false;
  if (r.perdido === true && r.parceiro !== false) r.parceiro = false;
  if (r.perdido !== true) r.motivoPerda = null;
  return r;
}

/** Vivensis "voltou": APROVADO → PENDENTE, respondido → NULL, ou desfazer a reprovação. */
function vivensisRecuou(de: VivensisStatus | null, para: VivensisStatus | null): boolean {
  if (de == null || de === para) return false;
  if (para == null) return true;
  if (de === 'APROVADO' && para === 'PENDENTE') return true;
  return de === 'REPROVADO';
}

/**
 * Avalia a mudança de campos (já com as travas aplicadas em `depois`).
 * Precedência: pré-requisito faltando (EXCECAO) > correção > saída/reativação > movimento.
 */
export function avaliarMudancaStarlink(antes: CamposStarlink, depois: CamposStarlink): Avaliacao {
  // (a) Campo do trilho indo para SIM sem o pré-requisito. O pré-requisito de
  // trilho tem de estar marcado ANTES (marcar dois passos juntos é pulo); VSM e
  // Vivensis, sub-passos do credenciamento, podem vir na mesma gravação.
  const pendencias: string[] = [];
  for (const p of POSICOES) {
    const campo = CAMPO_DA_POSICAO[p]!;
    if (marcado(antes, campo) || !marcado(depois, campo)) continue;
    for (const req of PRE_REQUISITOS[campo]) {
      const atendido = req.ok(depois) && (!req.trilho || req.ok(antes));
      if (!atendido && !pendencias.includes(req.campo)) pendencias.push(req.campo);
    }
  }
  if (pendencias.length > 0) return { resultado: 'EXCECAO', pendencias };

  const perdeu = antes.perdido !== true && depois.perdido === true;

  // (b) Campo respondido voltando: NULL, ou SIM → NÃO.
  const recuou = TRI_ESTADOS.some((campo) => {
    const de = antes[campo];
    const para = depois[campo];
    // Perder zera `parceiro` pela trava; isso é a saída, não correção.
    if (campo === 'parceiro' && perdeu) return false;
    return (de != null && para == null) || (de === true && para === false);
  });
  const limpouContato = antes.primeiroContatoEm != null && depois.primeiroContatoEm == null;
  if (recuou || limpouContato || vivensisRecuou(antes.vivensisStatus, depois.vivensisStatus)) {
    return { resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' };
  }

  // (c) Saindo da perda: Descartado reabre com correção; Nurture reengaja livre.
  if (antes.perdido === true) {
    const classeAntes = classeDaPerda(antes.motivoPerda);
    if (depois.perdido !== true) {
      return classeAntes === 'DEFINITIVO'
        ? { resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' }
        : { resultado: 'LIVRE', tipo: 'REATIVACAO' };
    }
    // Continua perdido, mas o motivo troca Descartado por Nurture: também é reabrir.
    if (classeAntes === 'DEFINITIVO' && classeDaPerda(depois.motivoPerda) === 'RECUPERAVEL') {
      return { resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' };
    }
  }

  // (d) Entrando na perda (inclusive pela Vivensis reprovada).
  if (perdeu) return { resultado: 'LIVRE', tipo: 'SAIDA', exigeMotivo: true };

  // (e) O resto.
  return { resultado: 'LIVRE', tipo: 'MOVIMENTO' };
}

/**
 * O que gravar quando o card é solto na coluna `destino` do Kanban. Lança se o
 * card já está lá, se faltar/não bater o motivo da perda, ou se o resultado não
 * cairia na coluna (desvio depois do credenciamento — o trilho à frente vence).
 */
export function patchParaColuna(
  destino: ChaveStarlink,
  atual: CamposStarlink,
  agora: Date,
  motivo?: MotivoPerdaStarlink,
): Partial<CamposStarlink> {
  if (derivarEtapaStarlink(atual) === destino) throw new Error('O parceiro já está nesta etapa');

  const patch: Partial<CamposStarlink> = {};

  if (destino === 'SL_NURTURE' || destino === 'SL_DESCARTADO') {
    if (motivo == null) throw new Error('Informe o motivo da perda');
    const esperada = destino === 'SL_NURTURE' ? 'RECUPERAVEL' : 'DEFINITIVO';
    if (MOTIVOS_PERDA[motivo].classe !== esperada) {
      throw new Error(`O motivo "${MOTIVOS_PERDA[motivo].rotulo}" não leva a ${etapa(destino).nome}`);
    }
    patch.perdido = true;
    patch.motivoPerda = motivo;
    return conferirDestino(destino, atual, patch);
  }

  // Qualquer coluna fora das saídas reabre um card perdido.
  if (atual.perdido === true) patch.perdido = null;

  if (destino === 'SL_MEI') {
    patch.mei = true;
    patch.cnpjApto = false;
    if (atual.altCnae === true) patch.altCnae = null; // alteração de CNAE vence MEI na derivação
    return conferirDestino(destino, atual, patch);
  }
  if (destino === 'SL_ALT_CNAE') {
    patch.altCnae = true;
    return conferirDestino(destino, atual, patch);
  }

  // Destino no trilho principal.
  const posDestino = etapa(destino).trilho!;
  if (posDestino === 1) {
    for (const p of POSICOES) patch[CAMPO_DA_POSICAO[p]!] = null;
  } else {
    const campo = CAMPO_DA_POSICAO[posDestino]!;
    if (campo === 'primeiroContatoEm') {
      if (atual.primeiroContatoEm == null) patch.primeiroContatoEm = agora;
    } else {
      patch[campo] = true;
    }
    // Voltando: limpa os campos das etapas acima do destino.
    if (posDestino < posicaoNoTrilho(atual)) {
      for (const p of POSICOES) if (p > posDestino) patch[CAMPO_DA_POSICAO[p]!] = null;
    }
  }
  // Abaixo do credenciamento os desvios venceriam o destino: saem do caminho.
  if (posDestino <= 2) {
    const cnpjApto = 'cnpjApto' in patch ? patch.cnpjApto : atual.cnpjApto;
    if (atual.altCnae === true) patch.altCnae = null;
    if (atual.mei === true && cnpjApto === false) patch.mei = null;
  }
  return conferirDestino(destino, atual, patch);
}

/** Garante que o patch (com as travas) leva o card para a coluna pedida. */
function conferirDestino(destino: ChaveStarlink, atual: CamposStarlink, patch: Partial<CamposStarlink>) {
  if (derivarEtapaStarlink(aplicarTravas(atual, patch)) !== destino) {
    throw new Error(
      `O parceiro não pode ir para ${etapa(destino).nome}: o trilho já passou do credenciamento. Volte a etapa antes.`,
    );
  }
  return patch;
}

/** `cnpjApto = NÃO` sem MEI e sem alteração de CNAE: sugerir descarte (o operador confirma). */
export function sugereDescarte(c: CamposStarlink): boolean {
  return c.cnpjApto === false && c.mei !== true && c.altCnae !== true;
}

/**
 * Pré-requisitos das etapas até a atual que estão vazios — registros migrados
 * em etapa avançada sem os campos do gate (spec 7). Vazio fora do trilho.
 */
export function pendenciasDeDadosStarlink(atual: ChaveStarlink, c: CamposStarlink): string[] {
  const posicao = etapa(atual).trilho;
  if (posicao == null) return [];
  const pendencias: string[] = [];
  for (const p of POSICOES) {
    if (p > posicao) break;
    for (const req of PRE_REQUISITOS[CAMPO_DA_POSICAO[p]!]) {
      if (!req.ok(c) && !pendencias.includes(req.campo)) pendencias.push(req.campo);
    }
  }
  return pendencias;
}
