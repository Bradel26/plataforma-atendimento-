/**
 * Exportação e importação da esteira por operação, em CSV e XLSX (spec 6.4).
 *
 * Exportação: a mesma consulta da Lista (filtros + carteira + operações
 * permitidas), sem paginação, nas colunas pedidas; registrada em `RegistroEsteira`.
 * Importação: cada linha é validada (`validarLinha`, puro) e gravada pelo
 * serviço do vínculo (`importarVinculo`) — idempotente, sem gates, histórico
 * IMPORTACAO. Linha com erro não impede as demais; a prévia não grava nada.
 */
import ExcelJS from 'exceljs';
import type { Operacao, Prisma } from '@prisma/client';
import { AppError, badRequest } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { usuarioAtualOuNulo } from '../../lib/tenant';
import { gerarCsv } from '../dados/csv';
import { chaveConhecida, type ChaveEtapa } from './catalogo';
import { COLUNAS, ordenacaoDaColuna, type ColunaEsteira } from './colunas';
import { ORDEM_PADRAO, whereDaConsulta } from './consultas.service';
import type { FiltrosEsteira } from './filtros';
import {
  cabecalhosDeExportacao,
  chaveImportavelEmAlguma,
  linhasDeExportacao,
  mapearCabecalhos,
  neutralizarFormula,
  validarLinha,
  type LinhaImportada,
} from './planilhas';
import { lerArquivo } from './leituraPlanilha';
import { contextoDeImportacao, importarVinculo, inclusao, montarLinha, type EntradaDeImportacao } from './vinculos.service';

export * from './planilhas';
export { LIMITE_IMPORTACAO_LINHAS, lerArquivo } from './leituraPlanilha';

/** Acima disso a exportação pede filtro (413): a consulta monta todas as linhas em memória. */
export const LIMITE_EXPORTACAO = 50_000;
export const LIMITE_IMPORTACAO_BYTES = 5 * 1024 * 1024;

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TIPO_CSV = 'text/csv; charset=utf-8';

const NOME_DA_OPERACAO: Record<Operacao, string> = { TIM: 'TIM', STARLINK: 'Starlink' };

/** JSON simples (datas em ISO) para a coluna `detalhe`. */
const comoJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

async function registrar(operacao: Operacao, acao: 'EXPORTACAO' | 'IMPORTACAO', detalhe: unknown) {
  await prisma.registroEsteira.create({
    data: { operacao, acao, usuarioId: usuarioAtualOuNulo()?.id ?? null, detalhe: comoJson(detalhe) },
  });
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

/** Colunas pedidas, na ordem pedida e sem repetição; vazio = as padrão da operação. Chave desconhecida → 400. */
export function colunasDaExportacao(operacao: Operacao, chaves: string[]): ColunaEsteira[] {
  const todas = COLUNAS[operacao];
  if (chaves.length === 0) return todas.filter((c) => c.padrao);
  const desconhecidas = chaves.filter((k) => !todas.some((c) => c.chave === k));
  if (desconhecidas.length > 0) throw badRequest(`Coluna desconhecida nesta esteira: ${desconhecidas.join(', ')}`);
  return [...new Set(chaves)].map((k) => todas.find((c) => c.chave === k)!);
}

async function gerarXlsx(operacao: Operacao, cabecalhos: string[], linhas: string[][]): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  const planilha = livro.addWorksheet(NOME_DA_OPERACAO[operacao]);
  planilha.addRow(cabecalhos).font = { bold: true };
  for (const linha of linhas) planilha.addRow(linha);
  planilha.columns.forEach((coluna, i) => {
    coluna.width = Math.min(40, Math.max(10, (cabecalhos[i]?.length ?? 0) + 2));
  });
  planilha.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await livro.xlsx.writeBuffer());
}

export async function exportar(
  operacao: Operacao,
  filtros: FiltrosEsteira,
  chaves: string[],
  formato: 'csv' | 'xlsx',
  ordem?: { ordenarPor?: string; direcao: 'asc' | 'desc' },
): Promise<{ arquivo: Buffer; nome: string; tipo: string }> {
  const colunas = colunasDaExportacao(operacao, chaves);
  const orderBy = ordem?.ordenarPor ? ordenacaoDaColuna(operacao, ordem.ordenarPor, ordem.direcao) : ORDEM_PADRAO;
  if (!orderBy) throw badRequest('Esta coluna não pode ser ordenada');

  const agora = new Date();
  const where = await whereDaConsulta(operacao, filtros, agora);
  const quantidade = await prisma.credenciamento.count({ where });
  if (quantidade > LIMITE_EXPORTACAO) {
    throw new AppError(
      413,
      'EXPORTACAO_GRANDE',
      `A exportação teria ${quantidade.toLocaleString('pt-BR')} linhas (limite de ${LIMITE_EXPORTACAO.toLocaleString('pt-BR')}). Aplique filtros para reduzir.`,
    );
  }
  const vinculos = await prisma.credenciamento.findMany({ where, include: inclusao, orderBy, take: LIMITE_EXPORTACAO });
  const linhas = linhasDeExportacao(
    vinculos.map((v) => montarLinha(v, agora)),
    colunas,
  ).map((l) => colunas.map((c) => neutralizarFormula(l[c.chave] ?? '')));
  const cabecalhos = cabecalhosDeExportacao(colunas);

  const data = agora.toISOString().slice(0, 10);
  const base = `esteira-${operacao.toLowerCase()}-${data}`;
  const resultado =
    formato === 'xlsx'
      ? { arquivo: await gerarXlsx(operacao, cabecalhos, linhas), nome: `${base}.xlsx`, tipo: TIPO_XLSX }
      : {
          arquivo: Buffer.from(
            gerarCsv(
              cabecalhos,
              linhas.map((l) => Object.fromEntries(cabecalhos.map((h, i) => [h, l[i]]))),
            ),
            'utf8',
          ),
          nome: `${base}.csv`,
          tipo: TIPO_CSV,
        };

  await registrar(operacao, 'EXPORTACAO', { filtros, colunas: colunas.map((c) => c.chave), quantidade: vinculos.length, formato });
  return resultado;
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

/** Mapa informado: cada destino é nulo ou uma coluna importável (de alguma operação — a outra vira aviso). */
function conferirMapa(mapa: Record<string, string | null>) {
  const invalidas = Object.values(mapa).filter((k): k is string => k != null && !chaveImportavelEmAlguma(k));
  if (invalidas.length > 0) throw badRequest(`Coluna desconhecida no mapa: ${[...new Set(invalidas)].join(', ')}`);
}

type Usuario = { id: string; nome: string; email: string; ativo: boolean };

/** Usuários citados na coluna Responsável (por e-mail ou nome), numa consulta só. */
async function usuariosCitados(linhas: LinhaImportada[]): Promise<Usuario[]> {
  const emails = [...new Set(linhas.flatMap((l) => (l.responsavelEmail ? [l.responsavelEmail] : [])))];
  const nomes = [...new Set(linhas.flatMap((l) => (l.responsavelNome ? [l.responsavelNome] : [])))];
  if (emails.length === 0 && nomes.length === 0) return [];
  return prisma.user.findMany({
    where: {
      OR: [
        ...(emails.length ? [{ email: { in: emails, mode: 'insensitive' as const } }] : []),
        ...(nomes.length ? [{ nome: { in: nomes, mode: 'insensitive' as const } }] : []),
      ],
    },
    select: { id: true, nome: true, email: true, ativo: true },
  });
}

/** Id do responsável da linha; lança o erro da linha se não achar, se for ambíguo ou inativo. */
function responsavelDaLinha(l: LinhaImportada, usuarios: Usuario[]): string | undefined {
  const citado = l.responsavelEmail ?? l.responsavelNome;
  if (!citado) return undefined;
  const alvo = citado.toLocaleLowerCase('pt-BR');
  const achados = usuarios.filter((u) =>
    l.responsavelEmail ? u.email.toLocaleLowerCase('pt-BR') === alvo : u.nome.toLocaleLowerCase('pt-BR') === alvo,
  );
  if (achados.length === 0) throw badRequest(`Responsável não encontrado: "${citado}"`);
  if (achados.length > 1) throw badRequest(`Há mais de um usuário chamado "${citado}"; use o e-mail`);
  if (!achados[0]!.ativo) throw badRequest(`Responsável inativo: "${citado}"`);
  return achados[0]!.id;
}

/** Identidade do parceiro dentro do lote (CNPJ > CPF > telefone), para a prévia contar repetidos como atualização. */
const identidade = (p: LinhaImportada['parceiro']) =>
  p.cnpj ? `cnpj:${p.cnpj}` : p.cpf ? `cpf:${p.cpf}` : `tel:${(p.telefone ?? '').replace(/\D/g, '')}`;

export type ResultadoImportacao = {
  cabecalhos: string[];
  mapa: Record<string, string | null>;
  total: number;
  /** Linhas sem erro (na prévia: as que seriam gravadas). */
  validas: number;
  criadas: number;
  atualizadas: number;
  erros: Array<{ linha: number; erros: string[] }>;
  avisos: Array<{ linha: number; avisos: string[] }>;
};

export async function importar(
  operacao: Operacao,
  arquivo: { buffer: Buffer; nome: string },
  mapaInformado: Record<string, string | null> | null,
  previa: boolean,
): Promise<ResultadoImportacao> {
  const { cabecalhos, linhas } = await lerArquivo(arquivo);

  if (mapaInformado) conferirMapa(mapaInformado);
  const automatico = mapearCabecalhos(cabecalhos, COLUNAS[operacao]);
  // Só cabeçalhos que existem no arquivo; o que o mapa informado não cita fica com o automático.
  const mapa = Object.fromEntries(
    cabecalhos.map((h) => [h, mapaInformado && Object.hasOwn(mapaInformado, h) ? (mapaInformado[h] ?? null) : automatico[h]!]),
  ) as Record<string, string | null>;

  // Funil, carteira e usuário: uma vez por lote, não por linha.
  const ctx = await contextoDeImportacao(operacao, previa);
  const etapasPorNome = Object.fromEntries(
    ctx.funil.estagios.filter((e) => chaveConhecida(e.chave)).map((e) => [e.nome, e.chave as ChaveEtapa]),
  );
  const validadas = linhas.map((l) => validarLinha(operacao, l.valores, mapa, { etapasPorNome, linha: l.numero }));
  // Consulta sob o contexto de tenant da requisição: só usuários desta organização.
  const usuarios = await usuariosCitados(validadas);

  const resultado: ResultadoImportacao = { cabecalhos, mapa, total: linhas.length, validas: 0, criadas: 0, atualizadas: 0, erros: [], avisos: [] };
  const criadasNaPrevia = new Set<string>();

  // Uma linha por vez, na ordem: a mesma pessoa duas vezes no arquivo cria e depois atualiza.
  for (const l of validadas) {
    if (l.avisos.length > 0) resultado.avisos.push({ linha: l.linha, avisos: l.avisos });
    if (l.erros.length > 0) {
      resultado.erros.push({ linha: l.linha, erros: l.erros });
      continue;
    }
    try {
      const entrada: EntradaDeImportacao = {
        parceiro: l.parceiro,
        etapa: l.etapa,
        responsavelId: responsavelDaLinha(l, usuarios),
        observacoes: l.observacoes,
        campos: l.campos,
      };
      let feito = await importarVinculo(ctx, entrada);
      if (previa) {
        const chave = identidade(l.parceiro);
        if (feito === 'CRIADO' && criadasNaPrevia.has(chave)) feito = 'ATUALIZADO';
        criadasNaPrevia.add(chave);
      }
      resultado.validas += 1;
      if (feito === 'CRIADO') resultado.criadas += 1;
      else resultado.atualizadas += 1;
    } catch (erro) {
      if (!(erro instanceof AppError)) console.error(`[esteira] importação: erro inesperado na linha ${l.linha}`, erro);
      resultado.erros.push({
        linha: l.linha,
        erros: [erro instanceof AppError ? erro.message : 'Erro inesperado ao gravar esta linha'],
      });
    }
  }

  if (!previa) {
    await registrar(operacao, 'IMPORTACAO', {
      arquivo: arquivo.nome,
      mapa,
      total: resultado.total,
      validas: resultado.validas,
      criadas: resultado.criadas,
      atualizadas: resultado.atualizadas,
      linhasComErro: resultado.erros.length,
    });
  }
  return resultado;
}
