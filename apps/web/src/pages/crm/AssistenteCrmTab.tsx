import { useRef, useState } from 'react';
import { api } from '../../lib/api';

type Mensagem = { papel: 'usuario' | 'assistente'; texto: string; fonte?: string };
type Resposta = { resposta: string; fonte: string; total: number; valorTotal?: number | null; motor: string };

const SUGESTOES = [
  'Quantos contatos foram cadastrados nos últimos 30 dias?',
  'Quais oportunidades estão abertas e qual o valor total?',
  'Quais tarefas estão pendentes?',
  'Resuma as últimas ligações registradas',
];

export function AssistenteCrmTab() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  async function enviar(texto = pergunta) {
    const perguntaLimpa = texto.trim();
    if (carregando || perguntaLimpa.length < 3) return;
    setPergunta('');
    setErro(null);
    setMensagens((atuais) => [...atuais, { papel: 'usuario', texto: perguntaLimpa }]);
    setCarregando(true);
    try {
      const resultado = await api.post<Resposta>('/assistente-crm/perguntar', { pergunta: perguntaLimpa });
      setMensagens((atuais) => [...atuais, {
        papel: 'assistente',
        texto: resultado.resposta,
        fonte: `Consulta: ${resultado.fonte}${resultado.total ? ` · ${resultado.total} registro(s)` : ''}${resultado.valorTotal !== undefined ? ` · total R$ ${Number(resultado.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}`,
      }]);
      requestAnimationFrame(() => fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui consultar o CRM agora.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-[min(70vh,720px)] max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Assistente do CRM</h2>
        <p className="mt-1 text-sm text-slate-500">Faça perguntas sobre os registros que você tem permissão para consultar. A assistente não altera dados.</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5">
        {mensagens.length === 0 ? (
          <div className="mx-auto max-w-2xl py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-xl text-violet-700" aria-hidden="true">✦</div>
            <h3 className="font-semibold text-slate-900">O que você quer consultar?</h3>
            <p className="mt-1 text-sm text-slate-500">As respostas usam dados permitidos do CRM e podem resumir apenas uma amostra quando houver muitos registros.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {SUGESTOES.map((sugestao) => (
                <button key={sugestao} type="button" onClick={() => void enviar(sugestao)} disabled={carregando} className="anel-de-foco rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50">
                  {sugestao}
                </button>
              ))}
            </div>
          </div>
        ) : mensagens.map((mensagem, indice) => (
          <div key={`${mensagem.papel}-${indice}`} className={`flex ${mensagem.papel === 'usuario' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${mensagem.papel === 'usuario' ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800 shadow-sm'}`}>
              {mensagem.texto}
              {mensagem.fonte && <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">{mensagem.fonte}</p>}
            </div>
          </div>
        ))}
        {carregando && <p className="text-sm text-slate-500" role="status">Consultando o CRM…</p>}
        {erro && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{erro}</p>}
        <div ref={fimRef} />
      </div>

      <form className="border-t border-slate-100 bg-white p-4" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <label htmlFor="pergunta-assistente-crm" className="sr-only">Pergunte sobre os dados do CRM</label>
        <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
          <textarea id="pergunta-assistente-crm" value={pergunta} onChange={(e) => setPergunta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }} maxLength={1000} rows={2} placeholder="Pergunte sobre contatos, empresas, oportunidades, tarefas ou chamadas…" className="max-h-36 min-h-12 flex-1 resize-y border-0 bg-transparent px-2 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0" />
          <button type="submit" disabled={carregando || pergunta.trim().length < 3} className="anel-de-foco rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">Enviar</button>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">A IA pode errar; confira informações importantes nos registros originais. Enter envia · Shift+Enter quebra linha.</p>
      </form>
    </section>
  );
}
