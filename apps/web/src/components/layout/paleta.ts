import type { Perfil } from '../../lib/types';
import { NAV } from './nav';

/**
 * A parte decidível da paleta de comando (item 6.2 do plano em ANALISE-CRM.md).
 *
 * Fica separada do componente porque é o que pode errar em silêncio: oferecer
 * uma tela que o perfil não abre, ou não oferecer a que ele abre. O resto —
 * abrir, fechar, navegar com as setas — falha de forma visível.
 */

export type Comando = {
  tipo: 'NAVEGAR';
  rota: string;
  label: string;
};

export type ItemDaPaleta =
  | Comando
  | {
      tipo: 'CONTATO' | 'CONTA' | 'OPORTUNIDADE' | 'PROTOCOLO';
      rota: string;
      label: string;
      detalhe: string | null;
    };

/** Rótulo curto do tipo, para a linha dizer o que é sem ícone. */
export const ROTULO_TIPO: Record<ItemDaPaleta['tipo'], string> = {
  NAVEGAR: 'Ir para',
  CONTATO: 'Contato',
  CONTA: 'Cliente',
  OPORTUNIDADE: 'Oportunidade',
  PROTOCOLO: 'Protocolo',
};

/**
 * Os comandos de navegação que este perfil pode usar.
 *
 * Sai do **mesmo** `NAV` que desenha o menu lateral, e não de uma lista própria:
 * uma segunda lista divergiria em silêncio no dia em que um módulo mudasse de
 * perfil, e a paleta passaria a oferecer uma tela que responde 403. `nav.test.ts`
 * já guarda o `NAV`; a paleta herda essa garantia de graça.
 */
export function comandosDeNavegacao(perfil: Perfil, termo: string): Comando[] {
  const t = termo.trim().toLowerCase();
  return NAV.filter((item) => item.perfis.includes(perfil))
    .filter((item) => t === '' || item.label.toLowerCase().includes(t))
    .map((item) => ({ tipo: 'NAVEGAR' as const, rota: item.rota, label: item.label }));
}

/**
 * Monta a lista final: comandos primeiro, registros depois.
 *
 * A ordem não é estética. Com a paleta recém-aberta e nada digitado, o que a
 * pessoa quer é ir para algum lugar; e mesmo com termo digitado, "Ir para CRM"
 * acima de um contato chamado "CRM Teste" é o palpite certo — comando é
 * previsível, registro é achado. Com o termo vazio, registro nenhum aparece
 * porque a busca só responde a partir de duas letras.
 */
export function montarPaleta(
  perfil: Perfil,
  termo: string,
  registros: Array<{ tipo: 'CONTATO' | 'CONTA' | 'OPORTUNIDADE' | 'PROTOCOLO'; rota: string; titulo: string; detalhe: string | null }>,
): ItemDaPaleta[] {
  return [
    ...comandosDeNavegacao(perfil, termo),
    ...registros.map((r) => ({ tipo: r.tipo, rota: r.rota, label: r.titulo, detalhe: r.detalhe })),
  ];
}

/**
 * Move a seleção com as setas, sem sair da lista.
 *
 * **Não circula.** Numa lista curta, circular do fim para o começo faz a seleção
 * "pular" para longe do olhar — e a tecla que a pessoa usa para voltar é a seta
 * de cima, não mais uma para baixo. Lista vazia devolve zero, e não -1: o índice
 * é usado para destacar a linha, e -1 destacaria a última.
 */
export function moverSelecao(atual: number, total: number, direcao: 1 | -1): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, atual + direcao));
}
