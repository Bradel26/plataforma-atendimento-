import type { ChatBruto } from './sessao.js';

/**
 * Agrupa o espelho de chats sincronizado do celular antes de mandar para a
 * plataforma.
 *
 * O Baileys dispara `messaging-history.set` (carga inicial) e `chats.upsert`
 * (atualizacao incremental) em pedacos — sem agrupar, cada pedaco viraria uma
 * chamada de rede separada, e a carga historica inteira martelaria a
 * plataforma em rajada. Mesmo papel de `contatos.ts`, so que aqui a entrada
 * inteira e substituida (nao so o nome), porque o chat carrega previa/nao-lidas
 * que mudam a cada mensagem.
 */

/**
 * Mescla `novos` dentro de `atual`, por numero. Pura: sem timer, sem rede, so
 * a regra de acumulo — o que faz dar para testar sem fake timers.
 */
export function acumularChats(atual: Map<string, ChatBruto>, novos: ChatBruto[]): Map<string, ChatBruto> {
  const resultado = new Map(atual);
  for (const c of novos) resultado.set(c.numero, c);
  return resultado;
}

/** Tempo sem novidade antes de disparar o envio. */
const ESPERA_MS = 5_000;

/**
 * Debounce por sessao: acumula chats e so entrega depois de `ESPERA_MS` sem
 * chegar nada novo, cancelando o timer anterior a cada `adicionar`. Mesmo
 * padrao de `GerenciadorDeContatos`.
 */
export class GerenciadorDeChats {
  private acumulado = new Map<string, ChatBruto>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly entregar: (chats: ChatBruto[]) => void) {}

  adicionar(chats: ChatBruto[]) {
    this.acumulado = acumularChats(this.acumulado, chats);

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ESPERA_MS);
    this.timer.unref?.();
  }

  /** Dispara a entrega do que estiver acumulado agora e limpa. Nao faz nada se vazio. */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.acumulado.size === 0) return;

    const chats = [...this.acumulado.values()];
    this.acumulado = new Map();
    this.entregar(chats);
  }
}
