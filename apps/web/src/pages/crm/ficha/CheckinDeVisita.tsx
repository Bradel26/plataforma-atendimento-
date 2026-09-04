import { useState } from 'react';
import { Badge, Button } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import type { Atividade } from '../../../lib/types';

/**
 * Check-in e check-out de visita (item 6.7 do plano em ANALISE-CRM.md).
 *
 * Fica na propria linha da tarefa, e nao numa tela de visitas: quem vai a campo
 * abre a tarefa que tem para fazer, e um segundo lugar para registrar a mesma
 * coisa seria um segundo lugar para esquecer.
 *
 * Vale mais para o tecnico que para o vendedor, como o plano registra — e por
 * isso os botoes sao grandes e sao dois, sem menu: a operacao acontece no
 * celular, na porta do cliente, muitas vezes com uma mao.
 */

/**
 * Pede a localizacao ao navegador, e desiste rapido.
 *
 * Nunca rejeita: coordenada ausente **nao** impede o check-in. Oito segundos de
 * teto porque quem esta na porta do cliente nao vai esperar mais que isso, e o
 * registro sem coordenada e melhor que registro nenhum.
 */
function localizacaoAtual(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;

/** Minutos entre chegada e saida, ou nulo enquanto a visita nao terminou. */
const duracao = (a: Atividade) => {
  if (!a.checkinEm || !a.checkoutEm) return null;
  const ms = new Date(a.checkoutEm).getTime() - new Date(a.checkinEm).getTime();
  return Math.max(1, Math.round(ms / 60_000));
};

const mapa = (lat?: number | null, lng?: number | null) =>
  lat === null || lat === undefined || lng === null || lng === undefined
    ? null
    : `https://www.google.com/maps?q=${lat},${lng}`;

type Props = {
  atividade: Atividade;
  aoMudar: (atualizada: Atividade) => void;
  aoErrar: (mensagem: string) => void;
};

export function CheckinDeVisita({ atividade, aoMudar, aoErrar }: Props) {
  const [enviando, setEnviando] = useState<'checkin' | 'checkout' | null>(null);

  // So VISITA tem check-in. Em qualquer outro tipo o componente nao desenha
  // nada, como a API tambem recusa.
  if (atividade.tipo !== 'VISITA') return null;

  const registrar = async (qual: 'checkin' | 'checkout') => {
    setEnviando(qual);
    try {
      const local = await localizacaoAtual();
      const { atividade: atualizada } = await api.post<{ atividade: Atividade }>(
        `/atividades/${atividade.id}/${qual}`,
        local ?? {},
      );
      aoMudar(atualizada);
    } catch (e) {
      aoErrar(e instanceof ApiError ? e.message : 'Falha ao registrar a visita');
    } finally {
      setEnviando(null);
    }
  };

  const minutos = duracao(atividade);
  const linkChegada = mapa(atividade.checkinLat, atividade.checkinLng);

  if (atividade.checkoutEm) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tom="sucesso">Visita concluida</Badge>
        <span>
          {hora(atividade.checkinEm)} &rarr; {hora(atividade.checkoutEm)}
          {minutos !== null && ` · ${minutos} min`}
        </span>
        {linkChegada ? (
          <a
            href={linkChegada}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--brand-primary)] underline-offset-2 hover:underline"
          >
            ver no mapa
          </a>
        ) : (
          // Dizer que nao houve localizacao e melhor que omitir: quem le o
          // registro depois precisa saber que o dado nao existe, e nao supor que
          // ninguem clicou.
          <span className="text-slate-400">sem localizacao</span>
        )}
      </div>
    );
  }

  if (atividade.checkinEm) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Badge tom="marca">Em visita desde {hora(atividade.checkinEm)}</Badge>
        <Button variante="neutro" onClick={() => void registrar('checkout')} disabled={enviando !== null}>
          {enviando === 'checkout' ? 'Encerrando...' : 'Check-out'}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <Button onClick={() => void registrar('checkin')} disabled={enviando !== null}>
        {enviando === 'checkin' ? 'Registrando...' : 'Check-in da visita'}
      </Button>
    </div>
  );
}
