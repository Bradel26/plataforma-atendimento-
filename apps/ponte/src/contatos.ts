/**
 * Agrupa contatos importados do celular antes de mandar para a plataforma.
 *
 * O Baileys dispara `contacts.upsert` varias vezes em pedacos pequenos (a
 * agenda inteira ao conectar chega picada, e ainda pode vir atualizacao
 * incremental minutos depois) — sem agrupar, cada pedaco viraria uma chamada
 * de rede separada, e uma agenda de centenas de contatos martelaria a
 * plataforma em rajada.
 */

export type ContatoNumerado = { numero: string; nome: string };

/**
 * Mescla `novos` dentro de `atual`, por numero. Pura: sem timer, sem rede, so
 * a regra de acumulo — o que faz dar para testar sem fake timers.
 */
export function acumular(atual: Map<string, string>, novos: ContatoNumerado[]): Map<string, string> {
  const resultado = new Map(atual);
  for (const c of novos) resultado.set(c.numero, c.nome);
  return resultado;
}

/** Tempo sem novidade antes de disparar o envio. */
const ESPERA_MS = 5_000;

/**
 * Debounce por sessao: acumula contatos e so entrega depois de `ESPERA_MS` sem
 * chegar nada novo, cancelando o timer anterior a cada `adicionar`. Isso junta
 * os varios pedacos de uma mesma importacao (ou reconexao) numa entrega so.
 */
export class GerenciadorDeContatos {
  private acumulado = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly entregar: (contatos: ContatoNumerado[]) => void) {}

  adicionar(contatos: ContatoNumerado[]) {
    this.acumulado = acumular(this.acumulado, contatos);

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

    const contatos = [...this.acumulado].map(([numero, nome]) => ({ numero, nome }));
    this.acumulado = new Map();
    this.entregar(contatos);
  }
}
