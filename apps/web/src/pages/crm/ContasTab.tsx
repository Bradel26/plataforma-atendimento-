import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  LABEL_FASE_LEAD,
  moeda,
  type Conta,
  type IndicadoresFicha,
  type Lead,
  type Oportunidade,
} from '../../lib/types';
import { Indicadores } from './ficha/Indicadores';
import { LinhaDoTempo } from './ficha/LinhaDoTempo';
import { RegistrarAtividade } from './ficha/RegistrarAtividade';

type Ficha = { conta: Conta; leads: Lead[]; oportunidades: Oportunidade[] };

const mascararCnpj = (cnpj: string | null) =>
  cnpj && cnpj.length === 14
    ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : (cnpj ?? '—');

export function ContasTab() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [busca, setBusca] = useState('');
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState({ nome: '', cnpj: '', segmento: '' });
  const [indicadores, setIndicadores] = useState<IndicadoresFicha | null>(null);
  /** Sinal para a linha do tempo rebuscar depois de um registro novo. */
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    const qs = busca.trim() ? `?busca=${encodeURIComponent(busca.trim())}` : '';
    try {
      const { contas: lista } = await api.get<{ contas: Conta[] }>(`/contas${qs}`);
      setContas(lista);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar contas');
    }
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const abrir = useCallback(async (id: string) => {
    try {
      // Duas chamadas em paralelo: `/contas/:id` traz contatos, leads e
      // oportunidades; `/ficha/conta/:id` traz os contadores, que somam coisas
      // que aquela rota nao conta.
      const [detalhe, resumo] = await Promise.all([
        api.get<Ficha>(`/contas/${id}`),
        api.get<{ indicadores: IndicadoresFicha }>(`/ficha/conta/${id}`),
      ]);
      setFicha(detalhe);
      setIndicadores(resumo.indicadores);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir a conta');
    }
  }, []);

  const atualizarFicha = () => {
    if (ficha) void abrir(ficha.conta.id);
    setVersao((v) => v + 1);
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/contas', {
        nome: nova.nome,
        ...(nova.cnpj.trim() ? { cnpj: nova.cnpj } : {}),
        ...(nova.segmento.trim() ? { segmento: nova.segmento } : {}),
      });
      setNova({ nome: '', cnpj: '', segmento: '' });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar conta');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className="space-y-5">
        <Card titulo="Contas" descricao={`${contas.length} encontrada(s)`}>
          <Input
            placeholder="Buscar por nome, CNPJ ou segmento"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {erro && <div className="mt-3"><Alerta>{erro}</Alerta></div>}
          <div className="mt-3 max-h-[45vh] overflow-y-auto">
            {contas.length === 0 ? (
              <EmptyState titulo="Nenhuma conta" descricao="Cadastre a primeira empresa no formulario abaixo." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {contas.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void abrir(c.id)}
                      className={`w-full py-2.5 text-left transition hover:bg-slate-50 ${
                        ficha?.conta.id === c.id ? 'bg-slate-50' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-800">{c.nome}</p>
                      <p className="text-xs text-slate-500">{mascararCnpj(c.cnpj)}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {c.totalContatos ?? 0} contato(s) · {c.totalLeads ?? 0} lead(s) ·{' '}
                        {c.totalOportunidades ?? 0} oportunidade(s)
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card titulo="Nova conta">
          <form onSubmit={criar} className="space-y-3">
            <Field label="Nome">
              <Input required value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
            </Field>
            <Field label="CNPJ" hint="Com ou sem mascara">
              <Input value={nova.cnpj} onChange={(e) => setNova({ ...nova, cnpj: e.target.value })} />
            </Field>
            <Field label="Segmento">
              <Input value={nova.segmento} onChange={(e) => setNova({ ...nova, segmento: e.target.value })} />
            </Field>
            <Button type="submit" className="w-full">Criar conta</Button>
          </form>
        </Card>
      </div>

      {ficha ? (
        <div className="space-y-5">
          <Card titulo={ficha.conta.nome} descricao={mascararCnpj(ficha.conta.cnpj)}>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Segmento</dt>
                <dd className="text-slate-800">{ficha.conta.segmento ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Site</dt>
                <dd className="truncate text-slate-800">{ficha.conta.site ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Telefone</dt>
                <dd className="text-slate-800">{ficha.conta.telefone ?? '—'}</dd>
              </div>
            </dl>

            {/* Conversa e ligacao pertencem a pessoa, nao a empresa: por isso a
                ficha da conta mostra quatro cartoes, e nao seis. */}
            {indicadores && (
              <div className="mt-4">
                <Indicadores dados={indicadores} escopo="CONTA" />
              </div>
            )}
          </Card>

          <Card titulo="Contatos vinculados" descricao={`${ficha.conta.contatos?.length ?? 0} contato(s)`}>
            {!ficha.conta.contatos || ficha.conta.contatos.length === 0 ? (
              <EmptyState
                titulo="Sem contatos"
                descricao="Abra o contato na aba Contatos e use Vincular empresa."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {ficha.conta.contatos.map((c) => (
                  <li key={c.id} className="py-2">
                    <p className="text-sm text-slate-800">{c.nome}</p>
                    <p className="text-xs text-slate-500">{c.email ?? c.telefone ?? 'Sem contato'}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Leads" descricao={`${ficha.leads.length} registro(s)`}>
            {ficha.leads.length === 0 ? (
              <EmptyState titulo="Sem leads" descricao="Nenhum lead vinculado a esta conta." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {ficha.leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">{l.contato.nome}</p>
                      <p className="text-xs text-slate-500">{moeda(l.valorEstimado)}</p>
                    </div>
                    <Badge tom={l.fase === 'GANHO' ? 'sucesso' : l.fase === 'PERDIDO' ? 'neutro' : 'marca'}>
                      {LABEL_FASE_LEAD[l.fase]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Oportunidades" descricao={`${ficha.oportunidades.length} registro(s)`}>
            {ficha.oportunidades.length === 0 ? (
              <EmptyState titulo="Sem oportunidades" descricao="Abra uma oportunidade na aba Oportunidades." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {ficha.oportunidades.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">{o.titulo}</p>
                      <p className="text-xs text-slate-500">
                        {o.estagio.nome} · {moeda(o.valor)}
                      </p>
                    </div>
                    <Badge tom={o.status === 'GANHA' ? 'sucesso' : o.status === 'PERDIDA' ? 'neutro' : 'marca'}>
                      {o.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Registrar" descricao="Fica na linha do tempo na hora">
            <RegistrarAtividade contaId={ficha.conta.id} aoRegistrar={atualizarFicha} />
          </Card>

          <Card titulo="Linha do tempo" descricao="Tudo que aconteceu com esta empresa">
            {/* `raizId` na conta: trocar de empresa zera a lista e o cursor. */}
            <LinhaDoTempo
              base={`/ficha/conta/${ficha.conta.id}`}
              raizId={ficha.conta.id}
              recarregar={versao}
            />
          </Card>
        </div>
      ) : (
        <Card titulo="Ficha da conta">
          <EmptyState
            titulo="Selecione uma conta"
            descricao="Contatos, leads, oportunidades e a linha do tempo da empresa aparecem aqui."
          />
        </Card>
      )}
    </div>
  );
}
