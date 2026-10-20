import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { api } from '../../lib/api';

type Candidato = { id: string; nome: string; telefone: string | null; email: string | null };
type Evidencia = { id: string; rotulo: string; referencia: string | null };
type Mensagem = { papel: 'usuario' | 'assistente'; texto: string; fonte?: string; candidatos?: Candidato[]; contatoId?: string; evidencias?: Evidencia[]; historicoTemMais?: boolean };
type Resposta = { resposta: string; fonte: string; total: number; valorTotal?: number | null; motor: string; tipo?: string; candidatos?: Candidato[]; contatoId?: string; evidencias?: Evidencia[]; historicoTemMais?: boolean };

const SUGESTOES = [
  'Quantas oportunidades abertas existem?',
  'Quais tarefas estão pendentes?',
  'Quantos contatos foram cadastrados nos últimos 30 dias?',
];

function IconeAssistente({ pequeno = false }: { pequeno?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={pequeno ? 'h-5 w-5' : 'h-6 w-6'}>
      <path d="M12 3.25 13.9 9.1 19.75 11 13.9 12.9 12 18.75 10.1 12.9 4.25 11 10.1 9.1 12 3.25Z" fill="currentColor" />
      <path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z" fill="currentColor" />
    </svg>
  );
}

/** Assistente persistente do shell. A API mantém as permissões atuais do CRM. */
export function AssistenteGlobal() {
  const { usuario, temModulo } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (aberto) {
      requestAnimationFrame(() => {
        fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        campoRef.current?.focus();
      });
    }
  }, [aberto, mensagens, carregando]);

  useEffect(() => {
    if (!aberto) return;
    const fecharComEsc = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', fecharComEsc);
    return () => window.removeEventListener('keydown', fecharComEsc);
  }, [aberto]);

  if (!usuario || !temModulo('crm')) return null;

  async function enviar(texto = pergunta, contatoId?: string) {
    const perguntaLimpa = texto.trim();
    if (carregando || perguntaLimpa.length < 3) return;
    setPergunta('');
    setErro(null);
    setMensagens((atuais) => [...atuais, { papel: 'usuario', texto: perguntaLimpa }]);
    setCarregando(true);
    try {
      const resultado = await api.post<Resposta>('/assistente-crm/perguntar', { pergunta: perguntaLimpa, ...(contatoId ? { contatoId } : {}) });
      const fonte = `Dados do CRM: ${resultado.total} registro(s)${resultado.valorTotal !== undefined ? ` · R$ ${Number(resultado.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}`;
      setMensagens((atuais) => [...atuais, {
        papel: 'assistente',
        texto: resultado.resposta,
        fonte: resultado.tipo === 'resumo_cliente'
          ? `Resumo baseado em ${resultado.total} evento(s) do histórico 360${resultado.historicoTemMais ? ' · existem eventos anteriores' : ''}`
          : fonte,
        ...(resultado.candidatos ? { candidatos: resultado.candidatos } : {}),
        ...(resultado.contatoId ? { contatoId: resultado.contatoId } : {}),
        ...(resultado.evidencias ? { evidencias: resultado.evidencias } : {}),
        ...(resultado.historicoTemMais !== undefined ? { historicoTemMais: resultado.historicoTemMais } : {}),
      }]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui consultar os dados agora.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[80] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {aberto && (
        <section
          aria-label="Assistente da plataforma"
          className="flex h-[min(680px,calc(100dvh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
        >
          <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><IconeAssistente pequeno /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900">Assistente da plataforma</h2>
              <p className="text-xs text-slate-500">Consultas aos dados permitidos do CRM</p>
            </div>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar assistente" className="anel-de-foco flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-4">
            {mensagens.length === 0 ? (
              <div className="pt-3">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><IconeAssistente /></div>
                <h3 className="font-semibold text-slate-900">Como posso ajudar?</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">Pergunte sobre contatos, empresas, oportunidades, tarefas e chamadas. A assistente consulta dados, mas não altera registros.</p>
                <div className="mt-5 space-y-2">
                  {SUGESTOES.map((sugestao) => (
                    <button key={sugestao} type="button" onClick={() => void enviar(sugestao)} disabled={carregando} className="anel-de-foco w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-sm text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50">
                      {sugestao}
                    </button>
                  ))}
                </div>
              </div>
            ) : mensagens.map((mensagem, indice) => (
              <div key={`${mensagem.papel}-${indice}`} className={`flex ${mensagem.papel === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-sm leading-5 ${mensagem.papel === 'usuario' ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800 shadow-sm'}`}>
                  {mensagem.texto}
                  {mensagem.fonte && <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">{mensagem.fonte}</p>}
                  {mensagem.candidatos && (
                    <div className="mt-3 space-y-2">
                      {mensagem.candidatos.map((candidato) => (
                        <button key={candidato.id} type="button" disabled={carregando} onClick={() => {
                          const perguntaAnterior = [...mensagens].reverse().find((item) => item.papel === 'usuario')?.texto ?? `Resuma a vida do cliente ${candidato.nome}`;
                          void enviar(perguntaAnterior, candidato.id);
                        }} className="anel-de-foco block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50">
                          <span className="block font-medium text-slate-800">{candidato.nome}</span>
                          <span className="block text-xs text-slate-500">{candidato.telefone || candidato.email || 'Sem telefone ou e-mail cadastrado'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {mensagem.contatoId && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-2">
                      {mensagem.evidencias?.slice(0, 5).map((evidencia) => (
                        <p key={evidencia.id} className="text-xs text-slate-500">· {evidencia.rotulo}</p>
                      ))}
                      <Link to={`/contatos/${mensagem.contatoId}`} className="inline-flex rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100">Abrir ficha e histórico completo</Link>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {carregando && <p className="text-sm text-slate-500" role="status">Consultando os dados…</p>}
            {erro && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">{erro}</p>}
            <div ref={fimRef} />
          </div>

          <form className="border-t border-slate-100 bg-white p-3" onSubmit={(evento) => { evento.preventDefault(); void enviar(); }}>
            <label htmlFor="pergunta-assistente-global" className="sr-only">Pergunte ao assistente</label>
            <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
              <textarea ref={campoRef} id="pergunta-assistente-global" value={pergunta} onChange={(evento) => setPergunta(evento.target.value)} onKeyDown={(evento) => { if (evento.key === 'Enter' && !evento.shiftKey) { evento.preventDefault(); void enviar(); } }} maxLength={1000} rows={2} placeholder="Pergunte sobre os dados do CRM…" className="max-h-32 min-h-11 flex-1 resize-y border-0 bg-transparent px-2 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0" />
              <button type="submit" disabled={carregando || pergunta.trim().length < 3} className="anel-de-foco rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">Enviar</button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">Enter envia · Shift+Enter quebra linha</p>
          </form>
        </section>
      )}

      <button
        type="button"
        aria-label={aberto ? 'Fechar assistente' : 'Abrir assistente da plataforma'}
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className="anel-de-foco flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-900/25 transition hover:scale-105 hover:bg-violet-700 focus-visible:outline-violet-400"
      >
        {aberto ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" /></svg>
        ) : <IconeAssistente />}
      </button>
    </div>
  );
}
