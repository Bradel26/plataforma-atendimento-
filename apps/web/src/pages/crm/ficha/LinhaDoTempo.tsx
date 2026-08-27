import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, EmptyState } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import {
  LABEL_TIPO_EVENTO,
  TIPOS_EVENTO,
  moeda,
  type EventoFicha,
  type Timeline,
  type TipoEvento,
} from '../../../lib/types';

/**
 * A vida do cliente em ordem cronologica: conversa, ligacao, atividade,
 * protocolo, oportunidade, mudanca de etapa, lead e pesquisa, num fluxo unico.
 *
 * A uniao acontece no banco (um `UNION ALL` com cursor sobre o conjunto), e nao
 * aqui: juntando na tela, o "carregar mais" traria a segunda pagina de cada
 * fonte em vez da continuacao da lista — e a ordem se desfaria no meio.
 */

/**
 * Cor por tipo de evento. Existe para o olho achar o que procura ao rolar, nao
 * para decorar: quem abre a ficha esta caçando "quando foi a ultima ligacao".
 */
const COR: Record<TipoEvento, string> = {
  CONVERSA: 'bg-sky-500',
  CHAMADA: 'bg-violet-500',
  ATIVIDADE: 'bg-amber-500',
  PROTOCOLO: 'bg-rose-500',
  OPORTUNIDADE: 'bg-emerald-500',
  ETAPA: 'bg-teal-500',
  LEAD: 'bg-indigo-500',
  PESQUISA: 'bg-fuchsia-500',
};

const LIMITE = 30;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const diaLegivel = (iso: string) => {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);

  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(data, hoje)) return 'Hoje';
  if (mesmoDia(data, ontem)) return 'Ontem';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const chave = (iso: string) => new Date(iso).toDateString();

type Props = {
  /** `/ficha/contato/:id` ou `/ficha/conta/:id`. */
  base: string;
  /** Muda quando o registro aberto muda: zera a lista e o cursor. */
  raizId: string;
  /** Recarrega quando o pai registra algo novo. */
  recarregar?: number;
};

export function LinhaDoTempo({ base, raizId, recarregar = 0 }: Props) {
  const [eventos, setEventos] = useState<EventoFicha[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [tipos, setTipos] = useState<TipoEvento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Lista vazia = sem filtro (todos os tipos). Guardar os oito selecionados
  // daria o mesmo resultado com uma URL tres vezes maior.
  const filtrando = tipos.length > 0;

  const buscar = useCallback(
    async (de: string | null) => {
      setCarregando(true);
      setErro(null);
      try {
        const qs = new URLSearchParams({ limite: String(LIMITE) });
        if (filtrando) qs.set('tipos', tipos.join(','));
        if (de) qs.set('cursor', de);

        const dados = await api.get<Timeline>(`${base}/timeline?${qs}`);
        // Concatena quando e continuacao; substitui quando e a primeira pagina.
        setEventos((atuais) => (de ? [...atuais, ...dados.eventos] : dados.eventos));
        setCursor(dados.proximoCursor);
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a linha do tempo');
      } finally {
        setCarregando(false);
      }
    },
    [base, filtrando, tipos],
  );

  useEffect(() => {
    setEventos([]);
    setCursor(null);
    void buscar(null);
  }, [buscar, raizId, recarregar]);

  const alternar = (tipo: TipoEvento) =>
    setTipos((atuais) => (atuais.includes(tipo) ? atuais.filter((t) => t !== tipo) : [...atuais, tipo]));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTipos([])}
          className={`rounded-full border px-2.5 py-1 text-xs transition ${
            filtrando
              ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
              : 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 font-medium text-[var(--brand-primary)]'
          }`}
        >
          Tudo
        </button>
        {TIPOS_EVENTO.map((tipo) => {
          const ativo = tipos.includes(tipo);
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => alternar(tipo)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                ativo
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 font-medium text-[var(--brand-primary)]'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${COR[tipo]}`} aria-hidden />
              {LABEL_TIPO_EVENTO[tipo]}
            </button>
          );
        })}
      </div>

      {erro && (
        <div className="mt-3">
          <Alerta>{erro}</Alerta>
        </div>
      )}

      <div className="mt-4">
        {eventos.length === 0 && !carregando ? (
          <EmptyState
            titulo={filtrando ? 'Nada neste filtro' : 'Sem historico'}
            descricao={
              filtrando
                ? 'Nenhum evento dos tipos selecionados. Tire um filtro para ver o resto.'
                : 'Assim que houver conversa, ligacao, proposta ou atividade, aparece aqui.'
            }
          />
        ) : (
          <ol className="relative">
            {eventos.map((evento, indice) => {
              const anterior = eventos[indice - 1];
              const novoDia = !anterior || chave(anterior.ocorridoEm) !== chave(evento.ocorridoEm);

              return (
                <li key={`${evento.tipo}-${evento.id}`}>
                  {novoDia && (
                    <p className="pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400 first:pt-0">
                      {diaLegivel(evento.ocorridoEm)}
                    </p>
                  )}
                  <div className="flex gap-3">
                    {/* A linha vertical liga os pontos e some no ultimo item. */}
                    <div className="flex flex-col items-center">
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${COR[evento.tipo]}`} aria-hidden />
                      {indice < eventos.length - 1 && <span className="w-px flex-1 bg-slate-200" aria-hidden />}
                    </div>

                    <div className="min-w-0 flex-1 pb-4">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        {/* <time> e nao <span>: o horario exibido e curto (so
                            hora e minuto), e o `dateTime` guarda o instante
                            completo — leitor de tela anuncia a data inteira, e o
                            teste confere a ordem pelo valor real. */}
                        <time
                          dateTime={evento.ocorridoEm}
                          className="text-xs tabular-nums text-slate-400"
                        >
                          {hora(evento.ocorridoEm)}
                        </time>
                        <span className="text-xs text-slate-400">{LABEL_TIPO_EVENTO[evento.tipo]}</span>
                        {/* Marca so o que vem da empresa: na ficha do contato, o
                            resto e dele, e um selo em cada linha seria ruido. */}
                        {evento.escopo === 'CONTA' && <Badge>Da empresa</Badge>}
                        {evento.canal && <Badge>{evento.canal}</Badge>}
                        {evento.situacao && <Badge tom="marca">{evento.situacao}</Badge>}
                        {evento.valor !== null && <Badge tom="sucesso">{moeda(evento.valor)}</Badge>}
                      </div>

                      <p className="mt-0.5 text-sm font-medium text-slate-800">{evento.titulo}</p>
                      {evento.detalhe && (
                        <p className="mt-0.5 line-clamp-3 text-sm text-slate-600">{evento.detalhe}</p>
                      )}
                      {evento.usuario && <p className="mt-0.5 text-xs text-slate-400">{evento.usuario}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {cursor && (
          <div className="pt-2">
            <Button variante="neutro" disabled={carregando} onClick={() => void buscar(cursor)}>
              {carregando ? 'Carregando...' : 'Carregar mais'}
            </Button>
          </div>
        )}
        {carregando && eventos.length === 0 && <p className="text-sm text-slate-500">Carregando historico...</p>}
      </div>
    </div>
  );
}
