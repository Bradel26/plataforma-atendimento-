import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button, Card, Field, Input, Select } from '../components/ui';
import { ApiError, api, baixarCsv } from '../lib/api';
import type { Relatorio } from '../lib/types';

type Opcao = { nome: string; titulo: string };

const hoje = () => new Date().toISOString().slice(0, 10);
const trintaDiasAtras = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function RelatoriosPage() {
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [nome, setNome] = useState('atendimentos');
  const [desde, setDesde] = useState(trintaDiasAtras());
  const [ate, setAte] = useState(hoje());
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    void api
      .get<{ relatorios: Opcao[] }>('/relatorios')
      .then(({ relatorios }) => setOpcoes(relatorios))
      .catch(() => undefined);
  }, []);

  const parametros = useCallback(() => `desde=${desde}&ate=${ate}T23:59:59`, [desde, ate]);

  const gerar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const { relatorio: r } = await api.get<{ relatorio: Relatorio }>(`/relatorios/${nome}?${parametros()}`);
      setRelatorio(r);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao gerar o relatorio');
    } finally {
      setCarregando(false);
    }
  }, [nome, parametros]);

  useEffect(() => {
    void gerar();
  }, [gerar]);

  const baixar = async (formato: 'csv' | 'pdf') => {
    setErro(null);
    try {
      await baixarCsv(`/relatorios/${nome}/${formato}?${parametros()}`, `${nome}-${hoje()}.${formato}`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao exportar');
    }
  };

  return (
    <div className="space-y-5">
      <Card titulo="Filtros">
        <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field label="Relatorio">
            <Select value={nome} onChange={(e) => setNome(e.target.value)}>
              {opcoes.map((o) => (
                <option key={o.nome} value={o.nome}>{o.titulo}</option>
              ))}
            </Select>
          </Field>
          <Field label="De">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Ate">
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button variante="neutro" onClick={() => void baixar('csv')}>CSV</Button>
            <Button variante="neutro" onClick={() => void baixar('pdf')}>PDF</Button>
          </div>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      <Card
        titulo={relatorio?.titulo ?? 'Relatorio'}
        descricao={
          relatorio
            ? `${new Date(relatorio.periodo.desde).toLocaleDateString('pt-BR')} a ${new Date(relatorio.periodo.ate).toLocaleDateString('pt-BR')} · ${relatorio.linhas.length} linha(s)`
            : undefined
        }
      >
        {carregando ? (
          <p className="text-sm text-slate-500">Gerando...</p>
        ) : !relatorio || relatorio.linhas.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum dado no periodo selecionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  {relatorio.colunas.map((c) => (
                    <th key={c.chave} className="pb-2 pr-4 font-medium">{c.rotulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relatorio.linhas.map((linha, i) => (
                  <tr key={i}>
                    {relatorio.colunas.map((c) => (
                      <td key={c.chave} className="py-2.5 pr-4 tabular-nums text-slate-700">
                        {linha[c.chave] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {relatorio.totais && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
                    {relatorio.colunas.map((c) => (
                      <td key={c.chave} className="py-2.5 pr-4 tabular-nums">
                        {relatorio.totais![c.chave] ?? ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
