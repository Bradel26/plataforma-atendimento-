import type { AccessPayload } from '../lib/tokens';

/**
 * Revalidacao periodica das sessoes dos sockets abertos (alternativa D de
 * docs/seguranca/socketio-multiplas-instancias.md).
 *
 * Sem adapter entre instancias, `desconectarUsuario` so alcanca os sockets da
 * instancia que revogou. Cada instancia roda este laco sobre os SEUS sockets, entao
 * a revogacao chega a todas dentro de ~1 intervalo + o cache de 5 s de
 * `validarSessao`, sem depender de infraestrutura nova.
 *
 * Regras:
 *  - um laco por processo (nao um timer por socket), reagendado so DEPOIS do fim
 *    da rodada: rodadas nunca se sobrepoem;
 *  - jitter no intervalo, para as instancias nao consultarem o banco juntas;
 *  - uma consulta por (organizacao, usuario, versao), mesmo com varios sockets;
 *  - concorrencia limitada, para nao esgotar o pool do Prisma;
 *  - so `revogada` derruba. `indisponivel` (banco fora/lento) nunca desconecta.
 */

export type Situacao = 'valida' | 'revogada' | 'indisponivel';

export type SocketRevalidavel = {
  data: { usuario?: AccessPayload };
  disconnect: (fechar?: boolean) => unknown;
};

export type FonteDeSockets = { local: { fetchSockets: () => Promise<SocketRevalidavel[]> } };

export type OpcoesRevalidador = {
  io: FonteDeSockets;
  situacao: (usuario: AccessPayload) => Promise<Situacao>;
  intervaloMs?: number;
  /** Fracao do intervalo sorteada para mais ou para menos (0.2 = +-20%). */
  jitter?: number;
  concorrencia?: number;
  random?: () => number;
  /** Para testes com relogio falso. */
  agendar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
  aoFalhar?: (erro: unknown) => void;
};

export const INTERVALO_REVALIDACAO_MS = 60_000;
export const JITTER_REVALIDACAO = 0.2;
const CONCORRENCIA_PADRAO = 8;

export type Revalidador = {
  /** Uma rodada completa (exposta para testes). Resolve com o numero de sockets desconectados. */
  rodar: () => Promise<number>;
  iniciar: () => void;
  parar: () => void;
};

export function criarRevalidador(opcoes: OpcoesRevalidador): Revalidador {
  const intervalo = opcoes.intervaloMs ?? INTERVALO_REVALIDACAO_MS;
  const jitter = opcoes.jitter ?? JITTER_REVALIDACAO;
  const concorrencia = Math.max(1, opcoes.concorrencia ?? CONCORRENCIA_PADRAO);
  const random = opcoes.random ?? Math.random;
  const agendar =
    opcoes.agendar ??
    ((fn, ms) => {
      const t = setTimeout(fn, ms);
      // Nao segura o processo vivo no encerramento.
      t.unref?.();
      return t;
    });
  const cancelar = opcoes.cancelar ?? ((id) => clearTimeout(id as NodeJS.Timeout));
  const aoFalhar =
    opcoes.aoFalhar ?? ((erro) => console.warn('[realtime] falha na revalidacao periodica de sessoes', erro));

  let ativo = false;
  let timer: unknown = null;
  let rodando: Promise<number> | null = null;

  const proximoAtraso = () => Math.max(1, Math.round(intervalo * (1 + (random() * 2 - 1) * jitter)));

  async function rodarUmaVez(): Promise<number> {
    const sockets = await opcoes.io.local.fetchSockets();
    // Agrupa por pessoa+versao: N abas = 1 consulta.
    const grupos = new Map<string, { usuario: AccessPayload; sockets: SocketRevalidavel[] }>();
    for (const s of sockets) {
      const u = s.data.usuario;
      if (!u) continue; // visitante do webchat: sem sessao de usuario
      const chave = `${u.org}\u0000${u.sub}\u0000${u.sv ?? 0}`;
      const g = grupos.get(chave);
      if (g) g.sockets.push(s);
      else grupos.set(chave, { usuario: u, sockets: [s] });
    }

    let desconectados = 0;
    const fila = [...grupos.values()];
    const trabalhador = async () => {
      for (let g = fila.shift(); g; g = fila.shift()) {
        // Cada grupo isolado: um erro inesperado nao interrompe os demais.
        try {
          if ((await opcoes.situacao(g.usuario)) !== 'revogada') continue;
          for (const s of g.sockets) {
            s.disconnect(true);
            desconectados++;
          }
        } catch (erro) {
          aoFalhar(erro);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concorrencia, fila.length) }, trabalhador));
    return desconectados;
  }

  // Nunca duas rodadas ao mesmo tempo: uma chamada durante a rodada reaproveita a em curso.
  const rodar = (): Promise<number> => {
    if (rodando) return rodando;
    const p = rodarUmaVez()
      .catch((erro) => {
        aoFalhar(erro);
        return 0;
      })
      .finally(() => {
        rodando = null;
      });
    rodando = p;
    return p;
  };

  const ciclo = () => {
    timer = null;
    if (!ativo) return;
    void rodar().finally(() => {
      // Reagenda so depois do fim da rodada, e so se ainda estiver ativo.
      if (ativo && timer === null) timer = agendar(ciclo, proximoAtraso());
    });
  };

  return {
    rodar,
    iniciar() {
      if (ativo) return;
      ativo = true;
      timer = agendar(ciclo, proximoAtraso());
    },
    parar() {
      ativo = false;
      if (timer !== null) cancelar(timer);
      timer = null;
    },
  };
}
