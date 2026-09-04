import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaContatos } from '../../lib/politicas';
import { cicloDeVida, funilDeCicloDeVida, type CicloDeVida, type FatosDoContato } from './cicloDeVida';

/**
 * Ciclo de vida derivado dos fatos que a plataforma tem (item E.4).
 *
 * O ciclo nao e guardado em coluna nenhuma — ver o porque em `cicloDeVida.ts`.
 * A consequencia pratica esta aqui: calcular o degrau exige juntar fatos de
 * quatro tabelas, e a forma como isso e feito decide se a tela abre ou trava.
 *
 * **Cinco `groupBy`, e nao uma consulta por contato.** A alternativa obvia — para
 * cada contato, contar oportunidades — sao mil consultas numa base de mil
 * contatos. Aqui sao cinco agregacoes que voltam "contato X tem N disso", e o
 * cruzamento acontece em memoria, onde ele custa nada.
 */

const VAZIO: FatosDoContato = {
  oportunidadesGanhas: 0,
  oportunidadesAbertas: 0,
  oportunidadesPerdidas: 0,
  leadsQualificados: 0,
  leads: 0,
  conversas: 0,
};

/** Fases de lead que contam como "passou da triagem". */
const FASES_QUALIFICADAS = ['QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO'] as const;

/**
 * Os fatos de cada contato visivel, num mapa por id.
 *
 * A oportunidade se liga a **conta**, e nao ao contato, e por isso o caminho e
 * indireto: os contatos da conta herdam o que a conta negociou. Isso e proposital
 * e nao um atalho — quem compra e a empresa, e classificar o comprador como
 * "lead" porque a oportunidade estava no nome do colega seria errado sobre o
 * mesmo fato.
 */
export async function fatosDosContatos(filtro: Prisma.ContactWhereInput) {
  const contatos = await prisma.contact.findMany({
    where: filtro,
    select: { id: true, contaId: true },
  });

  const contaDoContato = new Map(contatos.map((c) => [c.id, c.contaId]));
  const contas = [...new Set(contatos.map((c) => c.contaId).filter((x): x is string => x !== null))];

  const porConta = async (status: 'GANHA' | 'ABERTA' | 'PERDIDA') =>
    contas.length === 0
      ? []
      : prisma.opportunity.groupBy({
          by: ['contaId'],
          where: { contaId: { in: contas }, status },
          _count: { _all: true },
        });

  const [ganhas, abertas, perdidas, leads, qualificados, conversas] = await Promise.all([
    porConta('GANHA'),
    porConta('ABERTA'),
    porConta('PERDIDA'),
    prisma.lead.groupBy({ by: ['contatoId'], _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ['contatoId'],
      where: { fase: { in: [...FASES_QUALIFICADAS] } },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({ by: ['contatoId'], _count: { _all: true } }),
  ]);

  const mapaPorConta = (linhas: Array<{ contaId: string | null; _count: { _all: number } }>) =>
    new Map(linhas.map((l) => [l.contaId, l._count._all]));
  const mapaPorContato = (linhas: Array<{ contatoId: string | null; _count: { _all: number } }>) =>
    new Map(linhas.map((l) => [l.contatoId, l._count._all]));

  const g = mapaPorConta(ganhas);
  const a = mapaPorConta(abertas);
  const p = mapaPorConta(perdidas);
  const l = mapaPorContato(leads);
  const q = mapaPorContato(qualificados);
  const c = mapaPorContato(conversas);

  const fatos = new Map<string, FatosDoContato>();
  for (const contato of contatos) {
    const conta = contaDoContato.get(contato.id) ?? null;
    fatos.set(contato.id, {
      ...VAZIO,
      oportunidadesGanhas: conta ? (g.get(conta) ?? 0) : 0,
      oportunidadesAbertas: conta ? (a.get(conta) ?? 0) : 0,
      oportunidadesPerdidas: conta ? (p.get(conta) ?? 0) : 0,
      leads: l.get(contato.id) ?? 0,
      leadsQualificados: q.get(contato.id) ?? 0,
      conversas: c.get(contato.id) ?? 0,
    });
  }

  return fatos;
}

/** O degrau de cada contato visivel, num mapa por id. */
export async function ciclosDosContatos(filtro?: Prisma.ContactWhereInput) {
  const escopo = filtro ?? (await filtroDe(politicaContatos));
  const fatos = await fatosDosContatos(escopo);

  const ciclos = new Map<string, CicloDeVida>();
  for (const [id, f] of fatos) ciclos.set(id, cicloDeVida(f));
  return ciclos;
}

/**
 * O funil de ciclo de vida da base visivel.
 *
 * Passa pela politica de contatos como qualquer leitura: o vendedor ve o funil
 * da carteira dele, e o gestor o da equipe. Um funil que ignorasse a politica
 * mostraria a base inteira num numero — e seria a unica tela do sistema a fazer
 * isso.
 */
export async function funilDeCiclo() {
  const ciclos = await ciclosDosContatos();
  return funilDeCicloDeVida([...ciclos.values()]);
}

/**
 * O degrau de um contato so.
 *
 * Reutiliza o caminho da lista com um filtro de um id, em vez de ter uma segunda
 * implementacao: duas contas do mesmo degrau divergiriam na primeira mudanca de
 * regra, e a ficha passaria a discordar do funil.
 */
export async function cicloDoContato(id: string) {
  const ciclos = await ciclosDosContatos({
    AND: [{ id }, await filtroDe(politicaContatos)],
  });
  return ciclos.get(id) ?? null;
}

/**
 * Os ids dos contatos em determinados degraus.
 *
 * Existe para o publico de campanha (item E.3) filtrar por ciclo de vida sem
 * reimplementar a derivacao — o filtro da campanha e a mesma pergunta da tela de
 * contatos, e duas implementacoes dela produziriam publicos diferentes da lista
 * que o usuario acabou de conferir.
 */
export async function contatosNosCiclos(ciclos: CicloDeVida[], filtro?: Prisma.ContactWhereInput) {
  const desejados = new Set(ciclos);
  const mapa = await ciclosDosContatos(filtro);
  return [...mapa.entries()].filter(([, ciclo]) => desejados.has(ciclo)).map(([id]) => id);
}
