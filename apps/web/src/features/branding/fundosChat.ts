/**
 * Modelos de fundo das conversas (White Label). Os ids sao os mesmos aceitos pela API
 * (`FUNDOS_CHAT` em apps/api/src/modules/branding/branding.schemas.ts) e os estilos de cada um
 * ficam em index.css (`.fundo-chat--<id>` e `html[data-fundo-chat='<id>'] .fundo-chat`).
 */
export const FUNDOS_CHAT = [
  { id: 'liso', nome: 'Liso', descricao: 'Cinza muito claro, sem desenho' },
  { id: 'doodle', nome: 'Doodle WhatsApp', descricao: 'Bege com ícones discretos' },
  { id: 'menta', nome: 'Menta suave', descricao: 'Degradê verde bem claro' },
  { id: 'azul', nome: 'Azul-gelo', descricao: 'Degradê azul bem claro' },
  { id: 'pontilhado', nome: 'Pontilhado', descricao: 'Pontinhos regulares' },
  { id: 'diagonal', nome: 'Listras diagonais', descricao: 'Faixas suaves' },
  { id: 'ondas', nome: 'Ondas', descricao: 'Ondas finas azul-esverdeadas' },
  { id: 'grade', nome: 'Grade', descricao: 'Quadriculado fino' },
] as const;

export type FundoChatId = (typeof FUNDOS_CHAT)[number]['id'];

export const FUNDO_CHAT_PADRAO: FundoChatId = 'liso';

/** Aceita qualquer texto vindo da API e cai no padrao se o modelo nao existir mais. */
export function fundoChatValido(valor: string | null | undefined): FundoChatId {
  return FUNDOS_CHAT.find((f) => f.id === valor)?.id ?? FUNDO_CHAT_PADRAO;
}
