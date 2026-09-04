import { useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { CampoCustomizadoDef, EntidadeCampoCustomizado, TipoCampoCustomizado } from '../../lib/types';

const ENTIDADES: Array<{ valor: EntidadeCampoCustomizado; label: string }> = [
  { valor: 'CONTA', label: 'Contas' },
  { valor: 'LEAD', label: 'Leads' },
  { valor: 'OPORTUNIDADE', label: 'Oportunidades' },
];

const TIPOS: Array<{ valor: TipoCampoCustomizado; label: string }> = [
  { valor: 'TEXTO', label: 'Texto' },
  { valor: 'NUMERO', label: 'Numero' },
  { valor: 'DATA', label: 'Data' },
  { valor: 'BOOLEANO', label: 'Sim/Nao' },
  { valor: 'SELECAO', label: 'Selecao (lista de opcoes)' },
];

const FORM_VAZIO = {
  nome: '',
  tipo: 'TEXTO' as TipoCampoCustomizado,
  opcoes: '',
  obrigatorio: false,
  valorUnico: false,
  secao: '',
};

export function CamposCustomizadosTab() {
  const [entidade, setEntidade] = useState<EntidadeCampoCustomizado>('CONTA');
  const [campos, setCampos] = useState<CampoCustomizadoDef[]>([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = async (ent: EntidadeCampoCustomizado) => {
    const { campos: lista } = await api.get<{ campos: CampoCustomizadoDef[] }>(`/campos-customizados?entidade=${ent}`);
    setCampos(lista);
  };

  useEffect(() => {
    void carregar(entidade).catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar campos'));
  }, [entidade]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post('/campos-customizados', {
        entidade,
        nome: form.nome,
        tipo: form.tipo,
        obrigatorio: form.obrigatorio,
        valorUnico: form.valorUnico,
        ...(form.secao.trim() ? { secao: form.secao.trim() } : {}),
        ...(form.tipo === 'SELECAO'
          ? { opcoes: form.opcoes.split(',').map((o) => o.trim()).filter(Boolean) }
          : {}),
      });
      setForm(FORM_VAZIO);
      await carregar(entidade);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar campo');
    } finally {
      setEnviando(false);
    }
  };

  const alternarAtivo = async (campo: CampoCustomizadoDef) => {
    setErro(null);
    try {
      await api.patch(`/campos-customizados/${campo.id}`, { ativo: !campo.ativo });
      await carregar(entidade);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao atualizar campo');
    }
  };

  const remover = async (campo: CampoCustomizadoDef) => {
    if (!window.confirm(`Remover o campo "${campo.nome}"? Os valores ja gravados nele se perdem junto.`)) return;
    setErro(null);
    try {
      await api.del(`/campos-customizados/${campo.id}`);
      await carregar(entidade);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao remover campo');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card
        titulo="Campos customizados"
        descricao="So classificacao extra por entidade — nao afeta relatorio nem visibilidade"
      >
        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {ENTIDADES.map((e) => (
            <button
              key={e.valor}
              type="button"
              onClick={() => setEntidade(e.valor)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
                entidade === e.valor
                  ? 'border-[var(--brand-primary)] font-medium text-[var(--brand-primary)]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        {erro && <div className="mb-4"><Alerta>{erro}</Alerta></div>}

        {campos.length === 0 ? (
          <EmptyState
            titulo="Nenhum campo customizado"
            descricao="Crie o primeiro campo desta entidade no formulario ao lado."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {campos.map((campo) => (
              <li key={campo.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">
                    {campo.nome}
                    {campo.secao && <span className="ml-2 text-xs text-slate-400">{campo.secao}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tom="neutro">{TIPOS.find((t) => t.valor === campo.tipo)?.label ?? campo.tipo}</Badge>
                    {campo.obrigatorio && <Badge tom="alerta">Obrigatorio</Badge>}
                    {campo.valorUnico && <Badge tom="marca">Valor unico</Badge>}
                    {campo.tipo === 'SELECAO' && campo.opcoes.length > 0 && (
                      <span className="text-xs text-slate-400">{campo.opcoes.join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {campo.ativo ? <Badge tom="sucesso">Ativo</Badge> : <Badge>Inativo</Badge>}
                  <Button variante="neutro" onClick={() => void alternarAtivo(campo)}>
                    {campo.ativo ? 'Desativar' : 'Reativar'}
                  </Button>
                  <Button variante="perigo" onClick={() => void remover(campo)}>
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titulo={`Novo campo em ${ENTIDADES.find((e) => e.valor === entidade)?.label}`}>
        <form onSubmit={criar} className="space-y-4">
          <Field label="Nome">
            <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <Select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoCampoCustomizado })}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.label}</option>
              ))}
            </Select>
          </Field>
          {form.tipo === 'SELECAO' && (
            <Field label="Opcoes" hint="Separadas por virgula, ao menos 2">
              <Input
                required
                placeholder="Pequeno, Medio, Grande"
                value={form.opcoes}
                onChange={(e) => setForm({ ...form, opcoes: e.target.value })}
              />
            </Field>
          )}
          <Field label="Secao" hint="Agrupamento livre na tela, opcional">
            <Input value={form.secao} onChange={(e) => setForm({ ...form, secao: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.obrigatorio}
              onChange={(e) => setForm({ ...form, obrigatorio: e.target.checked })}
            />
            Obrigatorio ao criar um registro novo
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.valorUnico}
              onChange={(e) => setForm({ ...form, valorUnico: e.target.checked })}
            />
            Valor unico (nao aceita repetir entre registros)
          </label>
          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Salvando...' : 'Criar campo'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
