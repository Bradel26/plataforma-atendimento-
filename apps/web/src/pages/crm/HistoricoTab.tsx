import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Field, Input } from '../../components/ui';
import { api } from '../../lib/api';
import type { Contato } from '../../lib/types';
import { LinhaDoTempo } from './ficha/LinhaDoTempo';

/**
 * Historico do parceiro (antiga "Conta" na conversa com a operacao): a linha do
 * tempo completa — WhatsApp, ligacoes, atividades, pesquisas, protocolos e as
 * etapas da esteira — de um parceiro por vez. E a mesma linha do tempo da
 * ficha; aqui ela e o assunto da tela, e nao um bloco no fim da ficha.
 */
export function HistoricoTab() {
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Contato[]>([]);
  const [escolhido, setEscolhido] = useState<Contato | null>(null);

  useEffect(() => {
    const termo = busca.trim();
    const t = setTimeout(() => {
      void api
        .get<{ contatos: Contato[] }>(`/contatos?limite=15${termo ? `&busca=${encodeURIComponent(termo)}` : ''}`)
        .then((r) => setAchados(r.contatos))
        .catch(() => setAchados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Card titulo="Parceiro" descricao="Escolha de quem ver o histórico">
        <Field label="Buscar">
          <Input placeholder="Nome, e-mail ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </Field>
        <ul className="mt-2 max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
          {achados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setEscolhido(c)}
                className={`w-full px-1 py-2 text-left hover:bg-slate-50 ${escolhido?.id === c.id ? 'bg-slate-50' : ''}`}
              >
                <span className="block truncate text-sm font-medium text-slate-800">{c.nome}</span>
                <span className="block truncate text-xs text-slate-500">
                  {[c.conta?.nome, c.telefone, c.uf].filter(Boolean).join(' · ') || '—'}
                </span>
              </button>
            </li>
          ))}
          {achados.length === 0 && <li className="py-2 text-sm text-slate-500">Nenhum contato encontrado.</li>}
        </ul>
      </Card>

      {escolhido ? (
        <Card
          titulo={`Histórico de ${escolhido.nome}`}
          descricao="WhatsApp, ligações, atividades, pesquisas, protocolos e etapas da esteira"
          acao={
            <Link to={`/contatos/${escolhido.id}`} className="text-sm text-[var(--brand-primary)] hover:underline">
              Abrir perfil
            </Link>
          }
        >
          <LinhaDoTempo base={`/ficha/contato/${escolhido.id}`} raizId={escolhido.id} />
        </Card>
      ) : (
        <Card titulo="Histórico do parceiro">
          <p className="text-sm text-slate-500">Selecione um parceiro para ver a linha do tempo completa.</p>
        </Card>
      )}
    </div>
  );
}
