import { prisma } from '../../lib/prisma';
import { organizacaoAtual } from '../../lib/tenant';
import { agregarConsumo, projetarCiclo, type RecursoIA } from './consumo';

/**
 * Medidor de consumo de IA: consultas e registro (item 6.8).
 *
 * **Nada chama `registrarConsumo` hoje**, e a frase é sobre a plataforma, não
 * sobre o código: nenhum recurso de IA está ligado. A função existe porque medir
 * no momento do uso é caro de acrescentar depois — se a IA entrar e ninguém
 * medir, a primeira fatura é uma surpresa.
 */

/** Primeiro dia do mês da competência, em UTC. */
const competencia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const proximoMes = (m: Date) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));

/**
 * Registra um uso de IA.
 *
 * Assinatura pensada para ser chamada de dentro do caminho que usa a IA, e não
 * por uma rotina que varre logs depois: consumo medido em lote perde a
 * referência do que originou o uso, que é o que permite responder "por que
 * gastamos tanto na terça".
 *
 * Não lança: um medidor que derruba a operação que ele mede é pior que um
 * medidor que perde um registro. O erro vai para o log e a chamada de IA segue.
 */
export async function registrarConsumo(uso: {
  recurso: RecursoIA;
  unidades: number;
  custo?: number | null;
  referencia?: string | null;
}): Promise<void> {
  try {
    await prisma.consumoIA.create({
      data: {
        recurso: uso.recurso,
        unidades: Math.max(0, Math.round(uso.unidades)),
        custo: uso.custo ?? null,
        referencia: uso.referencia ?? null,
      },
    });
  } catch (erro) {
    console.error('[ia] falha ao registrar consumo', erro);
  }
}

/**
 * O consumo de um mês, com projeção.
 *
 * `ligado` diz se existe **qualquer** registro de consumo na organização, em
 * qualquer mês. É o que a tela usa para distinguir "a IA não está ligada" de "a
 * IA está ligada e este mês não teve uso" — dois estados que um zero não separa,
 * e o primeiro não deve aparecer como "R$ 0,00".
 */
export async function consumoDoMes(mes: Date) {
  const inicio = competencia(mes);

  const [registros, existeAlgum, org] = await Promise.all([
    prisma.consumoIA.findMany({
      where: { criadoEm: { gte: inicio, lt: proximoMes(inicio) } },
      select: { recurso: true, unidades: true, custo: true },
    }),
    prisma.consumoIA.count(),
    prisma.organizacao.findFirstOrThrow({
      where: { id: organizacaoAtual() },
      select: { tetoIaMensal: true },
    }),
  ]);

  const teto = org.tetoIaMensal === null ? null : Number(org.tetoIaMensal);
  const consumo = agregarConsumo(
    registros.map((r) => ({
      recurso: r.recurso,
      unidades: r.unidades,
      custo: r.custo === null ? null : Number(r.custo),
    })),
  );

  return {
    mes: inicio,
    ligado: existeAlgum > 0,
    teto,
    ...consumo,
    ...projetarCiclo({ gastoAteAgora: consumo.custoTotal, teto, mes: inicio, hoje: new Date() }),
  };
}

/** Define ou remove o teto mensal. Nulo = sem teto, que é diferente de zero. */
export async function definirTetoIa(teto: number | null) {
  const atualizada = await prisma.organizacao.update({
    where: { id: organizacaoAtual() },
    data: { tetoIaMensal: teto },
    select: { tetoIaMensal: true },
  });
  return { teto: atualizada.tetoIaMensal === null ? null : Number(atualizada.tetoIaMensal) };
}
