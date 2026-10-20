import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button, Input, Select } from '../components/ui';
import { ApiError, api, baixarCsv } from '../lib/api';
import type { Relatorio } from '../lib/types';

type Opcao = { nome: string; titulo: string };

const dataIso = (d: Date) => d.toISOString().slice(0, 10);
const hoje = () => dataIso(new Date());
const diasAtras = (n: number) => dataIso(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
const trintaDiasAtras = () => diasAtras(30);
const inicioDoMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/** Atalhos de periodo: preenchem o De/Ate, que continuam editaveis. */
const ATALHOS = [
  { id: '7', rotulo: '7 dias', desde: () => diasAtras(7) },
  { id: '30', rotulo: '30 dias', desde: () => diasAtras(30) },
  { id: '90', rotulo: '90 dias', desde: () => diasAtras(90) },
  { id: 'mes', rotulo: 'Este mês', desde: inicioDoMes },
] as const;

function IconeDocumento() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function IconeBaixar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

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
      setErro(e instanceof ApiError ? e.message : 'Falha ao gerar o relatório');
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

  const atalhoAtivo = ate === hoje() ? ATALHOS.find((a) => a.desde() === desde)?.id : undefined;
  const tituloAtual = relatorio?.titulo ?? opcoes.find((o) => o.nome === nome)?.titulo ?? 'Relatório';

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col gap-2">
        <p className="px-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-slate-500">Relatórios disponíveis</p>
        {/* No celular a lista vira um select: cinco cartoes empilhados empurrariam a tabela para longe. */}
        <div className="xl:hidden">
          <Select aria-label="Relatório" value={nome} onChange={(e) => setNome(e.target.value)}>
            {opcoes.map((o) => (
              <option key={o.nome} value={o.nome}>{o.titulo}</option>
            ))}
          </Select>
        </div>
        <ul className="hidden flex-col gap-1.5 xl:flex">
          {opcoes.map((o) => {
            const ativo = o.nome === nome;
            return (
              <li key={o.nome}>
                <button
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setNome(o.nome)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[13.5px] transition ${
                    ativo
                      ? 'border-[var(--brand-primary)] bg-white font-bold text-slate-900 shadow-sm'
                      : 'border-transparent font-medium text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] ${
                      ativo ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    <IconeDocumento />
                  </span>
                  {o.titulo}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold tracking-[-0.01em] text-slate-900">{tituloAtual}</h3>
            <p className="mt-1 text-[13px] text-slate-600">
              {relatorio
                ? `${new Date(relatorio.periodo.desde).toLocaleDateString('pt-BR')} a ${new Date(relatorio.periodo.ate).toLocaleDateString('pt-BR')} · ${relatorio.linhas.length} linha(s)`
                : carregando
                  ? 'Gerando...'
                  : 'Escolha o relatório e o período'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variante="neutro" onClick={() => void baixar('csv')}><IconeBaixar />CSV</Button>
            <Button variante="neutro" onClick={() => void baixar('pdf')}><IconeBaixar />PDF</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
          <div role="group" aria-label="Período rápido" className="sem-barra-de-rolagem flex max-w-full gap-1 overflow-x-auto rounded-[10px] bg-slate-100 p-1">
            {ATALHOS.map((a) => {
              const ativo = atalhoAtivo === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => {
                    setDesde(a.desde());
                    setAte(hoje());
                  }}
                  className={`h-[30px] shrink-0 whitespace-nowrap rounded-[7px] px-3 text-[12.5px] transition ${
                    ativo ? 'bg-white font-bold text-slate-900 shadow-sm' : 'font-medium text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {a.rotulo}
                </button>
              );
            })}
          </div>
          <span className="text-[13px] text-slate-500">ou</span>
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="De" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-[150px]" />
            <span className="text-slate-500" aria-hidden="true">–</span>
            <Input type="date" aria-label="Até" value={ate} onChange={(e) => setAte(e.target.value)} className="w-[150px]" />
          </div>
        </div>

        {erro && <Alerta>{erro}</Alerta>}

        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {carregando ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Gerando...</p>
          ) : !relatorio || relatorio.linhas.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Nenhum dado no período selecionado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11.5px] text-slate-500">
                  <tr>
                    {relatorio.colunas.map((c) => (
                      <th key={c.chave} className="whitespace-nowrap px-4 py-2.5 font-semibold">{c.rotulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {relatorio.linhas.map((linha, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {relatorio.colunas.map((c, j) => (
                        <td key={c.chave} className={`px-4 py-2.5 tabular-nums ${j === 0 ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                          {linha[c.chave] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {relatorio.totais && (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-bold text-slate-900">
                      {relatorio.colunas.map((c) => (
                        <td key={c.chave} className="px-4 py-2.5 tabular-nums">
                          {relatorio.totais![c.chave] ?? ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
