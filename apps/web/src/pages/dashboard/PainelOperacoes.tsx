import { useEffect, useState } from 'react';
import { Card } from '../../components/ui';
import { BarList } from '../../components/viz/BarList';
import { StatTile } from '../../components/viz/StatTile';
import { api } from '../../lib/api';
import { ESTADO, SERIES } from '../../lib/viz';
import type { PainelOperacao } from '../../lib/types';

/**
 * Visao geral dos parceiros, tela dividida ao meio: uma metade por operacao
 * (SUGESTOES.docx, Dashboard). Cada metade responde "quantos parceiros temos e
 * em que situacao" — o tempo e os gargalos ficam na Area da Gestao, para as
 * duas telas nao repetirem numero.
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
    <section aria-label="Parceiros por operação" className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Parceiros por operação</h2>
      <div className={`grid gap-5 ${operacoes.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {operacoes.map((o) => (
          <Card key={o.funil.id} titulo={o.funil.nome} descricao={`${o.total} parceiro(s) cadastrados`}>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              <StatTile rotulo="Cadastrados" valor={o.total} />
              <StatTile rotulo="Ativos" valor={o.ativos} estado={o.ativos > 0 ? ESTADO.bom : undefined} />
              <StatTile
                rotulo="Cadastro pendente"
                valor={o.pendentes}
                estado={o.pendentes > 0 ? ESTADO.atencao : undefined}
              />
              <StatTile rotulo="Inativos" valor={o.inativos} estado={o.inativos > 0 ? ESTADO.neutro : undefined} />
              <StatTile rotulo="Novos no período" valor={o.novosNoPeriodo} />
              <StatTile
                rotulo="Reprovados / cancelados"
                valor={`${o.reprovados} / ${o.cancelados}`}
                estado={o.reprovados + o.cancelados > 0 ? ESTADO.grave : undefined}
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Na esteira, por etapa</p>
                <BarList
                  itens={o.porEstagio.map((e) => ({ rotulo: e.nome, valor: e.total, cor: SERIES[0] }))}
                  vazio="Nenhum parceiro na esteira"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Por estado</p>
                <BarList
                  itens={o.porUf.slice(0, 8).map((u) => ({ rotulo: u.rotulo, valor: u.total, cor: SERIES[2] }))}
                  vazio="Nenhum parceiro com UF"
                />
                {o.porRegiao.length > 1 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {o.porRegiao.map((r) => `${r.rotulo}: ${r.total}`).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
