import { useState } from 'react';
import { Alerta } from '../../components/ui';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { telefoneLegivel } from '../../lib/telefone';
import { AvatarConversa } from './AvatarConversa';
import type { GrupoCaixa } from './caixaEntrada';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function CaixaEntradaEquipes({ grupos, carregando, erro, aceitandoId, onAceitar }: {
  grupos: GrupoCaixa[];
  carregando: boolean;
  erro: string | null;
  aceitandoId: string | null;
  onAceitar: (conversaId: string) => void;
}) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const chave = (grupo: GrupoCaixa) => grupo.fila?.id ?? 'sem-equipe';
  const estaAberto = (grupo: GrupoCaixa) => abertos[chave(grupo)] ?? grupo.conversas.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-slate-100 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-slate-800">Caixa de entrada</h2>
      </header>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {erro && <Alerta>{erro}</Alerta>}
        {carregando && grupos.length === 0 && <SkeletonBloco className="h-8 w-full" />}
        {!carregando && grupos.length === 0 && !erro && (
          <p className="px-2 py-3 text-xs text-slate-500">Você não está em nenhuma equipe. Peça a um administrador para incluir você numa fila.</p>
        )}
        {grupos.map((grupo) => (
          <section key={chave(grupo)} className="rounded-lg bg-slate-50">
            <button
              type="button"
              onClick={() => setAbertos((atuais) => ({ ...atuais, [chave(grupo)]: !estaAberto(grupo) }))}
              aria-expanded={estaAberto(grupo)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              <span className="truncate">{grupo.fila?.nome ?? 'Sem equipe'}</span>
              {grupo.conversas.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">
                  {grupo.conversas.length}
                </span>
              )}
            </button>
            {estaAberto(grupo) && (
              <ul className="space-y-1 px-1.5 pb-1.5">
                {grupo.conversas.length === 0 && <li className="py-2 text-center text-xs text-slate-400">Sem nenhum chat novo</li>}
                {grupo.conversas.map((conversa) => (
                  <li key={conversa.id}>
                    <button
                      type="button"
                      disabled={aceitandoId !== null}
                      onClick={() => onAceitar(conversa.id)}
                      title="Aceitar esta conversa"
                      className="flex w-full items-center gap-2 rounded-md bg-white px-2 py-2 text-left shadow-sm transition hover:ring-1 hover:ring-[var(--brand-primary)] disabled:opacity-60"
                    >
                      <AvatarConversa conversaId={conversa.id} nome={conversa.contato.nome} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-medium text-slate-800">{conversa.contato.nome}</span>
                          <span className="shrink-0 text-[10px] text-slate-400">{hora(conversa.ultimaMensagemEm)}</span>
                        </div>
                        <p className="truncate text-[11px] text-slate-500">
                          {conversa.contato.telefone ? telefoneLegivel(conversa.contato.telefone) : (conversa.linha?.nome ?? '')}
                        </p>
                      </div>
                      {aceitandoId === conversa.id && <span className="text-[10px] text-slate-400">...</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
