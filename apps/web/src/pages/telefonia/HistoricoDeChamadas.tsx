import { useState } from 'react';
import { Button } from '../../components/ui';
import { telefoneLegivel } from '../../lib/telefone';
import {
  LABEL_CHAMADA_STATUS,
  type CallStatus,
  type Chamada,
} from '../../lib/types';
import { AssistenteDaLigacao } from './AssistenteDaLigacao';
import { IconeFeita, IconeRecebida } from './icones';
import { relogio } from './PainelLigacoes';

type Filtro = 'todas' | 'recebidas' | 'feitas' | 'perdidas';

const FILTROS: Array<{ id: Filtro; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'recebidas', rotulo: 'Recebidas' },
  { id: 'feitas', rotulo: 'Feitas' },
  { id: 'perdidas', rotulo: 'Perdidas' },
];

const STATUS_PERDIDA = new Set<CallStatus>(['NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA']);

// Amostra somente visual: nao vem da API e nunca e salva no banco.
const CHAMADA_DEMO: Chamada = {
  id: 'demo-chamada-local',
  idExterno: 'demo-chamada-local',
  direcao: 'ENTRANTE',
  status: 'COMPLETADA',
  numeroOrigem: '5562991234567',
  numeroDestino: '556292885001',
  iniciadoEm: new Date().toISOString(),
  atendidoEm: new Date(Date.now() + 4_000).toISOString(),
  encerradoEm: new Date(Date.now() + 231_000).toISOString(),
  duracao: 227,
  gravacaoUrl: null,
  gravacaoDuracao: 227,
  transcricao: null,
  custo: null,
  motivoFalha: null,
  contato: { id: 'demo-contato-local', nome: 'Marcos Ribeiro · Demonstração' },
  agente: { id: 'demo-agente-local', nome: 'Kauã Tavares' },
  fila: null,
};

const CLASSE_STATUS: Record<CallStatus, string> = {
  INICIANDO: 'bg-blue-50 text-blue-700',
  CHAMANDO: 'bg-blue-50 text-blue-700',
  EM_ANDAMENTO: 'bg-blue-50 text-blue-700',
  COMPLETADA: 'bg-emerald-50 text-emerald-700',
  NAO_ATENDIDA: 'bg-amber-50 text-amber-700',
  OCUPADA: 'bg-amber-50 text-amber-700',
  FALHOU: 'bg-red-50 text-red-700',
  CANCELADA: 'bg-slate-100 text-slate-600',
};

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const numeroLegivel = (numero: string) => (/^\d+$/.test(numero) ? telefoneLegivel(numero) : numero);
const custoCurto = (v: number | null | undefined) => v == null ? '—' : `R$ ${v.toFixed(4).replace('.', ',')}`;

export function HistoricoDeChamadas({
  chamadas,
  cursor,
  onCarregarMais,
}: {
  chamadas: Chamada[];
  cursor: string | null;
  onCarregarMais: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const somenteDemo = import.meta.env.DEV && chamadas.length === 0;
  const registros = somenteDemo ? [CHAMADA_DEMO] : chamadas;
  const visiveis = registros.filter((c) =>
    filtro === 'todas' ||
    (filtro === 'recebidas' && c.direcao === 'ENTRANTE') ||
    (filtro === 'feitas' && c.direcao === 'SAINTE') ||
    (filtro === 'perdidas' && STATUS_PERDIDA.has(c.status)),
  );
  const chamada = visiveis.find((c) => c.id === selecionadaId) ?? visiveis[0] ?? null;

  return (
    <section aria-labelledby="titulo-historico" className="order-2 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white xl:order-1">
      <div className="grid min-h-[640px] grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 px-4 pb-3 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h2 id="titulo-historico" className="text-sm font-semibold text-slate-900">Histórico de chamadas</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${somenteDemo ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                {somenteDemo ? '1 exemplo fictício' : cursor ? `${chamadas.length}+ chamadas` : `${chamadas.length} chamadas`}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Selecione uma ligação para ver os detalhes.</p>
            <div role="group" aria-label="Filtrar chamadas" className="mt-3 flex flex-wrap gap-1.5">
              {FILTROS.map((f) => {
                const ativo = filtro === f.id;
                const total = registros.filter((c) => f.id === 'todas' ||
                  (f.id === 'recebidas' && c.direcao === 'ENTRANTE') ||
                  (f.id === 'feitas' && c.direcao === 'SAINTE') ||
                  (f.id === 'perdidas' && STATUS_PERDIDA.has(c.status))).length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltro(f.id)}
                    className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition ${
                      ativo ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {f.rotulo}<span className="tabular-nums opacity-75">{total}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {visiveis.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {somenteDemo ? 'Nenhum exemplo neste filtro.' : 'Nenhuma chamada neste filtro.'}
            </p>
          ) : (
            <div className="max-h-[680px] overflow-y-auto">
                {visiveis.map((c) => {
                const recebida = c.direcao === 'ENTRANTE';
                const numero = recebida ? c.numeroOrigem : c.numeroDestino;
                const selecionada = chamada?.id === c.id;
                const perdida = recebida && STATUS_PERDIDA.has(c.status);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={selecionada}
                    onClick={() => setSelecionadaId(c.id)}
                    className={`flex min-h-[88px] w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${
                      selecionada ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      perdida ? 'bg-red-50 text-red-700' : recebida ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`} aria-hidden="true">
                      {recebida ? <IconeRecebida tamanho={16} /> : <IconeFeita tamanho={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-slate-900">{c.contato?.nome ?? numeroLegivel(numero)}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-500">{dataHora(c.iniciadoEm)}</span>
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-slate-500">
                        {somenteDemo ? 'AMOSTRA FICTÍCIA · ' : `${recebida ? 'Recebida' : 'Feita'} · `}{numeroLegivel(numero)}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CLASSE_STATUS[c.status]}`}>{LABEL_CHAMADA_STATUS[c.status]}</span>
                        <span className="text-[11px] tabular-nums text-slate-500">{relogio(c.duracao)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {cursor && <div className="p-3"><Button variante="neutro" tamanho="sm" onClick={onCarregarMais}>Carregar chamadas anteriores</Button></div>}
        </div>

        {chamada ? (() => {
          const recebida = chamada.direcao === 'ENTRANTE';
          const numero = recebida ? chamada.numeroOrigem : chamada.numeroDestino;
          const audioInterno = Boolean(chamada.gravacaoUrl?.startsWith('/api/arquivos/'));
          return (
            <div className="min-w-0 p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-700">
                    {(chamada.contato?.nome ?? numeroLegivel(numero)).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-slate-900">{chamada.contato?.nome ?? numeroLegivel(numero)}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {numeroLegivel(numero)}{chamada.linha ? ` · linha ${chamada.linha.nome ?? chamada.linha.donoNome ?? 'WhatsApp'}` : ''}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${recebida ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{recebida ? 'Recebida' : 'Feita'}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${CLASSE_STATUS[chamada.status]}`}>{LABEL_CHAMADA_STATUS[chamada.status]}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Gravação da chamada</h3>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {dataHora(chamada.iniciadoEm)} · Duração {relogio(chamada.duracao)} · Custo {custoCurto(chamada.custo)}
                  </p>
                </div>
                {audioInterno && <a href={chamada.gravacaoUrl!} download className="text-xs font-semibold text-blue-700 hover:underline">Baixar áudio ↓</a>}
              </div>
              {somenteDemo && <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">Demonstração fictícia. Não é uma chamada real e não foi salva.</div>}
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:p-4">
                {somenteDemo ? (
                  <div className="flex items-center gap-3" aria-label="Prévia visual do player de áudio; sem arquivo de som">
                    <button type="button" disabled aria-label="Reprodução indisponível na amostra" className="flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-slate-300 text-white">▶</button>
                    <div className="min-w-0 flex-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/3 rounded-full bg-blue-500" /></div>
                      <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>Prévia do player</span><span>03:47</span></div>
                    </div>
                    <span className="text-[10px] text-slate-500">Sem áudio</span>
                  </div>
                ) : audioInterno ? (
                  <audio controls preload="metadata" src={chamada.gravacaoUrl!} className="h-10 w-full" aria-label={`Ouvir gravação da chamada com ${chamada.contato?.nome ?? numeroLegivel(numero)}`} />
                ) : chamada.gravacaoUrl ? (
                  <p className="text-xs leading-relaxed text-slate-600">A gravação está hospedada no provedor e não pode ser reproduzida pelo player da plataforma.</p>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-600">Esta chamada ainda não tem uma gravação disponível.</p>
                )}
              </div>

              {somenteDemo ? <div className="mt-5 space-y-5 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Resumo da chamada</h3>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">Exemplo fictício</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">Marcos ligou para consultar a disponibilidade de um produto. O atendente confirmou o estoque e combinou enviar as opções e os valores pelo WhatsApp.</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transcrição</h4>
                  <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                    <p><strong className="text-slate-900">Marcos:</strong> Olá, vocês têm esse modelo disponível?</p>
                    <p><strong className="text-slate-900">Atendente:</strong> Temos sim. Vou confirmar as cores e te mando as opções pelo WhatsApp.</p>
                    <p><strong className="text-slate-900">Marcos:</strong> Perfeito, pode enviar também os valores?</p>
                    <p><strong className="text-slate-900">Atendente:</strong> Claro, envio tudo por mensagem ainda hoje.</p>
                  </div>
                </div>
              </div> : <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <AssistenteDaLigacao key={chamada.id} chamadaId={chamada.id} />
              </div>}
              {!somenteDemo && <p className="mt-3 text-[11px] text-slate-400">A transcrição e o resumo aparecem quando o processamento da chamada estiver concluído.</p>}
            </div>
          );
        })() : (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500" aria-hidden="true">☎</span>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">Selecione uma chamada</h3>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">Os detalhes, a gravação e a análise da ligação serão exibidos aqui.</p>
          </div>
        )}
      </div>
      <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
        Cada ligação também aparece na linha do tempo do contato no CRM.
      </div>
    </section>
  );
}
