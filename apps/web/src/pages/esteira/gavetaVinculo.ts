/**
 * Lógica da gaveta do vínculo — pura, sem React (testada com vitest).
 * Tri-estado: `null` = não respondido, nunca NÃO; toda comparação é explícita.
 */
import type { ColunaEsteira, TipoHistoricoEsteira, VinculoDetalhe } from '../../lib/esteiraTypes';

/** Botão SIM/NÃO: clicar no valor ativo volta a vazio (`null`). */
export function proximoTriEstado(atual: boolean | null, clicado: boolean): boolean | null {
  return atual === clicado ? null : clicado;
}

/** O campo da operação (`campos.<nome>`) é editável segundo a estrutura. */
export function campoEditavel(colunas: ColunaEsteira[], nome: string): boolean {
  return colunas.some((c) => c.editavel && c.campo === `campos.${nome}`);
}

/** Campo da auditoria que guarda a justificativa (`auditoria.ts` da API). */
export const CAMPO_JUSTIFICATIVA = '_justificativa';

const ROTULOS_FIXOS: Record<string, string> = {
  [CAMPO_JUSTIFICATIVA]: 'Justificativa',
  responsavelId: 'Responsável',
  observacoes: 'Observações',
  motivoSituacao: 'Motivo da situação',
  classeMotivo: 'Classe do motivo',
};

const ROTULOS_VENDEDOR: Record<string, string> = { nome: 'Nome', cpf: 'CPF', telefone: 'Telefone', status: 'Situação' };
const VALORES_FIXOS: Record<string, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  RECUPERAVEL: 'Recuperável',
  DEFINITIVO: 'Definitivo',
};

/** Coluna da estrutura que corresponde ao campo gravado na auditoria. */
const colunaDoCampo = (campo: string, colunas: ColunaEsteira[]) =>
  colunas.find((c) => c.campo === campo || c.campo === `campos.${campo}`) ?? colunas.find((c) => c.chave === campo);

/** Rótulo de uma linha de auditoria; `vendedores.<id>.<campo>` vira "Vendedor <nome>: <campo>". */
export function rotuloDoCampoAuditado(
  campo: string,
  colunas: ColunaEsteira[],
  vendedores: ReadonlyArray<{ id: string; nome: string }>,
): string {
  const vendedor = /^vendedores\.([^.]+)\.(.+)$/.exec(campo);
  if (vendedor) {
    const nome = vendedores.find((v) => v.id === vendedor[1])?.nome;
    return `Vendedor ${nome ?? '(removido)'}: ${ROTULOS_VENDEDOR[vendedor[2]!] ?? vendedor[2]}`;
  }
  return ROTULOS_FIXOS[campo] ?? colunaDoCampo(campo, colunas)?.rotulo ?? campo;
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;

export const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

/** Valor legível de uma linha de auditoria. */
export function formatarValorAuditado(
  campo: string,
  valor: unknown,
  colunas: ColunaEsteira[],
  nomes: ReadonlyMap<string, string>,
): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (valor === true) return 'Sim';
  if (valor === false) return 'Não';
  if (campo === 'responsavelId' && typeof valor === 'string') return nomes.get(valor) ?? 'Outro usuário';
  if (typeof valor === 'string') {
    const opcao = colunaDoCampo(campo, colunas)?.opcoes?.find((o) => o.valor === valor);
    if (opcao) return opcao.rotulo;
    if (VALORES_FIXOS[valor]) return VALORES_FIXOS[valor];
    if (ISO.test(valor) && !Number.isNaN(Date.parse(valor))) return dataCurta(valor);
    return valor;
  }
  return typeof valor === 'number' ? String(valor) : JSON.stringify(valor);
}

export type LinhaAuditoria = VinculoDetalhe['auditoria'][number];
export type GrupoAuditoria = {
  chave: string;
  criadoEm: string;
  usuarioId: string | null;
  justificativa: string | null;
  mudancas: LinhaAuditoria[];
};

/**
 * Uma gravação gera várias linhas no mesmo instante (uma por campo, mais a
 * `_justificativa`): agrupa por instante e usuário, mantendo a ordem recebida.
 */
export function agruparAuditoria(linhas: LinhaAuditoria[]): GrupoAuditoria[] {
  const grupos = new Map<string, GrupoAuditoria>();
  for (const l of linhas) {
    const chave = `${l.criadoEm}|${l.usuarioId ?? ''}`;
    let g = grupos.get(chave);
    if (!g) {
      g = { chave, criadoEm: l.criadoEm, usuarioId: l.usuarioId, justificativa: null, mudancas: [] };
      grupos.set(chave, g);
    }
    if (l.campo === CAMPO_JUSTIFICATIVA) g.justificativa = typeof l.para === 'string' ? l.para : String(l.para ?? '');
    else g.mudancas.push(l);
  }
  return [...grupos.values()];
}

export const ROTULO_TIPO_HISTORICO: Record<TipoHistoricoEsteira, string> = {
  MOVIMENTO: 'Movimento',
  EXCECAO: 'Exceção',
  AUTOMATICO: 'Automático',
  SAIDA: 'Saída',
  REATIVACAO: 'Reativação',
  IMPORTACAO: 'Importação',
  CORRECAO: 'Correção',
};
