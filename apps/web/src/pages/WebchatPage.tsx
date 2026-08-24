import { useEffect, useRef, useState } from 'react';
import { conectar, EVENTOS } from '../lib/realtime';
import type { ConversaDetalhe, Mensagem } from '../lib/types';

const CAMPO =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]';

/**
 * Widget de Webchat (canal da Fase 1). Roda sem autenticacao da plataforma:
 * o visitante recebe um token de sessao ao abrir o atendimento.
 * Rota publica /webchat — a versao embutivel em site de cliente vem depois.
 */
export function WebchatPage() {
  const [sessao, setSessao] = useState<string | null>(null);
  const [conversa, setConversa] = useState<ConversaDetalhe | null>(null);
  const [form, setForm] = useState({ nome: '', email: '', assunto: '' });
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [conversa?.mensagens.length]);

  // Recebe em tempo real as respostas do agente.
  useEffect(() => {
    if (!sessao) return;
    const socket = conectar({ sessao });

    const aoReceber = ({ conversaId, mensagem }: { conversaId: string; mensagem: Mensagem }) => {
      setConversa((atual) => {
        if (!atual || atual.id !== conversaId) return atual;
        if (atual.mensagens.some((m) => m.id === mensagem.id)) return atual;
        return { ...atual, mensagens: [...atual.mensagens, mensagem] };
      });
    };
    const aoAtualizar = (detalhe: ConversaDetalhe) =>
      setConversa((atual) =>
        atual && atual.id === detalhe.id ? { ...atual, status: detalhe.status, agente: detalhe.agente } : atual,
      );

    socket.on(EVENTOS.mensagemNova, aoReceber);
    socket.on(EVENTOS.conversaAtualizada, aoAtualizar);
    return () => {
      socket.off(EVENTOS.mensagemNova, aoReceber);
      socket.off(EVENTOS.conversaAtualizada, aoAtualizar);
      socket.disconnect();
    };
  }, [sessao]);

  const chamar = async <T,>(caminho: string, corpo?: unknown, token?: string): Promise<T> => {
    const res = await fetch(`/api/webchat${caminho}`, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: {
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(dados?.error?.message ?? 'Falha na requisicao');
    return dados as T;
  };

  const iniciar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resp = await chamar<{ sessaoToken: string; conversa: ConversaDetalhe }>('/sessoes', {
        nome: form.nome,
        ...(form.email ? { email: form.email } : {}),
        ...(form.assunto ? { assunto: form.assunto } : {}),
      });
      setSessao(resp.sessaoToken);
      setConversa(resp.conversa);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao iniciar');
    } finally {
      setEnviando(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || !sessao) return;
    setEnviando(true);
    try {
      const { mensagem } = await chamar<{ mensagem: Mensagem }>('/mensagens', { conteudo }, sessao);
      setTexto('');
      setConversa((atual) =>
        atual && !atual.mensagens.some((m) => m.id === mensagem.id)
          ? { ...atual, mensagens: [...atual.mensagens, mensagem] }
          : atual,
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao enviar');
    } finally {
      setEnviando(false);
    }
  };

  const legenda = !conversa
    ? 'Atendimento por Webchat'
    : conversa.status === 'EM_ESPERA'
      ? 'Aguardando um atendente...'
      : conversa.status === 'FINALIZADO'
        ? 'Atendimento finalizado'
        : `Em atendimento${conversa.agente ? ` com ${conversa.agente.nome}` : ''}`;

  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-4">
      <div className="flex h-[600px] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="px-5 py-4 text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
          <p className="font-semibold">Fale com a gente</p>
          <p className="text-xs text-white/80">{legenda}</p>
        </header>

        {!conversa ? (
          <form onSubmit={iniciar} className="flex flex-1 flex-col gap-3 p-5">
            {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
            <p className="text-sm text-slate-600">Preencha para iniciar o atendimento.</p>
            <input
              required
              minLength={2}
              placeholder="Seu nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className={CAMPO}
            />
            <input
              type="email"
              placeholder="Seu e-mail (opcional)"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={CAMPO}
            />
            <input
              placeholder="Assunto (opcional)"
              value={form.assunto}
              onChange={(e) => setForm({ ...form, assunto: e.target.value })}
              className={CAMPO}
            />
            <button
              type="submit"
              disabled={enviando}
              className="mt-auto rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {enviando ? 'Abrindo...' : 'Iniciar atendimento'}
            </button>
          </form>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
              {conversa.mensagens.map((m) =>
                m.autor === 'SISTEMA' ? (
                  <p key={m.id} className="text-center text-xs text-slate-400">
                    {m.conteudo}
                  </p>
                ) : (
                  <div key={m.id} className={`flex ${m.autor === 'CLIENTE' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                        m.autor === 'CLIENTE' ? 'text-white' : 'border border-slate-200 bg-white text-slate-800'
                      }`}
                      style={m.autor === 'CLIENTE' ? { backgroundColor: 'var(--brand-primary)' } : undefined}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                    </div>
                  </div>
                ),
              )}
              <div ref={fim} />
            </div>

            <form onSubmit={enviar} className="flex gap-2 border-t border-slate-200 p-3">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={conversa.status === 'FINALIZADO' ? 'Atendimento encerrado' : 'Escreva sua mensagem'}
                disabled={conversa.status === 'FINALIZADO'}
                className={`flex-1 ${CAMPO} disabled:bg-slate-50`}
              />
              <button
                type="submit"
                disabled={enviando || !texto.trim() || conversa.status === 'FINALIZADO'}
                className="rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Enviar
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
