/**
 * Regras da esteira TIM — puras, sem banco (spec 5.1).
 * Regra existe, mas não prende: o que foge da regra vira EXCECAO (com justificativa).
 */
import type { CredenciamentoTim } from '@prisma/client';
import { etapa, type ChaveTim } from './catalogo';
import type { Avaliacao, ContextoRegra } from './tipos';

/** Campos exclusivos da TIM (espelho de CredenciamentoTim, sem o id do vínculo). */
export type CamposTim = Omit<CredenciamentoTim, 'credenciamentoId'>;

/** Vínculo TIM sem a linha 1:1 gravada ainda (ex.: registro antigo). */
export const CAMPOS_TIM_VAZIO: CamposTim = {
  origem: null,
  flagTrafegoPago: false,
  statusDescritivo: null,
  dep: null,
  dataCredenciamento: null,
  matriculaSappdv: null,
  promoStatus: null,
  tipoCarteira: null,
  sistemaTimVendas: null,
  sistemaGn: null,
  sistemaTimFormaMais: null,
  sistemaPortalFornecedor: null,
  sistemaMeuTim: null,
  compraChip: null,
  treinamento: null,
  statusParceria: null,
};

type CamposPronto = Pick<CamposTim, 'sistemaTimVendas' | 'compraChip' | 'treinamento'>;

const SISTEMAS = ['sistemaTimVendas', 'sistemaGn', 'sistemaTimFormaMais', 'sistemaPortalFornecedor', 'sistemaMeuTim'] as const;

/** "Pronto" para vender: sistema TIM Vendas ativo, chip comprado e treinamento concluído. */
export function prontoTim(c: CamposPronto): boolean {
  return c.sistemaTimVendas === true && c.compraChip === 'CONCLUIDO' && c.treinamento === 'CONCLUIDO';
}

/** Campos que faltam para o "pronto" (nomes dos campos). */
function faltasPronto(c: CamposPronto): string[] {
  const faltas: string[] = [];
  if (c.sistemaTimVendas !== true) faltas.push('sistemaTimVendas');
  if (c.compraChip !== 'CONCLUIDO') faltas.push('compraChip');
  if (c.treinamento !== 'CONCLUIDO') faltas.push('treinamento');
  return faltas;
}

const vazio = (v: string | null | undefined): boolean => v == null || v === '';

/** Posição no trilho principal (1..7); nula para saídas. */
const trilho = (chave: ChaveTim): number | null => etapa(chave).trilho;

/** Pendências dos gates que a etapa de destino (por posição no trilho) exigiria. */
function pendenciasDoDestino(posicaoDestino: number, c: CamposTim): string[] {
  const pend: string[] = [];
  if (posicaoDestino >= 5 && vazio(c.matriculaSappdv)) pend.push('matriculaSappdv');
  if (posicaoDestino >= 6) pend.push(...faltasPronto(c));
  return pend;
}

export function avaliarMovimentoTim(
  de: ChaveTim,
  para: ChaveTim,
  c: CamposTim,
  ctx: ContextoRegra & { antesDaSaida: ChaveTim | null },
): Avaliacao {
  if (de === para) return { resultado: 'PROIBIDO', motivo: 'O parceiro já está nesta etapa' };

  const origem = trilho(de);
  const destino = trilho(para);

  // Descredenciado não tem reativação; só ADMIN desfaz, como correção de erro de lançamento.
  if (de === 'TIM_DESCREDENCIADO') {
    if (ctx.perfil === 'ADMIN') return { resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' };
    return { resultado: 'PROIBIDO', motivo: 'Descredenciado não tem reativação; só um administrador pode corrigir o lançamento' };
  }

  // Reativar desistente: volta para a etapa em que estava; qualquer outra é exceção.
  if (de === 'TIM_DESISTENCIA') {
    if (ctx.antesDaSaida && para === ctx.antesDaSaida) return { resultado: 'LIVRE', tipo: 'REATIVACAO' };
    return { resultado: 'EXCECAO', pendencias: destino ? pendenciasDoDestino(destino, c) : [] };
  }

  if (para === 'TIM_DESISTENCIA') {
    if (origem != null && origem <= 3) return { resultado: 'LIVRE', tipo: 'SAIDA', exigeMotivo: true };
    return { resultado: 'PROIBIDO', motivo: 'Desistência só é possível nas etapas de 1 a 3' };
  }
  if (para === 'TIM_DESCREDENCIADO') {
    if (origem != null && origem >= 4) return { resultado: 'LIVRE', tipo: 'SAIDA', exigeMotivo: true };
    return { resultado: 'PROIBIDO', motivo: 'Descredenciamento só é possível nas etapas de 4 a 7' };
  }

  // Aqui origem e destino estão no trilho principal.
  if (origem == null || destino == null) return { resultado: 'PROIBIDO', motivo: 'Movimento não previsto' };
  const passo = destino - origem;

  // Só voltar uma etapa é correção; voltar mais que isso é exceção.
  if (passo === -1) return { resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' };
  if (passo < -1) return { resultado: 'EXCECAO', pendencias: [] };

  if (passo === 1) {
    // Só o gate da própria transição: 4→5 matrícula, 5→6 pronto; as demais são livres.
    const pend = destino === 5 ? pendenciasDoDestino(5, c) : destino === 6 ? faltasPronto(c) : [];
    if (pend.length > 0) return { resultado: 'EXCECAO', pendencias: pend };
    return { resultado: 'LIVRE', tipo: 'MOVIMENTO' };
  }

  // Pulo de etapas: exceção, listando também os gates que o destino exigiria.
  return { resultado: 'EXCECAO', pendencias: pendenciasDoDestino(destino, c) };
}

/** Campos que mudam ao entrar numa etapa (só os que precisam mudar). */
export function efeitosDeEntradaTim(para: ChaveTim, c: CamposTim, agora: Date): Partial<CamposTim> {
  const efeitos: Partial<CamposTim> = {};

  // Efeitos por posição do destino no trilho (cobre também pulos forçados).
  const posicao = trilho(para);
  if (posicao != null && posicao >= 4 && c.dataCredenciamento == null) efeitos.dataCredenciamento = agora;
  if (posicao != null && posicao >= 5) {
    if (vazio(c.promoStatus)) efeitos.promoStatus = 'promovido';
    if (vazio(c.tipoCarteira)) efeitos.tipoCarteira = 'recem-entrada';
  }

  // statusParceria acompanha a etapa: fora de Acompanhamento/Desistência/Descredenciado não há status.
  if (para === 'TIM_ACOMPANHAMENTO') efeitos.statusParceria = 'ATIVO';
  else if (para === 'TIM_DESISTENCIA') efeitos.statusParceria = 'DESISTENTE';
  else if (para === 'TIM_DESCREDENCIADO') efeitos.statusParceria = 'DESCREDENCIADO';
  else if (c.statusParceria != null) efeitos.statusParceria = null;

  return efeitos;
}

/** A venda é liberada automaticamente (5 → 6) quando o parceiro está em Pós-cred e fica "pronto". */
export function deveLiberarVenda(etapaAtual: ChaveTim, c: CamposTim): boolean {
  return etapaAtual === 'TIM_POS_CRED' && prontoTim(c);
}

/** Algum sistema passou a "Sim" sem vendedor ativo no PDV: pendência `vendedorAtivo`. */
export function pendenciasDeCamposTim(antes: CamposTim, depois: CamposTim, vendedoresAtivos: number): string[] {
  const virouSim = SISTEMAS.some((s) => antes[s] !== true && depois[s] === true);
  return virouSim && vendedoresAtivos <= 0 ? ['vendedorAtivo'] : [];
}

/**
 * Gates da etapa atual com campos vazios (registros migrados — spec 7: gates não
 * são retroativos). Vazio fora do trilho ou antes do primeiro gate.
 */
export function pendenciasDeDadosTim(atual: ChaveTim, c: CamposTim): string[] {
  const posicao = trilho(atual);
  return posicao == null ? [] : pendenciasDoDestino(posicao, c);
}
