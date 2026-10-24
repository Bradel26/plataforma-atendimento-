/**
 * Planilhas da esteira (spec 6.4) — a parte pura: formatar a exportação,
 * proteger contra injeção de fórmula, mapear cabeçalhos e validar cada linha
 * importada. Leitura/escrita de arquivo e banco ficam em `planilhas.service.ts`.
 *
 * A importação aceita os mesmos rótulos que a exportação escreve (ida e volta),
 * comparados sem acento, caixa nem pontuação; também aceita a chave da coluna.
 */
import type { Operacao } from '@prisma/client';
import { UF_POR_DDD } from '../../lib/ddd';
import { cnpjValido } from '../crm/cnpj';
import { ETAPAS, type ChaveEtapa } from './catalogo';
import { COLUNAS, type ColunaEsteira, type VinculoLinha } from './colunas';
import type { CamposStarlink } from './starlink';
import type { CamposTim } from './tim';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Texto comparável: sem acento, minúsculo, só letras e dígitos. */
export const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Caracteres que fazem o Excel/LibreOffice interpretar a célula como fórmula (CSV injection). */
const INICIO_DE_FORMULA = ['=', '+', '-', '@', '\t', '\r'];

/** Texto que começaria uma fórmula ganha `'` na frente (o Excel exibe como texto). */
export function neutralizarFormula(texto: string): string {
  return texto.length > 0 && INICIO_DE_FORMULA.includes(texto[0]!) ? `'${texto}` : texto;
}

/** Desfaz `neutralizarFormula` na importação (reimportar uma exportação não acumula aspas). */
const desneutralizar = (texto: string): string =>
  texto.length > 1 && texto[0] === "'" && INICIO_DE_FORMULA.includes(texto[1]!) ? texto.slice(1) : texto;

/** Brasil sem horário de verão desde 2019: o dia comercial é sempre em -03:00. */
const FUSO_MS = 3 * 3_600_000;
const doisDigitos = (n: number) => String(n).padStart(2, '0');
const dataBr = (d: Date) => `${doisDigitos(d.getUTCDate())}/${doisDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

/** Instante → dd/mm/aaaa em Brasília. */
function formatarData(valor: string | Date): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return dataBr(new Date(d.getTime() - FUSO_MS));
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

/** Valor da coluna como texto da planilha: tri-estado nulo é vazio (nunca "Não"); data dd/mm/aaaa; enum pelo rótulo. */
function textoDaColuna(coluna: ColunaEsteira, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '';
  switch (coluna.tipo) {
    case 'booleano':
    case 'booleano3':
      return valor === true ? 'Sim' : valor === false ? 'Não' : String(valor);
    case 'data':
      return formatarData(valor as string);
    case 'enum':
      return coluna.opcoes?.find((o) => o.valor === valor)?.rotulo ?? String(valor);
    default:
      return String(valor);
  }
}

/** Linhas da planilha (chaveadas pela chave da coluna), na ordem das colunas pedidas. */
export function linhasDeExportacao(linhas: VinculoLinha[], colunas: ColunaEsteira[]): Array<Record<string, string>> {
  return linhas.map((l) => Object.fromEntries(colunas.map((c) => [c.chave, textoDaColuna(c, l.valores[c.chave])])));
}

/**
 * Cabeçalho de cada coluna: o rótulo; rótulo repetido (Starlink: "Parceiro" é o
 * nome e também o tri-estado) ganha a chave entre parênteses, que `mapearCabecalhos` reconhece.
 */
export function cabecalhosDeExportacao(colunas: ColunaEsteira[]): string[] {
  const vistos = new Set<string>();
  return colunas.map((c) => {
    const n = normalizar(c.rotulo);
    if (vistos.has(n)) return `${c.rotulo} (${c.chave})`;
    vistos.add(n);
    return c.rotulo;
  });
}

// ---------------------------------------------------------------------------
// Importação: colunas
// ---------------------------------------------------------------------------

/** Colunas comuns que a importação grava (cadastro central só na criação; etapa e responsável sempre). */
const COMUNS_IMPORTAVEIS = new Set(['parceiro', 'cnpj', 'cpf', 'telefone', 'cidade', 'uf', 'responsavel', 'etapa', 'observacoes']);

/** A importação grava a coluna? Comuns acima e campos editáveis da operação. */
export const importavel = (c: ColunaEsteira): boolean => COMUNS_IMPORTAVEIS.has(c.chave) || !!c.campo?.startsWith('campos.');

const importaveis = (operacao: Operacao) => COLUNAS[operacao].filter(importavel);

/** Coluna importável por cabeçalho: "Rótulo (chave)", chave ou rótulo, nesta ordem de preferência. */
function colunaDoCabecalho(cabecalho: string, colunas: ColunaEsteira[]): ColunaEsteira | null {
  const entreParenteses = /\(([^()]+)\)\s*$/.exec(cabecalho)?.[1];
  if (entreParenteses) {
    const n = normalizar(entreParenteses);
    const c = colunas.find((x) => normalizar(x.chave) === n);
    if (c) return c;
  }
  const n = normalizar(cabecalho);
  if (!n) return null;
  return colunas.find((x) => normalizar(x.chave) === n) ?? colunas.find((x) => normalizar(x.rotulo) === n) ?? null;
}

/** Cabeçalho da planilha → chave da coluna importável da operação (nulo: ignorado). */
export function mapearCabecalhos(cabecalhos: string[], colunas: ColunaEsteira[]): Record<string, string | null> {
  const candidatas = colunas.filter(importavel);
  return Object.fromEntries(cabecalhos.map((h) => [h, colunaDoCabecalho(h, candidatas)?.chave ?? null]));
}

/** Chaves aceitas num mapa informado: importáveis de alguma das operações. */
export function chaveImportavelEmAlguma(chave: string): boolean {
  return importaveis('TIM').some((c) => c.chave === chave) || importaveis('STARLINK').some((c) => c.chave === chave);
}

// ---------------------------------------------------------------------------
// Importação: validação da linha
// ---------------------------------------------------------------------------

export type ParceiroImportado = { cnpj?: string; cpf?: string; telefone?: string; nome?: string; cidade?: string; uf?: string };

export type LinhaImportada = {
  /** Linha na planilha (a 1 é o cabeçalho). */
  linha: number;
  erros: string[];
  /** Colunas ignoradas (ex.: campo da outra operação). Não impedem a linha. */
  avisos: string[];
  parceiro: ParceiroImportado;
  etapa?: ChaveEtapa;
  /** Responsável pelo e-mail (com "@") ou pelo nome do usuário. */
  responsavelEmail?: string;
  responsavelNome?: string;
  observacoes?: string;
  campos: Partial<CamposTim> | Partial<CamposStarlink>;
};

export type OpcoesDeValidacao = {
  /** Nomes das etapas na organização (renomeáveis) → chave. */
  etapasPorNome?: Record<string, ChaveEtapa>;
  /** Número da linha na planilha (padrão 2). */
  linha?: number;
};

const UFS = new Set(Object.values(UF_POR_DDD));
const SIM = new Set(['sim', 's', 'true', 'verdadeiro', '1', 'x', 'yes', 'y']);
const NAO = new Set(['nao', 'n', 'false', 'falso', '0', 'no']);
/** Tri-estado limpo explicitamente ("não respondido"). */
const VAZIO_EXPLICITO = new Set(['-', '—', '–']);

/** Limites de texto dos campos da operação (os mesmos da edição). */
const LIMITE_TEXTO: Record<string, number> = { statusDescritivo: 1000, matriculaSappdv: 60, promoStatus: 60, tipoCarteira: 60 };

function simNao(texto: string): boolean | null {
  const n = normalizar(texto);
  if (SIM.has(n)) return true;
  if (NAO.has(n)) return false;
  return null;
}

/** dd/mm/aaaa (ou aaaa-mm-dd) → início do dia em -03:00; nulo se não é data real. */
function lerData(texto: string): Date | null {
  let d: number, m: number, a: number;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(texto);
  if (br) [d, m, a] = [Number(br[1]), Number(br[2]), Number(br[3])];
  else if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null;
  return new Date(data.getTime() + FUSO_MS);
}

const digitos = (v: string) => v.replace(/\D/g, '');

/** Etapa pelo nome da organização, nome do catálogo ou chave — só as desta operação. */
function etapaDoTexto(operacao: Operacao, texto: string, porNome: Record<string, ChaveEtapa> | undefined): ChaveEtapa | null {
  const n = normalizar(texto);
  const daOperacao = new Set<string>(ETAPAS[operacao].map((e) => e.chave));
  for (const [nome, chave] of Object.entries(porNome ?? {})) {
    if (normalizar(nome) === n && daOperacao.has(chave)) return chave;
  }
  return ETAPAS[operacao].find((e) => normalizar(e.chave) === n || normalizar(e.nome) === n)?.chave ?? null;
}

/** Valor de um campo da operação conforme o tipo da coluna; `undefined` com erro. */
function valorDoCampo(coluna: ColunaEsteira, campo: string, texto: string, erros: string[]): unknown {
  const erro = (msg: string) => {
    erros.push(`${coluna.rotulo}: ${msg}`);
    return undefined;
  };
  switch (coluna.tipo) {
    case 'booleano': {
      const v = simNao(texto);
      return v === null ? erro(`use Sim ou Não ("${texto}")`) : v;
    }
    case 'booleano3': {
      if (VAZIO_EXPLICITO.has(texto)) return null;
      const v = simNao(texto);
      return v === null ? erro(`use Sim, Não ou vazio ("${texto}")`) : v;
    }
    case 'enum': {
      const n = normalizar(texto);
      const opcao = coluna.opcoes?.find((o) => normalizar(o.valor) === n || normalizar(o.rotulo) === n);
      return opcao ? opcao.valor : erro(`valor "${texto}" não aceito (${(coluna.opcoes ?? []).map((o) => o.rotulo).join(', ')})`);
    }
    case 'data': {
      const d = lerData(texto);
      return d ?? erro(`data inválida "${texto}" (use dd/mm/aaaa)`);
    }
    default: {
      const limite = LIMITE_TEXTO[campo] ?? 500;
      return texto.length > limite ? erro(`texto acima de ${limite} caracteres`) : texto;
    }
  }
}

/**
 * Valida e converte uma linha bruta (cabeçalho → texto) pelo mapa. Célula vazia
 * não informa nada (não limpa o campo). Coluna da outra operação: aviso.
 */
export function validarLinha(
  operacao: Operacao,
  bruta: Record<string, string>,
  mapa: Record<string, string | null>,
  opcoes: OpcoesDeValidacao = {},
): LinhaImportada {
  const outra: Operacao = operacao === 'TIM' ? 'STARLINK' : 'TIM';
  const minhas = importaveis(operacao);
  const daOutra = importaveis(outra);
  const r: LinhaImportada = { linha: opcoes.linha ?? 2, erros: [], avisos: [], parceiro: {}, campos: {} };
  const campos = r.campos as Record<string, unknown>;

  for (const [cabecalho, bruto] of Object.entries(bruta)) {
    const texto = desneutralizar(String(bruto ?? '').trim());
    if (!texto) continue;
    const chave = Object.hasOwn(mapa, cabecalho) ? mapa[cabecalho] : null;
    const coluna = chave ? minhas.find((c) => c.chave === chave) : undefined;

    if (!coluna) {
      // Campo da outra operação (pelo mapa ou pelo próprio cabeçalho): ignorado com aviso.
      const alheia = chave ? daOutra.find((c) => c.chave === chave) : colunaDoCabecalho(cabecalho, daOutra);
      if (alheia && !minhas.some((c) => c.chave === alheia.chave)) {
        r.avisos.push(`Coluna "${cabecalho}" é da ${outra === 'TIM' ? 'TIM' : 'Starlink'}: ignorada`);
      } else if (chave) {
        r.avisos.push(`Coluna "${cabecalho}" não é importável: ignorada`);
      }
      continue;
    }

    switch (coluna.chave) {
      case 'parceiro':
        if (texto.length < 2 || texto.length > 160) r.erros.push('Parceiro: informe um nome de 2 a 160 caracteres');
        else r.parceiro.nome = texto;
        break;
      case 'cnpj': {
        let d = digitos(texto);
        // Planilha que guardou o CNPJ como número perde os zeros à esquerda.
        if (d.length >= 12 && d.length < 14) d = d.padStart(14, '0');
        if (cnpjValido(d)) r.parceiro.cnpj = d;
        else r.erros.push(`CNPJ inválido: "${texto}"`);
        break;
      }
      case 'cpf': {
        let d = digitos(texto);
        if (d.length >= 9 && d.length < 11) d = d.padStart(11, '0');
        if (d.length === 11) r.parceiro.cpf = d;
        else r.erros.push(`CPF inválido: "${texto}"`);
        break;
      }
      case 'telefone':
        if (digitos(texto).length < 8 || texto.length > 30) r.erros.push(`Telefone inválido: "${texto}"`);
        else r.parceiro.telefone = texto;
        break;
      case 'cidade':
        if (texto.length > 120) r.erros.push('Cidade: texto acima de 120 caracteres');
        else r.parceiro.cidade = texto;
        break;
      case 'uf': {
        const uf = texto.toUpperCase();
        if (UFS.has(uf)) r.parceiro.uf = uf;
        else r.erros.push(`UF inválida: "${texto}"`);
        break;
      }
      case 'responsavel':
        if (texto.includes('@')) r.responsavelEmail = texto.toLowerCase();
        else r.responsavelNome = texto;
        break;
      case 'etapa': {
        const e = etapaDoTexto(operacao, texto, opcoes.etapasPorNome);
        if (e) r.etapa = e;
        else r.erros.push(`Etapa "${texto}" não existe nesta esteira`);
        break;
      }
      case 'observacoes':
        if (texto.length > 2000) r.erros.push('Observações: texto acima de 2000 caracteres');
        else r.observacoes = texto;
        break;
      default: {
        const campo = coluna.campo!.slice('campos.'.length);
        const valor = valorDoCampo(coluna, campo, texto, r.erros);
        if (valor !== undefined) campos[campo] = valor;
      }
    }
  }

  if (!r.parceiro.cnpj && !r.parceiro.cpf && !r.parceiro.telefone) r.erros.push('Informe CNPJ, CPF ou telefone');
  return r;
}

// ---------------------------------------------------------------------------
// Leitura de CSV e XLSX
// ---------------------------------------------------------------------------

/**
 * Número na planilha de cada linha de dados que `lerCsv` devolve, na mesma
 * ordem: `lerCsv` pula linhas em branco, e o erro tem de apontar a linha real.
 */
export function numerosDasLinhasCsv(texto: string): number[] {
  const fisicas = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
  const numeros = fisicas.flatMap((l, i) => (l.trim().length > 0 ? [i + 1] : []));
  return numeros.slice(1); // a primeira não vazia é o cabeçalho
}

/**
 * Soma dos tamanhos descompactados declarados no diretório central do ZIP (o
 * XLSX é um ZIP). Nulo se o arquivo não é um ZIP legível ou usa ZIP64 (tamanhos
 * acima de 4 GB): quem chama recusa. Defesa contra "zip bomb" antes de abrir.
 */
export function tamanhoDescompactadoDoZip(zip: Buffer): number | null {
  const FIM_DO_DIRETORIO = 0x06054b50;
  const ENTRADA_DO_DIRETORIO = 0x02014b50;
  // O registro final tem 22 bytes mais um comentário de até 65535.
  const inicioDaBusca = Math.max(0, zip.length - 22 - 0xffff);
  let fim = -1;
  for (let i = zip.length - 22; i >= inicioDaBusca; i -= 1) {
    if (zip.readUInt32LE(i) === FIM_DO_DIRETORIO) {
      fim = i;
      break;
    }
  }
  if (fim < 0) return null;
  const entradas = zip.readUInt16LE(fim + 10);
  let posicao = zip.readUInt32LE(fim + 16);
  if (entradas === 0xffff || posicao === 0xffffffff) return null;
  let total = 0;
  for (let n = 0; n < entradas; n += 1) {
    if (posicao + 46 > zip.length || zip.readUInt32LE(posicao) !== ENTRADA_DO_DIRETORIO) return null;
    const tamanho = zip.readUInt32LE(posicao + 24);
    if (tamanho === 0xffffffff) return null;
    total += tamanho;
    posicao += 46 + zip.readUInt16LE(posicao + 28) + zip.readUInt16LE(posicao + 30) + zip.readUInt16LE(posicao + 32);
  }
  return total;
}

/** Valor de uma célula do exceljs como texto (datas do Excel já vêm em UTC "de parede"). */
export function celulaDaPlanilha(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? '' : dataBr(valor);
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'object') {
    const o = valor as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('').trim();
    if ('formula' in o || 'sharedFormula' in o) return celulaDaPlanilha(o.result);
    if ('text' in o) return celulaDaPlanilha(o.text);
    if ('error' in o) return '';
  }
  return String(valor).trim();
}
