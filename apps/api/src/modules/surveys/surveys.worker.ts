import { registrarHandler } from '../../lib/fila';
import { TIPO_CONVITE_PESQUISA, entregarPesquisa } from './surveys.service';

/**
 * Nova tentativa de entrega do convite de pesquisa.
 *
 * A nota no historico sai apenas na ultima tentativa: uma linha por tentativa
 * transformaria a conversa num log de infraestrutura para o agente ler.
 */
registrarHandler<{ conversaId: string }>(TIPO_CONVITE_PESQUISA, async ({ conversaId }, ctx) => {
  const resultado = await entregarPesquisa(conversaId, { anotarFalha: ctx.ultimaTentativa });
  if (resultado.entregue || resultado.permanente) return;

  // Lanca para a fila reagendar com backoff.
  throw new Error(resultado.motivo ?? 'entrega da pesquisa falhou');
});
