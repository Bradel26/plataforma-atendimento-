/**
 * Importação por planilha (spec 6.4) — o plano de uma linha, puro, sem banco.
 *
 * Posicionar por importação **não passa por gates**, mas usa as mesmas regras
 * puras das outras gravações: efeitos de entrada da TIM, travas e etapa
 * derivada da Starlink. A gravação (transação, auditoria, histórico
 * IMPORTACAO) fica em `vinculos.service.ts`.
 */
import type { ClasseMotivo, Operacao } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { MOTIVOS_PERDA, etapa, type ChaveEtapa, type ChaveStarlink, type ChaveTim } from './catalogo';
import { patchStarlinkParaMovimento, semIndefinidos } from './movimento';
import { aplicarTravas, derivarEtapaStarlink, perdaSemMotivo, type CamposStarlink } from './starlink';
import { efeitosDeEntradaTim, type CamposTim } from './tim';

/** Uma linha já validada da planilha (ver `validarLinha`), com o responsável resolvido. */
export type EntradaDeImportacao = {
  parceiro: { cnpj?: string; cpf?: string; telefone?: string; nome?: string; cidade?: string; uf?: string };
  etapa?: ChaveEtapa;
  /** Omitido: não informado (mantém o atual). */
  responsavelId?: string;
  observacoes?: string;
  campos: Partial<CamposTim> | Partial<CamposStarlink>;
};

/** O mínimo de uma etapa do funil que o plano usa. */
export type EstagioDoPlano = { id: string; chave: string | null; ativa: boolean };

/** Estado do vínculo de que a importação parte (existente, ou o recém-nascido na etapa inicial). */
export type PontoDePartida<E extends EstagioDoPlano> = {
  operacao: Operacao;
  chave: ChaveEtapa | null;
  estagioId: string;
  estagios: E[];
  tim: CamposTim;
  starlink: CamposStarlink;
};

export type PlanoDeImportacao<E extends EstagioDoPlano> = {
  /** Nulo quando a etapa não muda (sem histórico). */
  movimento: { para: E; motivoSituacao: string | null; classeMotivo: ClasseMotivo | null } | null;
  tim?: Partial<CamposTim>;
  starlink?: CamposStarlink;
  vinculo: { responsavelId?: string; observacoes?: string; motivoSituacao?: string | null; classeMotivo?: ClasseMotivo | null };
};

export const MOTIVO_IMPORTACAO = 'Importação por planilha';

const proibido = (mensagem: string) => new AppError(400, 'TRANSICAO_PROIBIDA', mensagem);

/**
 * O que a linha grava: campos, responsável, observações e — se a etapa muda —
 * o movimento. Lança o erro da linha (AppError). TIM: saída (Desistência,
 * Descredenciado) não entra por planilha — exige motivo, registrado na ficha.
 * Starlink: a coluna "Etapa" vira o patch da coluna; perda exige motivo.
 */
export function planejarImportacao<E extends EstagioDoPlano>(
  p: PontoDePartida<E>,
  entrada: EntradaDeImportacao,
  agora: Date,
): PlanoDeImportacao<E> {
  const vinculo = semIndefinidos({ responsavelId: entrada.responsavelId, observacoes: entrada.observacoes });

  if (p.operacao === 'TIM') {
    const patch = semIndefinidos(entrada.campos as Partial<CamposTim>);
    if (!entrada.etapa || entrada.etapa === p.chave) return { movimento: null, tim: patch, vinculo };
    const pedida = etapa(entrada.etapa);
    if (pedida.tipo === 'SAIDA') {
      throw new AppError(400, 'EXIGE_MOTIVO', `Etapa "${pedida.nome}": registre a saída pela ficha do parceiro, com motivo`);
    }
    const para = p.estagios.find((e) => e.chave === entrada.etapa);
    if (!para?.ativa) throw proibido(`A etapa ${pedida.nome} não está ativa nesta esteira`);
    return {
      movimento: { para, motivoSituacao: null, classeMotivo: null },
      // Efeitos calculados sobre os campos já com a planilha: o que veio nela prevalece.
      tim: { ...patch, ...efeitosDeEntradaTim(entrada.etapa as ChaveTim, { ...p.tim, ...patch }, agora) },
      vinculo,
    };
  }

  const antes = p.starlink;
  let depois = aplicarTravas(antes, semIndefinidos(entrada.campos as Partial<CamposStarlink>));
  if (entrada.etapa && derivarEtapaStarlink(depois) !== entrada.etapa) {
    const pedida = entrada.etapa as ChaveStarlink;
    try {
      depois = aplicarTravas(depois, patchStarlinkParaMovimento(pedida, depois, agora, depois.motivoPerda ?? undefined));
    } catch (erro) {
      throw proibido(erro instanceof Error ? erro.message : 'Etapa impossível com estes campos');
    }
    if (derivarEtapaStarlink(depois) !== pedida) throw proibido(`O parceiro não pode ir para ${etapa(pedida).nome}`);
  }
  if (perdaSemMotivo(depois)) throw new AppError(400, 'EXIGE_MOTIVO', 'Informe o motivo da perda');
  const destino = derivarEtapaStarlink(depois);
  const para = p.estagios.find((e) => e.chave === destino);
  if (!para) throw proibido(`A etapa ${etapa(destino).nome} não está configurada nesta esteira`);
  const perdido = depois.perdido === true && depois.motivoPerda != null;
  const motivoSituacao = perdido ? MOTIVOS_PERDA[depois.motivoPerda!].rotulo : null;
  const classeMotivo = perdido ? MOTIVOS_PERDA[depois.motivoPerda!].classe : null;
  const muda = para.id !== p.estagioId;
  // Perdido continua na mesma coluna com outro motivo: a situação acompanha (como na edição).
  const trocouMotivo = !muda && motivoSituacao != null && depois.motivoPerda !== antes.motivoPerda;
  return {
    movimento: muda ? { para, motivoSituacao, classeMotivo } : null,
    starlink: depois,
    vinculo: trocouMotivo ? { ...vinculo, motivoSituacao, classeMotivo } : vinculo,
  };
}
