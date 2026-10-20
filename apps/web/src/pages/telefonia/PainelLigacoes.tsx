import type { FormEvent } from 'react';
import { telefoneLegivel } from '../../lib/telefone';
import type { Chamada } from '../../lib/types';
import {
  IconeApagar,
  IconeCarregando,
  IconeCheck,
  IconeDesligar,
  IconeEnviar,
  IconeMicrofone,
  IconeMicrofoneMudo,
  IconeTelefone,
} from './icones';

const TECLAS: Array<[string, string]> = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', ''],
];

// Cores fixas nos dois temas: o verde e o vermelho da escala viram tons claros
// no tema escuro e apagariam o texto branco do botao.
const VERDE_LIGAR = '#047857';
const VERMELHO_DESLIGAR = '#DC2626';

export const relogio = (segundos: number | null) => {
  if (segundos === null) return '—';
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const inicial = (nome: string) => nome.trim().charAt(0).toLocaleUpperCase() || '?';

export type EmLigacao = { nome: string; conectado: boolean; segundos: number | null; mudo: boolean; gravando: boolean };
export type PosLigacao = {
  nome: string;
  segundos: number;
  gravacao: 'enviando' | 'salva' | 'falhou' | 'sem';
  transcricao: 'processando' | null;
};

export function PainelLigacoes({
  linhaCloudAtiva,
  transcricaoAtiva,
  aba,
  aoTrocarAba,
  destino,
  aoMudarDestino,
  aoLigar,
  ocupado,
  recebida,
  aoAtender,
  aoRecusar,
  emLigacao,
  aoAlternarMudo,
  aoDesligar,
  autorizacaoPendente,
  aoLigarDeNovo,
  aoFecharAutorizacao,
  posLigacao,
  aoNovaChamada,
}: {
  linhaCloudAtiva: boolean;
  transcricaoAtiva: boolean;
  aba: 'receber' | 'fazer';
  aoTrocarAba: (aba: 'receber' | 'fazer') => void;
  destino: string;
  aoMudarDestino: (valor: string) => void;
  aoLigar: (e: FormEvent) => void;
  ocupado: boolean;
  recebida: Chamada | undefined;
  aoAtender: (id: string) => void;
  aoRecusar: (id: string) => void;
  emLigacao: EmLigacao | null;
  aoAlternarMudo: () => void;
  aoDesligar: () => void;
  autorizacaoPendente: string | null;
  aoLigarDeNovo: () => void;
  aoFecharAutorizacao: () => void;
  posLigacao: PosLigacao | null;
  aoNovaChamada: () => void;
}) {
  const podeLigar = !ocupado && linhaCloudAtiva && destino.trim().length >= 10;

  let corpo;
  if (emLigacao) {
    corpo = (
      <section
        aria-label="Ligação em andamento"
        className="flex flex-col items-center gap-2 rounded-2xl px-5 py-6 text-center texto-sobre-cor-fixa"
        style={{ backgroundColor: '#0F172A' }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: emLigacao.conectado ? '#0f241d' : '#271c0c', color: emLigacao.conectado ? '#6EE7B7' : '#FCD34D' }}
        >
          <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: emLigacao.conectado ? '#14ac77' : '#ca8000' }} />
          {emLigacao.conectado ? 'Áudio conectado' : 'Chamando…'}
        </span>
        <span className="mt-2 flex h-[72px] w-[72px] items-center justify-center rounded-full text-[26px] font-bold" style={{ backgroundColor: '#1E3A8A' }}>
          {inicial(emLigacao.nome)}
        </span>
        <span className="mt-1 max-w-full truncate text-base font-bold">{emLigacao.nome}</span>
        <span className="text-[40px] font-bold leading-tight tracking-[-0.02em] tabular-nums" role="timer" aria-live="off">
          {relogio(emLigacao.segundos)}
        </span>
        {emLigacao.gravando && (
          <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: '#CBD5E1' }}>
            <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: '#f15653' }} />
            Gravando para o histórico
          </span>
        )}
        <div className="mt-4 flex items-start justify-center gap-7">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={aoAlternarMudo}
              aria-pressed={emLigacao.mudo}
              aria-label={emLigacao.mudo ? 'Ativar microfone' : 'Silenciar microfone'}
              className="flex h-14 w-14 items-center justify-center rounded-full transition hover:brightness-125"
              style={{ backgroundColor: emLigacao.mudo ? '#F1F5F9' : '#26303f', color: emLigacao.mudo ? '#0F172A' : '#F1F5F9' }}
            >
              {emLigacao.mudo ? <IconeMicrofoneMudo tamanho={22} /> : <IconeMicrofone tamanho={22} />}
            </button>
            <span className="text-xs" style={{ color: '#CBD5E1' }}>{emLigacao.mudo ? 'Microfone mudo' : 'Silenciar'}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={aoDesligar}
              aria-label="Desligar"
              className="flex h-14 w-14 items-center justify-center rounded-full transition hover:brightness-110"
              style={{ backgroundColor: VERMELHO_DESLIGAR }}
            >
              <IconeDesligar tamanho={24} />
            </button>
            <span className="text-xs" style={{ color: '#CBD5E1' }}>Desligar</span>
          </div>
        </div>
      </section>
    );
  } else if (recebida) {
    const nome = recebida.contato?.nome ?? recebida.numeroOrigem;
    corpo = (
      <section aria-label="Chamada recebida" className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 px-5 py-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none" />
          Tocando no WhatsApp
        </span>
        <span className="mt-3 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[28px] font-bold text-[var(--brand-primary)] ring-8 ring-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)]">
          {inicial(nome)}
        </span>
        <span className="mt-3 max-w-full truncate text-[17px] font-bold text-slate-900">{nome}</span>
        <span className="text-[13px] tabular-nums text-slate-500">
          WhatsApp · {/^\d+$/.test(recebida.numeroOrigem) ? telefoneLegivel(recebida.numeroOrigem) : recebida.numeroOrigem}
        </span>
        {!linhaCloudAtiva && <span className="text-xs text-amber-700">Habilite o WhatsApp Calling na sua linha para atender aqui.</span>}
        <div className="mt-4 grid w-full grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={ocupado || !linhaCloudAtiva}
            onClick={() => aoRecusar(recebida.id)}
            className="h-12 rounded-xl border border-red-200 bg-white text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Recusar
          </button>
          <button
            type="button"
            disabled={ocupado || !linhaCloudAtiva}
            onClick={() => aoAtender(recebida.id)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold texto-sobre-cor-fixa transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: VERDE_LIGAR }}
          >
            {ocupado ? <IconeCarregando tamanho={17} /> : <IconeTelefone tamanho={17} />}
            {ocupado ? 'Conectando…' : 'Atender'}
          </button>
        </div>
      </section>
    );
  } else if (posLigacao) {
    corpo = (
      <section aria-label="Ligação encerrada" className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 px-5 py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <IconeCheck tamanho={26} />
        </span>
        <span className="mt-2 text-base font-bold text-slate-900">Ligação encerrada</span>
        <span className="max-w-full truncate text-[13px] text-slate-500">
          {posLigacao.nome} · <span className="tabular-nums">{relogio(posLigacao.segundos)}</span>
        </span>
        <ul className="mt-3 flex w-full flex-col gap-2 text-left text-[13px] text-slate-700">
          <li className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
            {posLigacao.gravacao === 'enviando' ? (
              <IconeCarregando tamanho={16} className="text-blue-700" />
            ) : posLigacao.gravacao === 'salva' ? (
              <IconeCheck tamanho={16} className="text-emerald-700" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" aria-hidden="true" />
            )}
            {posLigacao.gravacao === 'enviando' && 'Salvando a gravação…'}
            {posLigacao.gravacao === 'salva' && 'Gravação salva no contato'}
            {posLigacao.gravacao === 'falhou' && <span className="text-red-700">Não foi possível salvar a gravação</span>}
            {posLigacao.gravacao === 'sem' && 'Sem gravação nesta ligação'}
          </li>
          {posLigacao.transcricao === 'processando' && (
            <li className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
              <IconeCarregando tamanho={16} className="mt-0.5 text-blue-700" />
              <span>
                Transcrevendo no servidor
                <span className="mt-0.5 block text-xs text-slate-500">Resumo e próximas ações aparecem no histórico quando terminar.</span>
              </span>
            </li>
          )}
        </ul>
        <button
          type="button"
          onClick={aoNovaChamada}
          className="mt-4 h-11 w-full rounded-xl bg-slate-900 text-sm font-bold text-white transition hover:bg-slate-700"
        >
          Nova chamada
        </button>
      </section>
    );
  } else if (autorizacaoPendente) {
    corpo = (
      <section aria-label="Pedido de autorização" className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-[17px] font-bold text-slate-700">
            <IconeTelefone tamanho={18} />
          </span>
          <p className="min-w-0 truncate text-[15px] font-bold tabular-nums text-slate-900">{autorizacaoPendente}</p>
        </div>
        <div className="flex gap-2.5 rounded-xl bg-blue-50 p-3.5">
          <IconeEnviar tamanho={18} className="mt-0.5 text-blue-700" />
          <div>
            <p className="text-[13.5px] font-bold text-blue-700">Pedido de autorização enviado</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-700">
              A Meta só permite ligar depois que o cliente aceita no WhatsApp. Assim que ele aceitar, ligue de novo.
            </p>
          </div>
        </div>
        <ol className="flex flex-col gap-2.5 text-[12.5px] text-slate-700">
          {['Permissão verificada', 'Pedido enviado ao cliente'].map((passo) => (
            <li key={passo} className="flex items-center gap-2">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full texto-sobre-cor-fixa" style={{ backgroundColor: VERDE_LIGAR }}>
                <IconeCheck tamanho={11} />
              </span>
              {passo}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="h-[18px] w-[18px] rounded-full border-2 border-slate-300" aria-hidden="true" />
            Aguardando o aceite no WhatsApp
          </li>
        </ol>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={aoFecharAutorizacao}
            className="h-11 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={aoLigarDeNovo}
            className="flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold texto-sobre-cor-fixa transition hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: VERDE_LIGAR }}
          >
            {ocupado ? <IconeCarregando tamanho={16} /> : <IconeTelefone tamanho={16} />}
            Ligar de novo
          </button>
        </div>
      </section>
    );
  } else {
    corpo = (
      <>
        <div role="tablist" aria-label="Modo do painel" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(['fazer', 'receber'] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              onClick={() => aoTrocarAba(valor)}
              className={`h-9 rounded-lg text-[13px] font-semibold transition ${
                aba === valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {valor === 'fazer' ? 'Fazer chamada' : 'Receber'}
            </button>
          ))}
        </div>

        {aba === 'fazer' ? (
          <form onSubmit={aoLigar} className="flex flex-col gap-3.5">
            <div className="relative">
              <label htmlFor="destino-ligacao" className="sr-only">Número com código do país</label>
              <input
                id="destino-ligacao"
                value={destino}
                onChange={(e) => aoMudarDestino(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="+55 62 9 0000-0000"
                className="h-14 w-full rounded-xl border border-slate-300 bg-white pl-4 pr-12 text-center text-[22px] font-semibold tracking-[0.02em] tabular-nums text-slate-900 outline-none transition placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-[var(--brand-primary)]"
              />
              {destino && (
                <button
                  type="button"
                  aria-label="Apagar último dígito"
                  onClick={() => aoMudarDestino(destino.slice(0, -1))}
                  className="absolute right-2 top-2.5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <IconeApagar tamanho={20} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {TECLAS.map(([digito, letras]) => (
                <button
                  key={digito}
                  type="button"
                  onClick={() => aoMudarDestino(`${destino}${digito}`)}
                  aria-label={`Tecla ${digito}`}
                  className="flex h-[54px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 transition hover:bg-slate-100 active:scale-[0.97]"
                >
                  <span className="text-xl font-semibold leading-tight text-slate-900">{digito}</span>
                  <span className="min-h-[11px] text-[9.5px] font-semibold tracking-[0.14em] text-slate-500">{letras}</span>
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={!podeLigar}
              className="flex h-[50px] items-center justify-center gap-2.5 rounded-2xl text-[15px] font-bold texto-sobre-cor-fixa transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              style={podeLigar ? { backgroundColor: VERDE_LIGAR } : undefined}
            >
              {ocupado ? <IconeCarregando tamanho={18} /> : <IconeTelefone tamanho={18} />}
              {ocupado ? 'Conectando…' : 'Ligar pelo WhatsApp'}
            </button>
            <p className="text-xs leading-relaxed text-slate-500">
              Use o telefone com código do país. Se o cliente ainda não autorizou ligações, a plataforma envia a ele um pedido para aceitar no
              WhatsApp antes de chamar.
            </p>
            {!linhaCloudAtiva && (
              <p className="text-xs leading-relaxed text-amber-700">Conecte e habilite o WhatsApp Calling na sua linha Cloud para ligar daqui.</p>
            )}
          </form>
        ) : (
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-slate-300 px-4 py-7 text-center">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <IconeTelefone tamanho={22} />
            </span>
            <span className="text-sm font-semibold text-slate-800">Nenhuma chamada tocando agora</span>
            <span className="text-[12.5px] leading-relaxed text-slate-500">
              Quando um cliente ligar no WhatsApp da sua linha, a chamada toca aqui no navegador para você atender ou recusar.
            </span>
          </div>
        )}
      </>
    );
  }

  return (
    <aside aria-labelledby="titulo-painel-ligacoes" className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-painel-ligacoes" className="text-base font-semibold text-slate-900">Painel de ligações</h2>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${linhaCloudAtiva ? 'text-emerald-700' : 'text-amber-700'}`}>
          <span className={`h-[7px] w-[7px] rounded-full ${linhaCloudAtiva ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {linhaCloudAtiva ? 'Cloud API' : 'Configuração pendente'}
        </span>
      </div>

      {corpo}

      <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-[12.5px] text-slate-700">
        <IconeMicrofone tamanho={16} className="text-slate-500" />
        <span className="flex-1">Gravação e transcrição automáticas</span>
        <span className={`font-bold ${transcricaoAtiva ? 'text-emerald-700' : 'text-amber-700'}`}>
          {transcricaoAtiva ? 'Ativas' : 'Só gravação'}
        </span>
      </div>
    </aside>
  );
}
