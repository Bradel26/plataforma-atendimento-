import { useState } from 'react';
import { Alerta, Badge, Button, EmptyState, Field, Input, Select } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import type { ComponenteGarantia, ProdutoInstalado, StatusGarantia, TipoGarantia } from '../../../lib/types';

/**
 * Base instalada (item 5.1): o equipamento entregue ao cliente e, para cada
 * um, as garantias por componente — legal, contratual e compressor vencem em
 * datas diferentes na regra Philco, e a contratual so vale com instalador
 * credenciado e nota fiscal.
 */

const LABEL_TIPO_GARANTIA: Record<TipoGarantia, string> = {
  LEGAL: 'Legal',
  CONTRATUAL: 'Contratual',
  COMPRESSOR: 'Compressor',
  OUTRA: 'Outra',
};

const TIPOS_GARANTIA: TipoGarantia[] = ['LEGAL', 'CONTRATUAL', 'COMPRESSOR', 'OUTRA'];

const LABEL_STATUS_GARANTIA: Record<StatusGarantia, string> = {
  VIGENTE: 'Vigente',
  VENCIDA: 'Vencida',
  SEM_DATA_INICIO: 'Sem data de inicio',
  REQUISITO_NAO_INFORMADO: 'Instalador nao informado',
  NAO_APLICAVEL: 'Nao aplicavel',
};

const TOM_STATUS_GARANTIA: Record<StatusGarantia, 'neutro' | 'sucesso' | 'alerta' | 'marca'> = {
  VIGENTE: 'sucesso',
  VENCIDA: 'alerta',
  SEM_DATA_INICIO: 'neutro',
  REQUISITO_NAO_INFORMADO: 'marca',
  NAO_APLICAVEL: 'neutro',
};

const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

type NovoComponente = { tipo: TipoGarantia; nome: string; prazoDias: string };

const COMPONENTE_VAZIO: NovoComponente = { tipo: 'LEGAL', nome: '', prazoDias: '' };

type NovoProduto = {
  modelo: string;
  numeroSerie: string;
  dataInstalacao: string;
  instaladorNome: string;
  instaladorCredenciado: '' | 'sim' | 'nao';
  notaFiscalNumero: string;
};

const PRODUTO_VAZIO: NovoProduto = {
  modelo: '',
  numeroSerie: '',
  dataInstalacao: '',
  instaladorNome: '',
  instaladorCredenciado: '',
  notaFiscalNumero: '',
};

type Props = {
  contaId: string;
  produtos: ProdutoInstalado[];
  aoMudar: () => void;
};

export function BaseInstalada({ contaId, produtos, aoMudar }: Props) {
  const [form, setForm] = useState(PRODUTO_VAZIO);
  const [componentes, setComponentes] = useState<NovoComponente[]>([{ ...COMPONENTE_VAZIO }]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(false);

  const adicionarLinhaComponente = () => setComponentes((c) => [...c, { ...COMPONENTE_VAZIO }]);
  const removerLinhaComponente = (i: number) => setComponentes((c) => c.filter((_, idx) => idx !== i));
  const mudarComponente = (i: number, dados: Partial<NovoComponente>) =>
    setComponentes((c) => c.map((item, idx) => (idx === i ? { ...item, ...dados } : item)));

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const validos = componentes.filter((c) => c.prazoDias.trim());
      await api.post(`/produtos-instalados`, {
        contaId,
        modelo: form.modelo,
        numeroSerie: form.numeroSerie.trim() || null,
        dataInstalacao: form.dataInstalacao ? new Date(form.dataInstalacao).toISOString() : null,
        instaladorNome: form.instaladorNome.trim() || null,
        instaladorCredenciado:
          form.instaladorCredenciado === '' ? null : form.instaladorCredenciado === 'sim',
        notaFiscalNumero: form.notaFiscalNumero.trim() || null,
        componentes: validos.map((c) => ({
          tipo: c.tipo,
          nome: c.tipo === 'OUTRA' ? c.nome.trim() : undefined,
          prazoDias: Number(c.prazoDias),
        })),
      });
      setForm(PRODUTO_VAZIO);
      setComponentes([{ ...COMPONENTE_VAZIO }]);
      setExpandido(false);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao cadastrar o equipamento');
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (produtoId: string) => {
    if (!window.confirm('Remover este equipamento e as garantias dele?')) return;
    setErro(null);
    try {
      await api.del(`/produtos-instalados/${produtoId}`);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao remover');
    }
  };

  return (
    <div className="space-y-4">
      {erro && <Alerta>{erro}</Alerta>}

      {produtos.length === 0 ? (
        <EmptyState
          titulo="Nenhum equipamento cadastrado"
          descricao="Registre o que foi entregue e instalado para acompanhar a garantia de cada componente."
        />
      ) : (
        <ul className="space-y-3">
          {produtos.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{p.modelo}</p>
                  <p className="text-xs text-slate-500">
                    N/S {p.numeroSerie ?? '—'} · Instalado em {dataBr(p.dataInstalacao)}
                    {p.instaladorNome ? ` · ${p.instaladorNome}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">
                    Instalador credenciado:{' '}
                    {p.instaladorCredenciado === null ? 'nao informado' : p.instaladorCredenciado ? 'sim' : 'nao'}
                    {' · '}
                    NF: {p.notaFiscalNumero ?? '—'}
                  </p>
                </div>
                <Button variante="perigo" onClick={() => void remover(p.id)}>
                  Remover
                </Button>
              </div>

              {p.componentes.length > 0 && (
                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-2">
                  {p.componentes.map((c) => (
                    <ComponenteLinha key={c.id} componente={c} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        aria-expanded={expandido}
        className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
      >
        {expandido ? 'Cancelar' : '+ Registrar equipamento'}
      </button>

      {expandido && (
        <form className="space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={criar}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Modelo">
              <Input
                required
                value={form.modelo}
                onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                placeholder="Ex.: Split Hi-Wall 12000 BTU Philco"
              />
            </Field>
            <Field label="Numero de serie">
              <Input value={form.numeroSerie} onChange={(e) => setForm({ ...form, numeroSerie: e.target.value })} />
            </Field>
            <Field label="Data de instalacao" hint="Vazio: garantia fica sem data ate ser preenchida.">
              <Input
                type="date"
                value={form.dataInstalacao}
                onChange={(e) => setForm({ ...form, dataInstalacao: e.target.value })}
              />
            </Field>
            <Field label="Instalador">
              <Input
                value={form.instaladorNome}
                onChange={(e) => setForm({ ...form, instaladorNome: e.target.value })}
              />
            </Field>
            <Field label="Instalador credenciado" hint="A garantia contratual so vale com instalador credenciado.">
              <Select
                value={form.instaladorCredenciado}
                onChange={(e) => setForm({ ...form, instaladorCredenciado: e.target.value as NovoProduto['instaladorCredenciado'] })}
              >
                <option value="">Nao informado</option>
                <option value="sim">Sim</option>
                <option value="nao">Nao</option>
              </Select>
            </Field>
            <Field label="Nota fiscal">
              <Input
                value={form.notaFiscalNumero}
                onChange={(e) => setForm({ ...form, notaFiscalNumero: e.target.value })}
              />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">Garantias</p>
            <div className="space-y-2">
              {componentes.map((c, i) => (
                <div key={i} className="grid grid-cols-[140px_1fr_100px_auto] items-end gap-2">
                  <Select
                    aria-label={`Tipo da garantia ${i + 1}`}
                    value={c.tipo}
                    onChange={(e) => mudarComponente(i, { tipo: e.target.value as TipoGarantia })}
                  >
                    {TIPOS_GARANTIA.map((t) => (
                      <option key={t} value={t}>
                        {LABEL_TIPO_GARANTIA[t]}
                      </option>
                    ))}
                  </Select>
                  {c.tipo === 'OUTRA' ? (
                    <Input
                      placeholder="Nome da garantia"
                      value={c.nome}
                      onChange={(e) => mudarComponente(i, { nome: e.target.value })}
                    />
                  ) : (
                    <span />
                  )}
                  <Input
                    type="number"
                    min={1}
                    placeholder="Dias"
                    value={c.prazoDias}
                    onChange={(e) => mudarComponente(i, { prazoDias: e.target.value })}
                  />
                  <Button type="button" variante="neutro" onClick={() => removerLinhaComponente(i)}>
                    &times;
                  </Button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={adicionarLinhaComponente}
              className="mt-2 text-xs font-medium text-[var(--brand-primary)] hover:underline"
            >
              + Garantia
            </button>
          </div>

          <Button type="submit" disabled={salvando || form.modelo.trim().length < 2}>
            {salvando ? 'Salvando...' : 'Cadastrar equipamento'}
          </Button>
        </form>
      )}
    </div>
  );
}

function ComponenteLinha({ componente }: { componente: ComponenteGarantia }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs text-slate-700">
          {componente.tipo === 'OUTRA' ? componente.nome ?? 'Outra' : LABEL_TIPO_GARANTIA[componente.tipo]}
        </p>
        <p className="text-xs text-slate-400">
          {componente.prazoDias} dia(s){componente.vencimento ? ` · vence em ${dataBr(componente.vencimento)}` : ''}
        </p>
      </div>
      <Badge tom={TOM_STATUS_GARANTIA[componente.status]}>{LABEL_STATUS_GARANTIA[componente.status]}</Badge>
    </li>
  );
}
