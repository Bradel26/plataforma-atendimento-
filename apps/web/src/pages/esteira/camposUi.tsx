import { useEffect, useId, useState, type ReactNode } from 'react';
import { Input, Select, Textarea } from '../../components/ui';
import type { Opcao } from '../../lib/esteiraTypes';

/**
 * Peças de formulário da gaveta do vínculo. Cada campo grava sozinho (texto
 * ao sair do campo; seleção e data ao mudar) — a gaveta não tem botão Salvar.
 */

export function Secao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-slate-500">{titulo}</h3>
        {acao}
      </header>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Rotulado({ rotulo, dica, children }: { rotulo: string; dica?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {rotulo}
      </label>
      {children(id)}
      {dica && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
    </div>
  );
}

/** Texto que grava ao sair do campo, só se mudou; vazio grava `null`. */
export function CampoTexto({
  rotulo,
  valor,
  aoSalvar,
  desabilitado,
  multilinha = false,
  maximo,
  sugestoes,
  dica,
}: {
  rotulo: string;
  valor: string | null;
  aoSalvar: (v: string | null) => void;
  desabilitado: boolean;
  multilinha?: boolean;
  maximo: number;
  sugestoes?: string[];
  dica?: string;
}) {
  const [texto, setTexto] = useState(valor ?? '');
  const idLista = useId();
  useEffect(() => setTexto(valor ?? ''), [valor]);
  const salvar = () => {
    const limpo = texto.trim();
    if (limpo === (valor ?? '').trim()) return;
    aoSalvar(limpo || null);
  };
  return (
    <Rotulado rotulo={rotulo} dica={dica}>
      {(id) =>
        multilinha ? (
          <Textarea id={id} rows={3} maxLength={maximo} value={texto} disabled={desabilitado} onChange={(e) => setTexto(e.target.value)} onBlur={salvar} />
        ) : (
          <>
            <Input
              id={id}
              maxLength={maximo}
              value={texto}
              disabled={desabilitado}
              list={sugestoes ? idLista : undefined}
              onChange={(e) => setTexto(e.target.value)}
              onBlur={salvar}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            {sugestoes && (
              <datalist id={idLista}>
                {sugestoes.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </>
        )
      }
    </Rotulado>
  );
}

const FUSO = 'America/Sao_Paulo';
/** Dia (AAAA-MM-DD, Brasília) de um instante ISO. */
export const diaDoIso = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: FUSO }) : '');
/** Meio-dia de Brasília: a data não "volta um dia" em nenhum fuso de leitura. */
export const isoDoDia = (dia: string) => `${dia}T12:00:00-03:00`;

export function CampoData({
  rotulo,
  valor,
  aoSalvar,
  desabilitado,
  dica,
}: {
  rotulo: string;
  valor: string | null;
  aoSalvar: (v: string | null) => void;
  desabilitado: boolean;
  dica?: string;
}) {
  return (
    <Rotulado rotulo={rotulo} dica={dica}>
      {(id) => (
        <Input
          id={id}
          type="date"
          value={diaDoIso(valor)}
          disabled={desabilitado}
          onChange={(e) => {
            const dia = e.target.value;
            if (dia === diaDoIso(valor)) return;
            aoSalvar(dia ? isoDoDia(dia) : null);
          }}
        />
      )}
    </Rotulado>
  );
}

/** Seleção com "—" para vazio (`null`). */
export function CampoSelecao({
  rotulo,
  valor,
  opcoes,
  aoSalvar,
  desabilitado,
  semVazio = false,
  dica,
}: {
  rotulo: string;
  valor: string | null;
  opcoes: Opcao[];
  aoSalvar: (v: string | null) => void;
  desabilitado: boolean;
  semVazio?: boolean;
  dica?: string;
}) {
  return (
    <Rotulado rotulo={rotulo} dica={dica}>
      {(id) => (
        <Select id={id} value={valor ?? ''} disabled={desabilitado} onChange={(e) => aoSalvar(e.target.value || null)}>
          {(!semVazio || valor === null) && <option value="">—</option>}
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </Select>
      )}
    </Rotulado>
  );
}

/** Valor só de leitura, no mesmo desenho dos campos. */
export function CampoLeitura({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-600">{rotulo}</span>
      <span className="block text-sm text-slate-800">{children}</span>
    </div>
  );
}
