/**
 * Configuracao global da infraestrutura da Ponte (Baileys), opcional para
 * instalacoes que ainda dependem so da linha compartilhada (`ChannelConfig`
 * com `donoId: null`) para fornecer ponteUrl/ponteToken/ponteSegredo.
 *
 * Existe para o self-service de linha pessoal (`conectarMinhaLinhaWhatsapp`)
 * nao depender mais de um ADMIN ter cadastrado a linha compartilhada antes:
 * com estas 3 variaveis definidas, a Ponte vira infraestrutura da propria API,
 * nao dado de negocio por organizacao.
 */

function lida(nome: string): string | null {
  return process.env[nome]?.trim() || null;
}

export type ConfigGlobalPonte = {
  ponteUrl: string;
  ponteToken: string;
  ponteSegredo: string;
};

/**
 * `null` quando nenhuma das 3 variaveis foi definida — instalacao legada,
 * so com linha compartilhada. Falha cedo (lanca) quando so PARTE delas foi
 * definida: isso e sempre erro de configuracao, nunca um estado valido, e
 * silenciar aqui so adiaria a falha para dentro de uma tentativa de conexao
 * de um vendedor, sem pista nenhuma do que corrigir.
 */
export function obterConfigGlobalPonte(): ConfigGlobalPonte | null {
  const ponteUrl = lida('PONTE_URL');
  const ponteToken = lida('PONTE_TOKEN');
  const ponteSegredo = lida('PONTE_SEGREDO');

  const definidas = [ponteUrl, ponteToken, ponteSegredo].filter((v) => v !== null).length;
  if (definidas === 0) return null;
  if (definidas < 3) {
    throw new Error(
      'Configuracao global da ponte incompleta: defina PONTE_URL, PONTE_TOKEN e PONTE_SEGREDO juntos, ' +
        'ou nenhuma das 3 para depender so da linha compartilhada legada (ver apps/api/.env.example).',
    );
  }

  return { ponteUrl: ponteUrl!, ponteToken: ponteToken!, ponteSegredo: ponteSegredo! };
}
