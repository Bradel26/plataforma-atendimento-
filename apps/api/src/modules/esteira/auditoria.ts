/**
 * Auditoria de edição do vínculo (spec 4.8) — a parte pura: o que mudou, campo
 * a campo. A gravação em `CredenciamentoAuditoria` (uma linha por campo, com a
 * operação) fica em `vinculos.service.ts`, na mesma transação da alteração.
 */
import type { StatusVendedor } from '@prisma/client';

export type Diferenca = { campo: string; de: unknown; para: unknown };

/** Campo da linha que guarda a justificativa de uma alteração fora da regra (prefixo reservado). */
export const CAMPO_JUSTIFICATIVA = '_justificativa';

const vazio = (v: unknown): boolean => v === null || v === undefined;

/** Igualdade de valor de campo: nulo ≡ ausente, data pelo instante, objeto pelo conteúdo. */
function iguais(a: unknown, b: unknown): boolean {
  if (vazio(a) || vazio(b)) return vazio(a) && vazio(b);
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/**
 * Campos de `depois` cujo valor difere de `antes`. Chave ausente (ou `undefined`)
 * em `depois` é "não informado" e fica de fora; `null` e `undefined` são o mesmo
 * valor; `null` → `false` é mudança (tri-estado: NULL nunca é NÃO).
 */
export function diferencas(antes: Record<string, unknown>, depois: Record<string, unknown>): Diferenca[] {
  const lista: Diferenca[] = [];
  for (const [campo, para] of Object.entries(depois)) {
    if (para === undefined) continue;
    const de = antes[campo];
    if (!iguais(de, para)) lista.push({ campo, de: de ?? null, para: para ?? null });
  }
  return lista;
}

/** Valor como vai para a coluna JSON: data em ISO, ausente como nulo. */
export function valorAuditavel(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

export type DadosVendedor = { nome: string; cpf: string | null; telefone: string | null; status: StatusVendedor };

/**
 * Diferenças de um vendedor do PDV, com o campo prefixado pelo id
 * (`vendedores.<id>.<campo>`) para a trilha saber de qual vendedor é.
 * Vendedor novo (`antes` nulo): uma linha por campo preenchido.
 */
export function diferencasDoVendedor(id: string, antes: DadosVendedor | null, depois: DadosVendedor): Diferenca[] {
  return diferencas(antes ?? {}, depois).map((d) => ({ ...d, campo: `vendedores.${id}.${d.campo}` }));
}

/**
 * Dados finais do vendedor. Criação (`antes` nulo): status padrão ATIVO, cpf e
 * telefone omitidos ficam nulos. Atualização: omitido mantém o valor atual (não
 * reativa um INATIVO em silêncio); só `null` explícito limpa.
 */
export function mesclarVendedor(
  antes: DadosVendedor | null,
  input: { nome: string; cpf?: string | null; telefone?: string | null; status?: StatusVendedor },
): DadosVendedor {
  return {
    nome: input.nome,
    cpf: input.cpf !== undefined ? input.cpf : (antes?.cpf ?? null),
    telefone: input.telefone !== undefined ? input.telefone : (antes?.telefone ?? null),
    status: input.status ?? antes?.status ?? 'ATIVO',
  };
}
