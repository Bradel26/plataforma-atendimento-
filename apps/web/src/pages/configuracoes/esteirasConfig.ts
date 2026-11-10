import type { AcessoOperacoes, NivelOperacao, Operacao, TipoEtapa } from '../../lib/esteiraTypes';

/** Nível mostrado na tela: a API omite SEM_ACESSO, então quem não aparece está sem acesso. */
export const nivelNaTela = (acesso: AcessoOperacoes, operacao: Operacao): NivelOperacao => acesso[operacao] ?? 'SEM_ACESSO';

/** Corpo do `PUT /usuarios/:id/operacoes`: só a operação alterada. "Edição" apaga a exceção no servidor. */
export const corpoDasOperacoes = (operacao: Operacao, nivel: NivelOperacao): Partial<Record<Operacao, NivelOperacao>> => ({ [operacao]: nivel });

export type RascunhoEtapa = { nome: string; dias: string };
export type ResultadoEtapa = { corpo: { nome?: string; diasParado?: number | null } } | { vazio: true } | { erro: string };

/**
 * Corpo do `PATCH /esteiras/:operacao/etapas/:chave` só com o que mudou.
 * Dias em branco voltam ao padrão (`null`); saída não aceita dias.
 */
export function corpoDaEtapa(
  original: { nome: string; diasParado: number | null; tipo: TipoEtapa },
  rascunho: RascunhoEtapa,
): ResultadoEtapa {
  const nome = rascunho.nome.trim();
  if (!nome) return { erro: 'Informe o nome da etapa' };
  const corpo: { nome?: string; diasParado?: number | null } = {};
  if (nome !== original.nome) corpo.nome = nome;

  if (original.tipo !== 'SAIDA') {
    const texto = rascunho.dias.trim();
    let dias: number | null = null;
    if (texto) {
      dias = Number(texto);
      if (!/^\d+$/.test(texto) || dias < 1 || dias > 365) return { erro: 'Use um número inteiro de 1 a 365 dias' };
    }
    if (dias !== original.diasParado) corpo.diasParado = dias;
  }
  return Object.keys(corpo).length ? { corpo } : { vazio: true };
}
