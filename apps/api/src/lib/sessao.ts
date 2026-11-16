import { AppError, unauthorized } from './errors';
import { prisma } from './prisma';
import { comOrganizacao } from './tenant';

/**
 * Validacao da sessao contra a versao gravada no banco (`User.sessaoVersao`).
 *
 * Todo token carrega `sv`, a versao do momento em que foi emitido. A versao sobe,
 * na mesma transacao da mudanca, quando o perfil muda, a senha muda ou a conta e
 * desativada — e entao toda sessao anterior deixa de bater. Isto e o que impede
 * privilegio antigo depois de uma mudanca de perfil: o token velho nao e mais
 * aceito, e o novo nasce com o perfil de agora.
 *
 * TOKEN LEGADO (sem `sv`) vale como versao 0. Isso e seguro porque:
 *  - ate a primeira revogacao de uma pessoa, a versao dela e 0 e o token legado
 *    representa exatamente o estado que existia quando foi emitido;
 *  - na primeira revogacao a versao passa a 1 e o token legado deixa de bater,
 *    como qualquer token anterior;
 *  - ninguem consegue fabricar um token sem `sv` com valor melhor: o token e
 *    assinado, e todo token emitido por este codigo leva `sv`.
 *
 * CACHE: a consulta e feita por pessoa e guardada por ate `TTL_PADRAO_MS`. Isso
 * evita uma ida ao banco por requisicao, e tem preco: OUTRA instancia da API pode
 * aceitar uma sessao revogada por ate esse tempo. Na instancia que executa a
 * revogacao a invalidacao e imediata (`invalidar`). Nao ha mensagem entre
 * instancias — a janela de ate 5 s e o limite documentado.
 *
 * FALHA DO BANCO nunca vira 401: a resposta e 503, para o cliente nao concluir
 * que a credencial e invalida (o front tenta renovar e desloga em 401). Falha nao
 * e guardada no cache — a proxima requisicao tenta de novo.
 */

export const TTL_PADRAO_MS = 5_000;
export const TIMEOUT_PADRAO_MS = 3_000;
const MAX_ENTRADAS = 10_000;

export type EstadoSessao = { versao: number; ativo: boolean };
export type Consulta = (organizacaoId: string, usuarioId: string) => Promise<EstadoSessao | null>;
export type CredencialDeSessao = { sub: string; org: string; sv?: number };

export const SESSAO_INDISPONIVEL = () =>
  new AppError(
    503,
    'SESSAO_INDISPONIVEL',
    'Não foi possível validar a sessão agora. Tente novamente em instantes.',
  );

type Opcoes = {
  consultar: Consulta;
  agora?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
};

export function criarValidadorDeSessao({
  consultar,
  agora = Date.now,
  ttlMs = TTL_PADRAO_MS,
  timeoutMs = TIMEOUT_PADRAO_MS,
}: Opcoes) {
  const cache = new Map<string, { estado: EstadoSessao | null; ate: number }>();
  const emCurso = new Map<string, Promise<EstadoSessao | null>>();
  const chaveDe = (org: string, id: string) => `${org}:${id}`;

  async function consultarComLimite(org: string, id: string): Promise<EstadoSessao | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        consultar(org, id),
        new Promise<never>((_, rejeitar) => {
          timer = setTimeout(() => rejeitar(new Error('timeout na consulta de sessao')), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function estadoDe(org: string, id: string): Promise<EstadoSessao | null> {
    const chave = chaveDe(org, id);
    const guardado = cache.get(chave);
    if (guardado && guardado.ate > agora()) return guardado.estado;

    // Varias requisicoes simultaneas da mesma pessoa compartilham UMA consulta.
    const existente = emCurso.get(chave);
    if (existente) return existente;

    const consulta: Promise<EstadoSessao | null> = consultarComLimite(org, id)
      .then((estado) => {
        // So grava se esta consulta ainda e a vigente: uma `invalidar` feita
        // enquanto ela voava a descartou, e o resultado dela pode ser anterior a
        // mudanca — guarda-lo reabriria a janela que a invalidacao fechou.
        if (emCurso.get(chave) === consulta) {
          if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value as string);
          cache.set(chave, { estado, ate: agora() + ttlMs });
        }
        return estado;
      })
      .finally(() => {
        if (emCurso.get(chave) === consulta) emCurso.delete(chave);
      });
    emCurso.set(chave, consulta);
    return consulta;
  }

  return {
    /** 401 se a sessao nao vale mais; 503 se nao deu para saber. */
    async validar(credencial: CredencialDeSessao): Promise<void> {
      let estado: EstadoSessao | null;
      try {
        estado = await estadoDe(credencial.org, credencial.sub);
      } catch (erro) {
        console.error('[sessao] falha ao consultar a versao da sessão:', erro instanceof Error ? erro.message : erro);
        throw SESSAO_INDISPONIVEL();
      }
      // Pessoa removida, ou de outra organizacao: o filtro por organizacao devolve nulo.
      if (!estado) throw unauthorized('Sessão encerrada, faça login novamente');
      if (!estado.ativo) throw unauthorized('Sessão encerrada, faça login novamente');
      if ((credencial.sv ?? 0) !== estado.versao) throw unauthorized('Sessão encerrada, faça login novamente');
    },

    /** Esquece o que sabe desta pessoa: a proxima validacao consulta o banco. */
    invalidar(organizacaoId: string, usuarioId: string): void {
      const chave = chaveDe(organizacaoId, usuarioId);
      cache.delete(chave);
      emCurso.delete(chave);
    },

    /** So para teste. */
    tamanho: () => cache.size,
  };
}

async function consultarNoBanco(organizacaoId: string, usuarioId: string): Promise<EstadoSessao | null> {
  // O `await` fica DENTRO do callback, de proposito. A consulta do Prisma e uma
  // promessa preguicosa: so executa quando alguem a aguarda. Devolver
  // `prisma.user.findUnique(...)` direto do callback faria a execucao acontecer
  // fora do `comOrganizacao` — sem organizacao no contexto, e a extensao de
  // isolamento recusa (erro `SEM_CONTEXTO_ORGANIZACAO`, visto como 503 por aqui).
  // Defeito encontrado so contra um Postgres real; ver `sessao.consulta.test.ts`.
  const usuario = await comOrganizacao(organizacaoId, async () => {
    const linha = await prisma.user.findUnique({
      where: { id: usuarioId },
      select: { sessaoVersao: true, ativo: true },
    });
    return linha;
  });
  return usuario ? { versao: usuario.sessaoVersao, ativo: usuario.ativo } : null;
}

const validador = criarValidadorDeSessao({ consultar: consultarNoBanco });

export const validarSessao = validador.validar;
export const invalidarSessaoLocal = validador.invalidar;
