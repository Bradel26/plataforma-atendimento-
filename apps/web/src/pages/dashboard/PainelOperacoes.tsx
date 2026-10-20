import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { ESTADO } from '../../lib/viz';
import type { PainelOperacao } from '../../lib/types';
import { BarraEmpilhada, Barras, TituloSecao } from './blocos';

/**
 * Visao geral dos parceiros, uma metade por operacao (SUGESTOES.docx,
 * Dashboard). Cada metade responde "quantos parceiros temos e em que
 * situacao" — o tempo e os gargalos ficam na Area da Gestao, para as duas
 * telas nao repetirem numero.
 *
 * Organizacao sem esteira nao ve nada aqui: a secao some em vez de mostrar
 * zeros que nao significam nada para ela.
 */
export function PainelOperacoes({ desde }: { desde: string }) {
  const [operacoes, setOperacoes] = useState<PainelOperacao[] | null>(null);

  useEffect(() => {
    void api
      .get<{ operacoes: PainelOperacao[] }>(`/credenciamentos/painel?desde=${encodeURIComponent(desde)}`)
      .then((r) => setOperacoes(r.operacoes))
      .catch(() => setOperacoes([]));
  }, [desde]);

  if (!operacoes || operacoes.length === 0) return null;

  return (
    <section aria-labelledby="sec-parceiros" className="flex flex-col gap-3">
      <TituloSecao id="sec-parceiros">Parceiros por operação</TituloSecao>
      <div className={`grid gap-4 ${operacoes.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {operacoes.map((o) => {
          const encerrados = o.reprovados + o.cancelados;
          return (
            <article key={o.funil.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-800">{o.funil.nome}</h3>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">{o.novosNoPeriodo} novo(s) no período</p>
                </div>
                <div className="text-right">
                  <span className="text-[28px] font-bold leading-none tracking-[-0.02em] text-slate-900">{o.total}</span>
                  <p className="mt-0.5 text-xs text-slate-500">parceiros</p>
                </div>
              </div>

              <BarraEmpilhada
                rotuloAcessivel={`${o.funil.nome}: ${o.ativos} ativos, ${o.pendentes} com cadastro pendente, ${o.inativos} inativos, ${o.reprovados} reprovados e ${o.cancelados} cancelados`}
                partes={[
                  { rotulo: 'Ativos', valor: o.ativos, cor: ESTADO.bom },
                  { rotulo: 'Cadastro pendente', valor: o.pendentes, cor: ESTADO.atencao },
                  { rotulo: 'Inativos', valor: o.inativos, cor: ESTADO.neutro },
                  { rotulo: `Reprovados / cancelados (${o.reprovados}/${o.cancelados})`, valor: encerrados, cor: ESTADO.grave },
                ]}
              />

              <div className="grid gap-5 border-t border-slate-100 pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs font-semibold text-slate-500">Na esteira, por etapa</p>
                  <Barras
                    larguraRotulo={104}
                    itens={o.porEstagio.map((e) => ({ rotulo: e.nome, valor: e.total }))}
                    vazio="Nenhum parceiro na esteira"
                  />
                </div>
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs font-semibold text-slate-500">Por estado</p>
                  <Barras
                    larguraRotulo={40}
                    itens={o.porUf.slice(0, 8).map((u) => ({ rotulo: u.rotulo, valor: u.total }))}
                    vazio="Nenhum parceiro com UF"
                  />
                  {o.porRegiao.length > 1 && (
                    <p className="text-xs text-slate-500">{o.porRegiao.map((r) => `${r.rotulo}: ${r.total}`).join(' · ')}</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
