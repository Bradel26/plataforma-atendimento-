import { resolve } from 'node:path';

/**
 * Configuracao da ponte, lida do ambiente uma vez.
 *
 * Tudo que e credencial e **obrigatorio**: a ponte fala pelo numero de WhatsApp
 * da empresa, e subir sem token seria deixar esse numero aberto para quem
 * alcancar a porta. Faltando qualquer um, o processo nao sobe — falhar no boot e
 * melhor que descobrir a brecha depois.
 */

function obrigatorio(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    throw new Error(
      `Falta a variavel ${nome}. Rode "npm run gerar:segredos" ou veja apps/ponte/.env.exemplo.`,
    );
  }
  return valor;
}

function opcional(nome: string): string | null {
  return process.env[nome]?.trim() || null;
}

export const config = {
  porta: Number(process.env.PONTE_PORTA ?? 3100),

  /** Token que a PLATAFORMA apresenta para falar com a ponte (`ponteToken`). */
  token: obrigatorio('PONTE_TOKEN'),

  /** Segredo com que a ponte ASSINA o que envia para a plataforma (`ponteSegredo`). */
  segredo: obrigatorio('PONTE_SEGREDO'),

  /** Onde a plataforma responde. Ex.: http://localhost:3000 */
  plataformaUrl: obrigatorio('PONTE_PLATAFORMA_URL').replace(/\/+$/, ''),

  /** Para quem entregar a mensagem recebida. Vem da tela de Canais. */
  organizacaoId: obrigatorio('PONTE_ORGANIZACAO_ID'),

  /** Chave de cifra (hex, 32 bytes) das credenciais de sessao persistidas no Postgres. */
  cifraChave: obrigatorio('PONTE_CIFRA_CHAVE'),

  /** Postgres onde a sessao do Baileys fica persistida (o mesmo banco da plataforma). */
  bancoUrl: obrigatorio('DATABASE_URL'),

  /**
   * Pasta das credenciais de sessao.
   *
   * Precisa ser volume persistente: apagada, o WhatsApp desloga e alguem tem de
   * escanear o QR de novo — no meio do expediente, sem aviso.
   */
  dados: resolve(process.env.PONTE_DADOS ?? 'dados'),

  /** Nome da sessao usada quando a URL nao traz sufixo. */
  sessaoPadrao: opcional('PONTE_SESSAO_PADRAO') ?? 'padrao',

  /**
   * Como a PLATAFORMA alcanca esta ponte.
   *
   * Vai dentro do `anexoUrl` de cada midia recebida: a plataforma busca o
   * binario nesse endereco e guarda no storage dela. Errado, a mensagem chega
   * mas a foto do cliente nao — e em atendimento de ar-condicionado a foto da
   * placa do aparelho costuma ser a mensagem inteira.
   *
   * O padrao serve para desenvolvimento, quando os dois rodam na mesma maquina.
   */
  urlPublica: (opcional('PONTE_URL_PUBLICA') ?? 'http://localhost:' + (process.env.PONTE_PORTA ?? 3100)).replace(
    /\/+$/,
    '',
  ),
} as const;
