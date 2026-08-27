import { useEffect, useState } from 'react';
import { Alerta, Card, EmptyState, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { Contato } from '../../lib/types';
import { FichaContato, FichaVazia } from './ficha/FichaContato';

/**
 * Aba de contatos: lista a esquerda, a vida do cliente a direita.
 *
 * A lista carrega so o resumo e o painel busca a ficha ao abrir. Trazer tudo de
 * uma vez seria oito consultas por contato listado para mostrar uma.
 */
export function ContatosTab() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<string | null>(null);
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

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Card titulo="Contatos" descricao={`${contatos.length} encontrado(s)`}>
        <Input
          placeholder="Buscar por nome, e-mail ou telefone"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {erro && (
          <div className="mt-3">
            <Alerta>{erro}</Alerta>
          </div>
        )}
        <div className="mt-3 max-h-[70vh] overflow-y-auto">
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
                    onClick={() => setSelecionado(c.id)}
                    className={`w-full px-1 py-2.5 text-left transition hover:bg-slate-50 ${
                      selecionado === c.id ? 'bg-slate-50' : ''
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

      {/* `key` no id: trocar de contato remonta a ficha e zera o cursor da linha
          do tempo. Sem isso, a primeira pagina do contato novo viria depois dos
          eventos do anterior. */}
      {selecionado ? <FichaContato key={selecionado} contatoId={selecionado} /> : <FichaVazia />}
    </div>
  );
}
