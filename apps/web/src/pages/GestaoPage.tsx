import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Card, Field, Input } from '../components/ui';
import { BarList } from '../components/viz/BarList';
import { StatTile } from '../components/viz/StatTile';
import { ApiError, api } from '../lib/api';
import { ESTADO, SERIES } from '../lib/viz';
import type { ResultadosPesquisa } from '../lib/types';

const hoje = () => new Date().toISOString().slice(0, 10);
const trintaDias = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Area da Gestao: qualidade percebida pelo cliente, por agente. */
export function GestaoPage() {
  const [dados, setDados] = useState<ResultadosPesquisa | null>(null);
  const [desde, setDesde] = useState(trintaDias());
  const [ate, setAte] = useState(hoje());
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { resultados } = await api.get<{ resultados: ResultadosPesquisa }>(
        `/pesquisas/resultados?desde=${desde}&ate=${ate}T23:59:59`,
      );
      setDados(resultados);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar resultados');
    }
  }, [desde, ate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porAgente = (dados?.porAgente ?? [])
    .slice()
    .sort((a, b) => b.media - a.media)
    .map((a) => ({ rotulo: `${a.nome} (${a.respostas})`, valor: a.media, cor: SERIES[0] }));

  const taxa = dados?.taxaResposta ?? null;

  return (
    <div className="space-y-5">
      <Card titulo="Periodo">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="De">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Ate">
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile rotulo="Pesquisas enviadas" valor={dados?.enviadas ?? '—'} detalhe="uma por atendimento finalizado" />
        <StatTile rotulo="Respondidas" valor={dados?.respondidas ?? '—'} detalhe="clientes que avaliaram" />
        <StatTile
          rotulo="Taxa de resposta"
          valor={taxa === null ? '—' : `${taxa}%`}
          detalhe="abaixo de 20% a media e pouco confiavel"
          estado={taxa !== null && taxa < 20 ? ESTADO.atencao : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Nota media por agente" descricao="Entre parenteses, o numero de respostas">
          <BarList itens={porAgente} vazio="Nenhuma avaliacao respondida no periodo" />
        </Card>

        <Card titulo="Comentarios dos clientes" descricao={`${dados?.comentarios.length ?? 0} com texto`}>
          {!dados || dados.comentarios.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum comentario no periodo.</p>
          ) : (
            <ul className="max-h-96 space-y-3 overflow-y-auto">
              {dados.comentarios.map((c, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Badge tom={(c.nota ?? 0) >= 4 ? 'sucesso' : (c.nota ?? 0) >= 3 ? 'alerta' : 'neutro'}>
                        {c.tipo} {c.nota}
                      </Badge>
                      <span className="text-xs text-slate-500">{c.cliente}</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {c.agente ?? 'sem agente'}
                      {c.respondidoEm ? ` · ${new Date(c.respondidoEm).toLocaleDateString('pt-BR')}` : ''}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">{c.comentario}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
