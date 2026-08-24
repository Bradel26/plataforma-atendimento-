import { useEffect, useState } from 'react';
import { Alerta, Badge, Card, EmptyState, Input } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { LABEL_CONVERSA_STATUS, type Contato, type ConversaResumo } from '../lib/types';

/** CRM basico da Fase 1: contatos e o historico de conversas de cada um. */
export function CrmPage() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<{ contato: Contato; conversas: ConversaResumo[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = busca.trim() ? `?busca=${encodeURIComponent(busca.trim())}` : '';
      void api
        .get<{ contatos: Contato[] }>(`/contatos${qs}`)
        .then(({ contatos: lista }) => setContatos(lista))
        .catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar contatos'));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  const abrir = async (id: string) => {
    setErro(null);
    try {
      setSelecionado(await api.get<{ contato: Contato; conversas: ConversaResumo[] }>(`/contatos/${id}`));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir contato');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card titulo="Contatos" descricao={`${contatos.length} encontrado(s)`}>
        <Input
          placeholder="Buscar por nome, e-mail ou telefone"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {erro && <div className="mt-3"><Alerta>{erro}</Alerta></div>}
        <div className="mt-3 max-h-[60vh] overflow-y-auto">
          {contatos.length === 0 ? (
            <EmptyState
              titulo="Nenhum contato"
              descricao="Contatos sao criados automaticamente quando alguem abre um atendimento pelo Webchat."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {contatos.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void abrir(c.id)}
                    className={`w-full px-1 py-2.5 text-left transition hover:bg-slate-50 ${
                      selecionado?.contato.id === c.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-800">{c.nome}</p>
                    <p className="text-xs text-slate-500">{c.email ?? c.telefone ?? 'Sem contato'}</p>
                    {typeof c.totalConversas === 'number' && (
                      <p className="mt-1 text-xs text-slate-400">
                        {c.totalConversas} conversa{c.totalConversas === 1 ? '' : 's'}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {selecionado ? (
        <div className="space-y-5">
          <Card titulo={selecionado.contato.nome} descricao="Ficha do contato">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">E-mail</dt>
                <dd className="text-slate-800">{selecionado.contato.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Telefone</dt>
                <dd className="text-slate-800">{selecionado.contato.telefone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Canal de origem</dt>
                <dd className="text-slate-800">{selecionado.contato.canalOrigem ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Cliente desde</dt>
                <dd className="text-slate-800">
                  {selecionado.contato.criadoEm
                    ? new Date(selecionado.contato.criadoEm).toLocaleDateString('pt-BR')
                    : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card titulo="Historico de conversas" descricao={`${selecionado.conversas.length} registro(s)`}>
            {selecionado.conversas.length === 0 ? (
              <EmptyState titulo="Sem conversas" descricao="Este contato ainda nao teve atendimentos." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {selecionado.conversas.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">
                        {c.ultimaMensagem?.conteudo ?? 'Sem mensagens'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(c.criadoEm).toLocaleString('pt-BR')}
                        {c.agente ? ` · ${c.agente.nome}` : ''}
                        {c.fila ? ` · ${c.fila.nome}` : ''}
                      </p>
                    </div>
                    <Badge tom={c.status === 'FINALIZADO' ? 'neutro' : 'sucesso'}>
                      {LABEL_CONVERSA_STATUS[c.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Card titulo="Ficha do contato">
          <EmptyState titulo="Selecione um contato" descricao="A ficha e o historico de conversas aparecem aqui." />
        </Card>
      )}
    </div>
  );
}
