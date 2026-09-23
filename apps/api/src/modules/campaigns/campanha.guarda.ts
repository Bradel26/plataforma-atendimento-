import type { Channel, ModoWhatsApp } from '@prisma/client';
import { modoEfetivo } from '../channels/whatsapp.modo';

/**
 * Campanha em lote nao sai pelo WhatsApp nao oficial.
 *
 * O worker dispara a ate 10 mensagens por segundo — ritmo pensado para a Cloud
 * API. Pela ponte, isso e um numero de WhatsApp Web mandando centenas de
 * mensagens identicas para quem nao escreveu primeiro, o padrao que mais leva a
 * bloqueio. E o numero usado seria o de `obterConfig('WHATSAPP')`: a linha
 * compartilhada, ou, sem ela, a linha pessoal mais antiga — o WhatsApp de um
 * vendedor, disparando em nome da empresa sem ele saber.
 *
 * Por isso a recusa e total, e nao um ritmo menor: nenhum ritmo torna
 * seguro disparar em lote por sessao de WhatsApp Web, e o risco (perder o
 * numero) e do negocio, nao do sistema. Quem precisa de campanha usa o modo
 * oficial, com template aprovado.
 *
 * Pura, para ser testada sem banco.
 */
export function motivoParaRecusarCampanha(
  canal: Channel,
  modo: ModoWhatsApp | null | undefined,
): string | null {
  if (canal !== 'WHATSAPP') return null;
  if (modoEfetivo(modo) !== 'NAO_OFICIAL') return null;
  return (
    'Campanha em lote nao e enviada pelo WhatsApp sem API oficial: disparo em massa por sessao de ' +
    'WhatsApp Web e a causa mais comum de bloqueio do numero. Use o modo oficial com template aprovado.'
  );
}
