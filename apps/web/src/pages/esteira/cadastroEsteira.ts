/**
 * Cadastro manual e importação da esteira (spec 6.4) — puro, sem React.
 *
 * Novo parceiro: o documento digitado (CNPJ, CPF ou telefone) acha o cadastro
 * central e diz em quais operações o parceiro já está; a API cria o vínculo.
 * Importação: colunas que a planilha pode preencher, problemas por linha e o
 * resumo da prévia/gravação.
 */
import type {
  AcessoOperacoes,
  ColunaEsteira,
  CriarVinculoInput,
  Operacao,
  ResultadoImportacao,
  TipoCaptacao,
  VinculoLinha,
} from '../../lib/esteiraTypes';

export type TipoDocumento = 'CNPJ' | 'CPF' | 'TELEFONE';

export const ROTULO_OPERACAO: Record<Operacao, string> = { TIM: 'TIM', STARLINK: 'Starlink' };
const ORDEM: readonly Operacao[] = ['TIM', 'STARLINK'];

export const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Mesma conta de `apps/api/src/modules/crm/cnpj.ts` (`cnpjValido`). */
function cnpjValido(entrada: string): boolean {
  const c = digitos(entrada);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const base = c.slice(0, 12);
  return dv(base) === Number(c[12]) && dv(base + c[12]) === Number(c[13]);
}

/** Mensagem de erro do documento, ou nulo se está bom (as mesmas regras do `criarVinculoSchema`). */
export function validarDocumento(tipo: TipoDocumento, texto: string): string | null {
  const d = digitos(texto);
  if (tipo === 'CNPJ') return cnpjValido(d) ? null : 'Informe um CNPJ válido';
  if (tipo === 'CPF') return d.length === 11 ? null : 'Informe um CPF válido';
  return d.length >= 10 && d.length <= 13 ? null : 'Informe o telefone com DDD';
}

export function formatarDocumento(tipo: TipoDocumento, d: string): string {
  if (tipo === 'CNPJ' && d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (tipo === 'CPF' && d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
}

/** Telefones iguais com ou sem o código do país (o mais longo termina com o mais curto, ambos com DDD). */
function mesmoTelefone(a: string, b: string): boolean {
  if (a.length < 10 || b.length < 10) return false;
  return a.length >= b.length ? a.endsWith(b) : b.endsWith(a);
}

export type Presenca = { operacao: Operacao; vinculo: VinculoLinha };

/**
 * Em quais operações o parceiro já está. A busca da Lista casa por trecho do
 * documento; aqui fica só quem tem exatamente o documento procurado.
 */
export function presencaNasOperacoes(
  tipo: TipoDocumento,
  documento: string,
  porOperacao: Partial<Record<Operacao, VinculoLinha[]>>,
): Presenca[] {
  const d = digitos(documento);
  const casa = (l: VinculoLinha) =>
    tipo === 'CNPJ'
      ? digitos(l.parceiro.cnpj) === d
      : tipo === 'CPF'
        ? digitos(l.parceiro.cpf) === d
        : mesmoTelefone(digitos(l.parceiro.telefone), d);
  return ORDEM.flatMap((operacao) => (porOperacao[operacao] ?? []).filter(casa).map((vinculo) => ({ operacao, vinculo })));
}

export type FormNovoParceiro = {
  tipo: TipoDocumento;
  documento: string;
  /** Pessoa de contato. */
  nome: string;
  /** Razão social/nome fantasia — só com CNPJ (conta nova). */
  empresa: string;
  telefone: string;
  email: string;
  cidade: string;
  uf: string;
  responsavelId: string;
  observacoes: string;
  tipoCaptacao: TipoCaptacao | '';
};

/** Corpo do `POST /esteiras/:operacao/vinculos`: o documento vai no campo do tipo; vazios ficam de fora. */
export function corpoNovoParceiro(operacao: Operacao, f: FormNovoParceiro): CriarVinculoInput {
  const t = (s: string) => s.trim() || undefined;
  const d = digitos(f.documento);
  const corpo: CriarVinculoInput = {
    ...(f.tipo === 'CNPJ' ? { cnpj: d, empresa: t(f.empresa) } : {}),
    ...(f.tipo === 'CPF' ? { cpf: d } : {}),
    nome: t(f.nome),
    telefone: f.tipo === 'TELEFONE' ? f.documento.trim() : t(f.telefone),
    email: t(f.email),
    cidade: t(f.cidade),
    uf: t(f.uf)?.toUpperCase(),
    responsavelId: t(f.responsavelId),
    observacoes: t(f.observacoes),
    ...(operacao === 'STARLINK' && f.tipoCaptacao ? { tipoCaptacao: f.tipoCaptacao } : {}),
  };
  return Object.fromEntries(Object.entries(corpo).filter(([, v]) => v !== undefined)) as CriarVinculoInput;
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

/** Comuns que a importação grava (mesmo conjunto de `planilhas.ts` na API). */
const COMUNS_IMPORTAVEIS = new Set(['parceiro', 'cnpj', 'cpf', 'telefone', 'cidade', 'uf', 'responsavel', 'etapa', 'observacoes']);

/** Destinos possíveis no mapa de colunas: comuns acima e campos editáveis da operação. */
export const colunasImportaveis = (colunas: ColunaEsteira[]): ColunaEsteira[] =>
  colunas.filter((c) => COMUNS_IMPORTAVEIS.has(c.chave) || !!c.campo?.startsWith('campos.'));

/** Cabeçalhos da planilha que não vão para lugar nenhum. */
export const cabecalhosIgnorados = (mapa: Record<string, string | null>): string[] =>
  Object.entries(mapa)
    .filter(([, destino]) => !destino)
    .map(([cabecalho]) => cabecalho);

export type LinhaComProblema = { linha: number; erros: string[]; avisos: string[] };

/** Erros e avisos juntos por linha da planilha, em ordem. */
export function linhasComProblema(r: ResultadoImportacao): LinhaComProblema[] {
  const porLinha = new Map<number, LinhaComProblema>();
  const da = (linha: number) => porLinha.get(linha) ?? porLinha.set(linha, { linha, erros: [], avisos: [] }).get(linha)!;
  for (const e of r.erros) da(e.linha).erros.push(...e.erros);
  for (const a of r.avisos) da(a.linha).avisos.push(...a.avisos);
  return [...porLinha.values()].sort((a, b) => a.linha - b.linha);
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function textoDoResumo(r: ResultadoImportacao, previa: boolean): string {
  const comErro = r.erros.length;
  if (previa) {
    return (
      `${plural(r.total, 'linha', 'linhas')}: ${plural(r.criadas, 'será criada', 'serão criadas')}, ` +
      `${plural(r.atualizadas, 'será atualizada', 'serão atualizadas')}, ${comErro} com erro (não serão gravadas).`
    );
  }
  return `Importação concluída: ${plural(r.criadas, 'criada', 'criadas')}, ${plural(r.atualizadas, 'atualizada', 'atualizadas')}, ${comErro} com erro.`;
}

// ---------------------------------------------------------------------------
// Operações
// ---------------------------------------------------------------------------

/** Operações em que o usuário pode criar vínculo (EDICAO), na ordem fixa TIM → Starlink. */
export const operacoesComEdicao = (acesso: AcessoOperacoes | undefined): Operacao[] =>
  ORDEM.filter((o) => acesso?.[o] === 'EDICAO');

/** "Adicionar à …" da ficha: com EDICAO e sem vínculo ainda. */
export const operacoesParaAdicionar = (acesso: AcessoOperacoes | undefined, presentes: Operacao[]): Operacao[] =>
  operacoesComEdicao(acesso).filter((o) => !presentes.includes(o));
