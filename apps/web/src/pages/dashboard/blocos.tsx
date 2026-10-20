import type { ReactNode } from 'react';
import { SERIES } from '../../lib/viz';

export type Tom = 'bom' | 'atencao' | 'grave';

// So tons que o tema escuro remapeia em index.css.
const CLASSE_SELO: Record<Tom, string> = {
  bom: 'bg-emerald-50 text-emerald-700',
  atencao: 'bg-amber-50 text-amber-700',
  grave: 'bg-red-50 text-red-700',
};

/** Estado sempre com icone e texto — nunca so a cor. */
export function Selo({ tom, children }: { tom: Tom; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2.5 text-[11.5px] font-semibold ${CLASSE_SELO[tom]}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        {tom === 'bom' ? <path d="m8.5 12 2.5 2.5 4.5-5" /> : <path d="M12 8v4M12 16h.01" />}
      </svg>
      {children}
    </span>
  );
}

export function TituloSecao({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-xs font-bold uppercase tracking-[0.08em] text-slate-600">
      {children}
    </h2>
  );
}

export function Painel({
  titulo,
  descricao,
  acao,
  children,
  className = '',
}: {
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    // `min-w-0`: item de grade encolhe abaixo do conteudo (a tabela de assuntos
    // rola dentro do proprio cartao em vez de alargar a pagina no celular).
    <section className={`flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-800">{titulo}</h3>
          {descricao && <p className="mt-0.5 text-[12.5px] text-slate-500">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Indicador({
  rotulo,
  valor,
  detalhe,
  selo,
  grande = false,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  selo?: ReactNode;
  grande?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-5 ${grande ? 'min-h-[140px] py-[18px]' : 'py-4'}`}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-slate-700">{rotulo}</span>
        {selo}
      </div>
      {/* Numero grande com digitos proporcionais: tabular deixa "121" frouxo em tamanho de destaque. */}
      <span
        className={`font-bold text-slate-900 [font-variant-numeric:proportional-nums] ${
          grande ? 'mt-1 text-4xl leading-tight tracking-[-0.03em]' : 'text-[28px] leading-tight tracking-[-0.02em]'
        }`}
      >
        {valor}
      </span>
      {detalhe && <span className="text-[12.5px] text-slate-500">{detalhe}</span>}
    </div>
  );
}

/**
 * Barras horizontais compactas: rotulo, barra e valor na mesma linha. O valor
 * fica sempre escrito — tres tons da paleta ficam abaixo de 3:1 de contraste, e
 * a barra sozinha nao pode ser a unica forma de ler o numero.
 */
export function Barras({
  itens,
  larguraRotulo = 96,
  vazio,
  unidade,
  cor = SERIES[0],
  formatar = String,
}: {
  itens: Array<{ rotulo: string; valor: number }>;
  larguraRotulo?: number;
  vazio: string;
  unidade?: string;
  cor?: string;
  /** Como o numero aparece escrito (ex.: decimal com virgula). */
  formatar?: (valor: number) => string;
}) {
  const maximo = Math.max(...itens.map((i) => i.valor), 0);
  if (itens.length === 0 || maximo === 0) return <p className="text-sm text-slate-500">{vazio}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {itens.map((item) => (
        <li
          key={item.rotulo}
          className="grid items-center gap-2.5"
          style={{ gridTemplateColumns: `${larguraRotulo}px minmax(0, 1fr) auto` }}
        >
          <span className="truncate text-[13px] text-slate-700" title={item.rotulo}>
            {item.rotulo}
          </span>
          <span className="block h-2.5" aria-hidden="true">
            <span
              className="block h-full rounded-r"
              style={{ width: `${Math.max((item.valor / maximo) * 100, 1.5)}%`, backgroundColor: cor }}
            />
          </span>
          <span className="min-w-6 text-right text-[13px] font-semibold tabular-nums text-slate-800">
            {formatar(item.valor)}
            {unidade ? ` ${unidade}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Parte-de-um-todo em uma barra, com legenda escrita (rotulo + numero) logo abaixo. */
export function BarraEmpilhada({
  partes,
  rotuloAcessivel,
  legendaEmDuasColunas = false,
}: {
  partes: Array<{ rotulo: string; valor: number; cor: string }>;
  rotuloAcessivel: string;
  legendaEmDuasColunas?: boolean;
}) {
  const visiveis = partes.filter((p) => p.valor > 0);
  return (
    <div>
      <div role="img" aria-label={rotuloAcessivel} className="flex h-3 gap-0.5">
        {visiveis.length === 0 ? (
          <span className="flex-1 rounded-[3px] bg-slate-100" />
        ) : (
          visiveis.map((p) => (
            <span key={p.rotulo} className="rounded-[3px]" style={{ flex: `${p.valor} 1 0`, backgroundColor: p.cor }} />
          ))
        )}
      </div>
      <ul className={`mt-2.5 ${legendaEmDuasColunas ? 'grid grid-cols-2 gap-x-3 gap-y-1.5' : 'flex flex-wrap gap-x-4 gap-y-1.5'}`}>
        {partes.map((p) => (
          <li key={p.rotulo} className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-slate-700">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: p.cor }} aria-hidden="true" />
            <span className={legendaEmDuasColunas ? 'min-w-0 flex-1 truncate' : ''}>{p.rotulo}</span>
            <span className="font-bold tabular-nums text-slate-900">{p.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Progresso contra um alvo: preenchimento, traco vertical no alvo e, se houver,
 * um circulo vazado na projecao. `escala` e o valor que ocupa 100% da largura.
 */
export function BarraComAlvo({
  valor,
  alvo,
  rotuloAlvo,
  escala = 100,
  projecao,
  cor,
}: {
  valor: number;
  alvo: number;
  rotuloAlvo: string;
  escala?: number;
  projecao?: number | null;
  cor: string;
}) {
  const pos = (v: number) => `${Math.min(Math.max((v / escala) * 100, 0), 100)}%`;
  return (
    <div className="relative h-10" aria-hidden="true">
      <span className="absolute inset-x-0 top-1.5 h-2.5 rounded-r bg-slate-100" />
      <span className="absolute left-0 top-1.5 h-2.5 rounded-r" style={{ width: pos(valor), backgroundColor: cor }} />
      <span className="absolute top-0 h-[22px] w-0.5 -translate-x-1/2 bg-slate-800" style={{ left: pos(alvo) }} />
      <span className="absolute top-6 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold text-slate-600" style={{ left: pos(alvo) }}>
        {rotuloAlvo}
      </span>
      {projecao != null && (
        <span
          className="absolute top-0.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 bg-white"
          style={{ left: pos(projecao), borderColor: cor }}
        />
      )}
    </div>
  );
}
