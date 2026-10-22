import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { api } from '../../lib/api';

type Candidato = { id: string; nome: string; telefone: string | null; email: string | null };
type Evidencia = { id: string; rotulo: string; referencia: string | null };
type Mensagem = { papel: 'usuario' | 'assistente'; texto: string; fonte?: string; candidatos?: Candidato[]; contatoId?: string; evidencias?: Evidencia[]; historicoTemMais?: boolean };
type Resposta = { resposta: string; fonte: string; total: number; valorTotal?: number | null; motor: string; tipo?: string; candidatos?: Candidato[]; contatoId?: string; evidencias?: Evidencia[]; historicoTemMais?: boolean };

function obterSugestoes(temModulo: (modulo: string) => boolean, perfil?: string): string[] {
  const sugestoes: string[] = [];
  const gestor = ['ADMIN', 'SUPERVISOR', 'GESTOR'].includes(perfil ?? '');
  if (temModulo('dashboards') && gestor) sugestoes.push('Resuma os indicadores do dashboard nos últimos 7 dias.');
  if (temModulo('atendimento')) sugestoes.push('Quantas conversas estão aguardando resposta?');
  if (temModulo('telefonia')) sugestoes.push('Quais ligações foram atendidas nos últimos 7 dias?');
  if (temModulo('crm')) {
    sugestoes.push('Quantas oportunidades abertas existem?');
    sugestoes.push('Quais tarefas estão pendentes?');
  }
  if (temModulo('monitoramento') && gestor) sugestoes.push('Resuma a situação atual da equipe e os atendimentos aguardando resposta.');
  if (temModulo('esteira') && gestor) sugestoes.push('Quais parceiros estão parados há mais tempo na esteira?');
  if (temModulo('relatorios') && gestor) sugestoes.push('Compare o desempenho da equipe nos últimos 30 dias.');
  if (temModulo('campanhas') && ['ADMIN', 'SUPERVISOR'].includes(perfil ?? '')) sugestoes.push('Resuma os resultados das campanhas recentes.');
  if (temModulo('chamado-ti') && ['ADMIN', 'SUPERVISOR'].includes(perfil ?? '')) sugestoes.push('Quais chamados internos de TI continuam abertos?');
  return sugestoes.slice(0, 6);
}

const ROTULOS_FONTE: Record<string, string> = {
  contatos: 'CRM · contatos', empresas: 'CRM · empresas', oportunidades: 'CRM · oportunidades', atividades: 'CRM · tarefas',
  chamadas: 'Telefonia', conversas: 'Atendimento', dashboard: 'Dashboard', monitoramento: 'Monitoramento',
  esteira: 'Esteira', gestao: 'Área da Gestão', desempenho: 'Desempenho Operacional', campanhas: 'Campanhas',
  auditoria: 'Auditoria', chamados_ti: 'Chamados de TI', configuracoes: 'Configurações',
};

function IconeAssistente({ pequeno = false }: { pequeno?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={pequeno ? 'h-5 w-5' : 'h-6 w-6'}>
      <path d="M12 3.25 13.9 9.1 19.75 11 13.9 12.9 12 18.75 10.1 12.9 4.25 11 10.1 9.1 12 3.25Z" fill="currentColor" />
      <path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z" fill="currentColor" />
    </svg>
  );
}

/** Assistente persistente do shell. A API aplica as permissões de cada módulo consultado. */
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

  if (!usuario) return null;
  const sugestoes = obterSugestoes(temModulo, usuario.perfil);
  if (sugestoes.length === 0) return null;

  async function enviar(texto = pergunta, contatoId?: string) {
    const perguntaLimpa = texto.trim();
    if (carregando || perguntaLimpa.length < 3) return;
    setPergunta('');
    setErro(null);
    setMensagens((atuais) => [...atuais, { papel: 'usuario', texto: perguntaLimpa }]);
    setCarregando(true);
    try {
      const resultado = await api.post<Resposta>('/assistente-crm/perguntar', { pergunta: perguntaLimpa, ...(contatoId ? { contatoId } : {}) });
      const fonteDados = ROTULOS_FONTE[resultado.fonte] ?? resultado.fonte;
      const fonte = resultado.tipo === 'resumo_dashboard'
        ? 'Fonte: indicadores do Dashboard e período consultado'
        : `${fonteDados}: ${resultado.total} registro(s)${resultado.valorTotal !== undefined ? ` · R$ ${Number(resultado.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}`;
      setMensagens((atuais) => [...atuais, {
        papel: 'assistente',
        texto: resultado.resposta,
        fonte: resultado.tipo === 'resumo_cliente'
          ? `Resumo baseado em ${resultado.total} evento(s) do histórico 360${resultado.historicoTemMais ? ' · existem eventos anteriores' : ''}`
          : resultado.tipo === 'resumo_chamada'
            ? `Resumo baseado no histórico da Telefonia · ${resultado.total} ligação(ões)`
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
            {mensagens.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMensagens([]);
                  setPergunta('');
                  setErro(null);
                }}
                disabled={carregando}
                aria-label="Voltar para as sugestões"
                title="Voltar para as sugestões"
                className="anel-de-foco flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 18-6-6 6-6M9 12h11" /></svg>
              </button>
            )}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><IconeAssistente pequeno /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900">Assistente da plataforma</h2>
              <p className="text-xs text-slate-500">Consultas aos módulos que seu perfil pode acessar</p>
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
                <p className="mt-1 text-sm leading-5 text-slate-500">Consulte indicadores, conversas, ligações e registros dos módulos liberados para seu perfil. A assistente não altera dados.</p>
                <div className="mt-5 space-y-2">
                  {sugestoes.map((sugestao) => (
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
                  {!mensagem.contatoId && mensagem.evidencias && mensagem.evidencias.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-slate-100 pt-2">
                      {mensagem.evidencias.slice(0, 5).map((evidencia) => (
                        <p key={evidencia.id} className="text-xs text-slate-500">· {evidencia.rotulo}</p>
                      ))}
                      {mensagem.evidencias.length > 5 && <p className="text-xs text-slate-400">Mais {mensagem.evidencias.length - 5} registro(s) consultado(s).</p>}
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
              <textarea ref={campoRef} id="pergunta-assistente-global" value={pergunta} onChange={(evento) => setPergunta(evento.target.value)} onKeyDown={(evento) => { if (evento.key === 'Enter' && !evento.shiftKey) { evento.preventDefault(); void enviar(); } }} maxLength={1000} rows={2} placeholder="Pergunte sobre os dados da plataforma…" className="max-h-32 min-h-11 flex-1 resize-y border-0 bg-transparent px-2 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0" />
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
