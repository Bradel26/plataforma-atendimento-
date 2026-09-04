import { prisma } from '../../lib/prisma';
import {
  filtroDe,
  politicaContas,
  politicaContatos,
  politicaOportunidades,
  politicaProtocolos,
} from '../../lib/politicas';

/**
 * Busca global (item 6.2 do plano em ANALISE-CRM.md) — o "Explorar" do Néctar,
 * atrás de `Ctrl+K`.
 *
 * Uma pergunta, quatro domínios. O que faz esta busca ser diferente de quatro
 * caixas de filtro é que ela responde antes de a pessoa escolher onde procurar —
 * e é exatamente por isso que ela precisa respeitar as **quatro políticas de
 * visibilidade**: uma busca global que ignorasse escopo seria a porta mais fácil
 * da plataforma para ver o que não é seu.
 */

export type TipoResultado = 'CONTATO' | 'CONTA' | 'OPORTUNIDADE' | 'PROTOCOLO';

export type Resultado = {
  tipo: TipoResultado;
  id: string;
  titulo: string;
  /** Linha de apoio: o que distingue dois registros de nome parecido. */
  detalhe: string | null;
  /** Para onde ir ao escolher. */
  rota: string;
};

/** Quantos de cada tipo. Cinco cabe na tela sem rolagem e sem esconder tipo. */
const POR_TIPO = 5;

/**
 * Ordena os resultados pela força do casamento.
 *
 * Função pura e testada porque a ordem **é** o recurso: uma paleta que devolve o
 * registro certo na sétima linha não economiza tempo de ninguém. Três faixas, na
 * ordem em que a pessoa espera:
 *
 * 1. o título começa com o que foi digitado ("aco" → "Açougue Central");
 * 2. o título contém em outra posição ("aco" → "Mercado Açougueiro");
 * 3. o casamento veio do detalhe, não do título (telefone, e-mail, empresa).
 *
 * O desempate final é o tamanho do título: entre dois que começam igual, o mais
 * curto é quase sempre o que a pessoa quis — "Bradel" antes de "Bradel Filial
 * Anápolis Centro".
 */
export function ordenarResultados(resultados: Resultado[], termo: string): Resultado[] {
  const t = termo.trim().toLowerCase();
  if (t === '') return resultados;

  const faixa = (r: Resultado) => {
    const titulo = r.titulo.toLowerCase();
    if (titulo.startsWith(t)) return 0;
    if (titulo.includes(t)) return 1;
    return 2;
  };

  return [...resultados].sort((a, b) => {
    const fa = faixa(a);
    const fb = faixa(b);
    if (fa !== fb) return fa - fb;
    if (a.titulo.length !== b.titulo.length) return a.titulo.length - b.titulo.length;
    // Desempate estável por id: sem ele, duas execuções da mesma busca podem
    // trocar a ordem de dois registros idênticos em nome e tamanho, e a paleta
    // "pisca" ao redigitar a mesma letra.
    return a.id.localeCompare(b.id);
  });
}

/**
 * Busca em contatos, clientes, oportunidades e protocolos.
 *
 * Termo curto devolve vazio em vez de tudo: com uma letra, "resultado" seria uma
 * amostra arbitrária de quatro tabelas, e a pessoa aprenderia a ignorar a paleta
 * nas primeiras teclas — que é justamente quando ela está aberta.
 */
export async function buscar(termo: string): Promise<{ resultados: Resultado[]; termo: string }> {
  const q = termo.trim();
  if (q.length < 2) return { resultados: [], termo: q };

  const contem = { contains: q, mode: 'insensitive' as const };
  const soDigitos = q.replace(/^#/, '');
  const numeroProcurado = /^\d{1,9}$/.test(soDigitos) ? Number(soDigitos) : null;

  const [escopoContatos, escopoContas, escopoOportunidades, escopoProtocolos] = await Promise.all([
    filtroDe(politicaContatos),
    filtroDe(politicaContas),
    filtroDe(politicaOportunidades),
    filtroDe(politicaProtocolos),
  ]);

  const [contatos, contas, oportunidades, protocolos] = await Promise.all([
    prisma.contact.findMany({
      where: {
        AND: [escopoContatos, { OR: [{ nome: contem }, { email: contem }, { telefone: contem }] }],
      },
      select: { id: true, nome: true, email: true, telefone: true, conta: { select: { nome: true } } },
      take: POR_TIPO,
      orderBy: { atualizadoEm: 'desc' },
    }),
    prisma.account.findMany({
      where: { AND: [escopoContas, { OR: [{ nome: contem }, { cnpj: contem }, { razaoSocial: contem }] }] },
      select: { id: true, nome: true, cnpj: true, segmento: true },
      take: POR_TIPO,
      orderBy: { atualizadoEm: 'desc' },
    }),
    prisma.opportunity.findMany({
      where: { AND: [escopoOportunidades, { OR: [{ titulo: contem }, { conta: { nome: contem } }] }] },
      select: {
        id: true,
        titulo: true,
        status: true,
        conta: { select: { nome: true } },
        estagio: { select: { nome: true } },
      },
      take: POR_TIPO,
      orderBy: { atualizadoEm: 'desc' },
    }),
    prisma.ticket.findMany({
      /*
       * `numero` do protocolo e INTEIRO, e por isso nao aceita `contains`.
       *
       * Quando o termo e so digito, ele entra como igualdade — e o "#" digitado
       * antes do numero e descartado, porque e assim que a pessoa le o protocolo
       * na tela e e assim que ela vai digitar. Sem esse tratamento, procurar
       * "#1024" nao acharia o protocolo 1024, que e a busca mais obvia deste
       * dominio.
       */
      where: {
        AND: [
          escopoProtocolos,
          { OR: [{ titulo: contem }, ...(numeroProcurado === null ? [] : [{ numero: numeroProcurado }])] },
        ],
      },
      select: { id: true, numero: true, titulo: true, status: true },
      take: POR_TIPO,
      orderBy: { atualizadoEm: 'desc' },
    }),
  ]);

  const resultados: Resultado[] = [
    ...contatos.map((c) => ({
      tipo: 'CONTATO' as const,
      id: c.id,
      titulo: c.nome,
      // A empresa vem primeiro no detalhe: entre dois "Joao Silva", saber de que
      // cliente ele e resolve mais rapido que o telefone.
      detalhe: c.conta?.nome ?? c.email ?? c.telefone ?? null,
      rota: `/contatos/${c.id}`,
    })),
    ...contas.map((c) => ({
      tipo: 'CONTA' as const,
      id: c.id,
      titulo: c.nome,
      detalhe: c.segmento ?? c.cnpj ?? null,
      rota: `/clientes/${c.id}`,
    })),
    ...oportunidades.map((o) => ({
      tipo: 'OPORTUNIDADE' as const,
      id: o.id,
      titulo: o.titulo,
      detalhe: [o.conta.nome, o.status === 'ABERTA' ? o.estagio.nome : o.status].filter(Boolean).join(' · '),
      rota: `/oportunidades/${o.id}`,
    })),
    ...protocolos.map((p) => ({
      tipo: 'PROTOCOLO' as const,
      id: p.id,
      titulo: `#${p.numero} ${p.titulo}`,
      detalhe: p.status,
      rota: `/protocolo/${p.id}`,
    })),
  ];

  return { resultados: ordenarResultados(resultados, q), termo: q };
}
