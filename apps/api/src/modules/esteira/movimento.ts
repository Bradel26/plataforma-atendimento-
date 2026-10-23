/**
 * Movimento do vínculo entre etapas — a parte pura de `vinculos.service.ts`
 * (sem banco, testada em `vinculos.test.ts`): situação, erros HTTP de uma
 * avaliação, colunas de destino, avisos e etiquetas do card.
 */
import type {
  ClasseMotivo,
  MotivoPerdaStarlink,
  NivelOperacao,
  Operacao,
  Role,
  TipoEtapa,
  TipoHistoricoEsteira,
} from '@prisma/client';
import { podeForcar } from './acesso';
import { ETAPAS, type ChaveEtapa, type ChaveStarlink, type ChaveTim } from './catalogo';
import {
  aplicarTravas,
  avaliarMudancaStarlink,
  derivarEtapaStarlink,
  patchParaColuna,
  pendenciasDeDadosStarlink,
  sugereDescarte,
  type CamposStarlink,
} from './starlink';
import { avaliarMovimentoTim, pendenciasDeDadosTim, type CamposTim } from './tim';
import type { Avaliacao, ContextoRegra } from './tipos';

export type Situacao = 'EM_ANDAMENTO' | 'DESISTENTE' | 'DESCREDENCIADO' | 'NURTURE' | 'DESCARTADO';
export type Destinos = Partial<Record<ChaveEtapa, Avaliacao['resultado']>>;

const SITUACAO_DA_SAIDA: Partial<Record<string, Situacao>> = {
  TIM_DESISTENCIA: 'DESISTENTE',
  TIM_DESCREDENCIADO: 'DESCREDENCIADO',
  SL_NURTURE: 'NURTURE',
  SL_DESCARTADO: 'DESCARTADO',
};

/** Situação não é coluna: vem da etapa (spec 4.4). Saída sem chave conhecida conta como em andamento. */
export function situacaoDaEtapa(tipo: TipoEtapa, chave: string | null): Situacao {
  if (tipo !== 'SAIDA' || !chave) return 'EM_ANDAMENTO';
  return SITUACAO_DA_SAIDA[chave] ?? 'EM_ANDAMENTO';
}

export type ErroDeMovimento = {
  status: 400 | 403 | 409;
  code: 'TRANSICAO_PROIBIDA' | 'EXCECAO_NAO_AUTORIZADA' | 'EXIGE_JUSTIFICATIVA' | 'EXIGE_MOTIVO';
  mensagem: string;
  details?: unknown;
};

const preenchido = (v: string | null | undefined): boolean => !!v?.trim();

/**
 * Traduz a avaliação de um movimento no erro HTTP, ou nulo se pode gravar.
 * Exceção de quem não pode forçar responde 403 antes de pedir justificativa:
 * pedir o texto a quem não pode autorizar só adiaria a recusa.
 */
export function errosDeMovimento(
  av: Avaliacao,
  ctx: { justificativa?: string | null; perfil: Role; nivel?: NivelOperacao; motivo?: string | null },
): ErroDeMovimento | null {
  switch (av.resultado) {
    case 'PROIBIDO':
      return { status: 400, code: 'TRANSICAO_PROIBIDA', mensagem: av.motivo };
    case 'EXCECAO':
      if (!podeForcar(ctx.perfil, ctx.nivel)) {
        return {
          status: 403,
          code: 'EXCECAO_NAO_AUTORIZADA',
          mensagem: 'Este movimento foge da regra e só pode ser autorizado por administrador, supervisor ou gestor',
          details: { pendencias: av.pendencias },
        };
      }
      if (!preenchido(ctx.justificativa)) {
        return {
          status: 409,
          code: 'EXIGE_JUSTIFICATIVA',
          mensagem: 'Informe a justificativa para mover fora da regra',
          details: { resultado: 'EXCECAO', pendencias: av.pendencias },
        };
      }
      return null;
    case 'JUSTIFICATIVA':
      if (!preenchido(ctx.justificativa)) {
        return {
          status: 409,
          code: 'EXIGE_JUSTIFICATIVA',
          mensagem: 'Informe a justificativa deste movimento',
          details: { resultado: 'JUSTIFICATIVA', pendencias: [] },
        };
      }
      return null;
    case 'LIVRE':
      if (av.exigeMotivo && !preenchido(ctx.motivo)) {
        return { status: 400, code: 'EXIGE_MOTIVO', mensagem: 'Informe o motivo da saída' };
      }
      return null;
  }
}

/** Tipo gravado no histórico: o da avaliação, ou EXCECAO quando forçado. */
export function tipoDoHistorico(av: Exclude<Avaliacao, { resultado: 'PROIBIDO' }>): TipoHistoricoEsteira {
  return av.resultado === 'EXCECAO' ? 'EXCECAO' : av.tipo;
}

/** Tira as chaves `undefined` do patch (`null` é valor: limpa o campo). */
export function semIndefinidos<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const SAIDAS_STARLINK: ChaveStarlink[] = ['SL_NURTURE', 'SL_DESCARTADO'];

/**
 * O que gravar ao mover um card Starlink para `destino`. Card perdido indo para
 * uma coluna fora das saídas (reengajar Nurture, reabrir Descartado): primeiro
 * `perdido = null` e a etapa sai da derivação; se não cair no destino pedido,
 * aplica também o patch da coluna. Lança (como `patchParaColuna`) se o card já
 * está lá, se faltar/não bater o motivo ou se o destino é impossível.
 */
export function patchStarlinkParaMovimento(
  destino: ChaveStarlink,
  atual: CamposStarlink,
  agora: Date,
  motivoPerda?: MotivoPerdaStarlink,
): Partial<CamposStarlink> {
  if (atual.perdido !== true || SAIDAS_STARLINK.includes(destino)) {
    return semIndefinidos(patchParaColuna(destino, atual, agora, motivoPerda));
  }
  const reaberto = aplicarTravas(atual, { perdido: null });
  if (derivarEtapaStarlink(reaberto) === destino) return { perdido: null };
  return semIndefinidos({ perdido: null, ...patchParaColuna(destino, reaberto, agora) });
}

/** Resultado da avaliação para cada coluna da TIM (a atual é PROIBIDO). */
export function destinosTim(
  atual: ChaveTim,
  campos: CamposTim,
  ctx: ContextoRegra & { antesDaSaida: ChaveTim | null },
): Destinos {
  const destinos: Destinos = {};
  for (const e of ETAPAS.TIM) {
    const para = e.chave as ChaveTim;
    destinos[para] = para === atual ? 'PROIBIDO' : avaliarMovimentoTim(atual, para, campos, ctx).resultado;
  }
  return destinos;
}

/**
 * Motivo representativo de cada saída, só para calcular o destino: o resultado
 * depende da classe do motivo, não de qual motivo (o diálogo pede o real).
 */
const MOTIVO_DA_SAIDA: Record<'SL_NURTURE' | 'SL_DESCARTADO', MotivoPerdaStarlink> = {
  SL_NURTURE: 'NAO_RESPONDEU',
  SL_DESCARTADO: 'SEM_INTERESSE',
};

/** Resultado da avaliação para cada coluna da Starlink; destino impossível é PROIBIDO. */
export function destinosStarlink(campos: CamposStarlink, agora: Date): Destinos {
  const atual = derivarEtapaStarlink(campos);
  const destinos: Destinos = {};
  for (const e of ETAPAS.STARLINK) {
    const para = e.chave as ChaveStarlink;
    if (para === atual) {
      destinos[para] = 'PROIBIDO';
      continue;
    }
    try {
      const motivo = para === 'SL_NURTURE' || para === 'SL_DESCARTADO' ? MOTIVO_DA_SAIDA[para] : undefined;
      const patch = patchStarlinkParaMovimento(para, campos, agora, motivo);
      destinos[para] = avaliarMudancaStarlink(campos, aplicarTravas(campos, patch)).resultado;
    } catch {
      destinos[para] = 'PROIBIDO';
    }
  }
  return destinos;
}

/** `PRONTO_DESFEITO` só vem na resposta da edição que desfez o "pronto" com a venda já liberada. */
export type Aviso = 'DADOS_PENDENTES' | 'SUGERE_DESCARTE' | 'PRONTO_DESFEITO';

/** Avisos do card: gate da etapa atual com dados vazios; Starlink que pede descarte. */
export function avisosDoVinculo(
  v: { operacao: 'TIM'; chave: ChaveTim; campos: CamposTim } | { operacao: 'STARLINK'; chave: ChaveStarlink; campos: CamposStarlink },
): Aviso[] {
  const avisos: Aviso[] = [];
  if (v.operacao === 'TIM') {
    if (pendenciasDeDadosTim(v.chave, v.campos).length) avisos.push('DADOS_PENDENTES');
    return avisos;
  }
  if (pendenciasDeDadosStarlink(v.chave, v.campos).length) avisos.push('DADOS_PENDENTES');
  if (sugereDescarte(v.campos)) avisos.push('SUGERE_DESCARTE');
  return avisos;
}

/**
 * Colunas do vínculo que mudam junto com a situação. Nada muda se a situação é
 * a mesma (movimento no trilho). Entrar numa saída guarda a etapa de onde saiu
 * (reativar no ponto certo); voltar ao trilho limpa situação e etapa anterior.
 */
export function mudancaDeSituacao(m: {
  de: { id: string; tipo: TipoEtapa; chave: string | null };
  para: { tipo: TipoEtapa; chave: string | null };
  motivo: string | null;
  classe: ClasseMotivo | null;
  agora: Date;
}): {
  situacaoDesde?: Date;
  motivoSituacao?: string | null;
  classeMotivo?: ClasseMotivo | null;
  fechadoEm?: Date | null;
  estagioAntesDaSaidaId?: string | null;
} {
  const antes = situacaoDaEtapa(m.de.tipo, m.de.chave);
  const depois = situacaoDaEtapa(m.para.tipo, m.para.chave);
  if (antes === depois) return {};
  const saindo = depois !== 'EM_ANDAMENTO';
  return {
    situacaoDesde: m.agora,
    motivoSituacao: saindo ? m.motivo : null,
    classeMotivo: saindo ? m.classe : null,
    fechadoEm: saindo ? m.agora : null,
    ...(antes === 'EM_ANDAMENTO' ? { estagioAntesDaSaidaId: m.de.id } : {}),
    ...(depois === 'EM_ANDAMENTO' ? { estagioAntesDaSaidaId: null } : {}),
  };
}

/** Parado a partir do limite de dias da etapa; etapa sem limite nunca fica parada. */
export function estaParado(diasNaEtapa: number, diasParado: number | null): boolean {
  return diasParado != null && diasNaEtapa >= diasParado;
}

const CAPTACAO: Record<NonNullable<CamposStarlink['tipoCaptacao']>, string> = {
  LEAD_INBOUND: 'Lead inbound',
  PROSPECCAO_ATIVA: 'Prospecção ativa',
};
const VIVENSIS: Record<NonNullable<CamposStarlink['vivensisStatus']>, string> = {
  PENDENTE: 'Vivensis pendente',
  APROVADO: 'Vivensis aprovado',
  REPROVADO: 'Vivensis reprovado',
};
const DEP: Record<NonNullable<CamposTim['dep']>, string> = { TIM: 'DEP: TIM', PARCEIRO: 'DEP: Parceiro', BRADEL: 'DEP: Bradel' };

/** Etiquetas mostradas no card (tags que não são etapa). */
export function etiquetasDoVinculo(operacao: Operacao, campos: CamposTim | CamposStarlink): string[] {
  const etiquetas: string[] = [];
  if (operacao === 'TIM') {
    const c = campos as CamposTim;
    if (c.flagTrafegoPago) etiquetas.push('Tráfego pago');
    if (c.dep) etiquetas.push(DEP[c.dep]);
    return etiquetas;
  }
  const c = campos as CamposStarlink;
  if (c.tipoCaptacao) etiquetas.push(CAPTACAO[c.tipoCaptacao]);
  if (c.vsm === true) etiquetas.push('VSM');
  if (c.vivensisStatus) etiquetas.push(VIVENSIS[c.vivensisStatus]);
  return etiquetas;
}
