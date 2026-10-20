import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button } from '../components/ui';
import { CabecalhoPagina } from '../components/ui/Pagina';
import { SkeletonBloco } from '../components/ui/Skeleton';
import { GavetaFiltros } from '../features/auditoria/GavetaFiltros';
import { LABEL_SITUACAO, paraQuery, rotuloDoChip, type FiltroAplicado, type OpcoesAuditoria } from '../features/auditoria/filtros';
import { PainelChat } from '../features/atendimento/PainelChat';
import { ApiError, api, getAccessToken } from '../lib/api';
import { EVENTOS, conectar } from '../lib/realtime';
import { telefoneLegivel } from '../lib/telefone';
import type { ConversaDetalhe, Mensagem } from '../lib/types';

type LinhaAuditoria = {
  id: string;
  contato: { id: string; nome: string; telefone: string | null };
  protocolo: string | null;
  linha: { id: string; nome: string } | null;
  equipe: { id: string; nome: string } | null;
  criadoEm: string;
  finalizadoEm: string | null;
  atendenteInicial: { id: string; nome: string } | null;
  origem: 'ATIVO' | 'RECEPTIVO';
  situacao: 'AGUARDANDO_FILA' | 'EM_ATENDIMENTO' | 'FINALIZADA';
};
type Pagina = { total: number; pagina: number; tamanho: number; itens: LinhaAuditoria[] };
// So tons que o tema escuro remapeia (index.css).
const CLASSE_SITUACAO: Record<LinhaAuditoria['situacao'], string> = {
  EM_ATENDIMENTO: 'bg-emerald-50 text-emerald-700',
  FINALIZADA: 'bg-slate-100 text-slate-600',
  AGUARDANDO_FILA: 'bg-amber-50 text-amber-700',
};
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function IconeOlho() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Visualizador({ id, aoVoltar }: { id: string; aoVoltar: () => void }) {
  const [conversa, setConversa] = useState<ConversaDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    void api.get<{ conversa: ConversaDetalhe }>(`/conversas/${id}`).then(({ conversa: c }) => setConversa(c))
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível abrir a conversa'));
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    socket.emit('conversa:entrar', id);
    socket.on(EVENTOS.mensagemNova, ({ conversaId, mensagem }: { conversaId: string; mensagem: Mensagem }) => {
      if (conversaId === id) setConversa((atual) => atual && !atual.mensagens.some((m) => m.id === mensagem.id)
        ? { ...atual, mensagens: [...atual.mensagens, mensagem] } : atual);
    });
    socket.on(EVENTOS.conversaAtualizada, (nova: ConversaDetalhe) => {
      if (nova.id === id) setConversa((atual) => atual ? { ...nova, mensagens: atual.mensagens } : atual);
    });
    return () => { socket.emit('conversa:sair', id); socket.disconnect(); };
  }, [id]);

  return <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5">
      <Button tamanho="sm" variante="neutro" onClick={aoVoltar}>← Voltar para a auditoria</Button>
      {conversa && <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{conversa.contato.nome}</span>}
      <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        <IconeOlho />Somente leitura
      </span>
    </div>
    {erro && <div className="p-4"><Alerta>{erro}</Alerta></div>}
    {!conversa && !erro && <p className="p-6 text-sm text-slate-500">Carregando conversa...</p>}
    {conversa && <div className="min-h-0 flex-1"><PainelChat conversa={conversa} onMudou={setConversa} somenteLeitura /></div>}
  </div>;
}

export function AuditoriaPage() {
  const [filtros, setFiltros] = useState<FiltroAplicado[]>([]);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Pagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<OpcoesAuditoria | null>(null);
  const [gaveta, setGaveta] = useState(false);
  const [vendo, setVendo] = useState<string | null>(null);

  useEffect(() => { void api.get<OpcoesAuditoria>('/conversas/auditoria/opcoes').then(setOpcoes).catch(() => undefined); }, []);
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await api.get<Pagina>(`/conversas/auditoria?${paraQuery(filtros, pagina)}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a auditoria');
    } finally { setCarregando(false); }
  }, [filtros, pagina]);
  useEffect(() => { void carregar(); }, [carregar]);
  if (vendo) return <Visualizador id={vendo} aoVoltar={() => { setVendo(null); void carregar(); }} />;
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.tamanho)) : 1;
  const primeiro = dados && dados.itens.length > 0 ? (pagina - 1) * dados.tamanho + 1 : 0;
  const ultimo = dados ? primeiro + Math.max(dados.itens.length - 1, 0) : 0;

  return <div className="flex flex-col gap-4">
    <CabecalhoPagina titulo="Auditoria de conversas" descricao="Toda conversa, de qualquer equipe, aberta em modo somente leitura">
      <Button variante="neutro" onClick={() => setGaveta(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
        Filtrar
        {filtros.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-[11.5px] font-bold tabular-nums texto-sobre-cor-fixa">
            {filtros.length}<span className="sr-only"> filtro(s) aplicado(s)</span>
          </span>
        )}
      </Button>
    </CabecalhoPagina>
    {filtros.length > 0 && opcoes && <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <span className="text-slate-500">Filtros:</span>
      {filtros.map((filtro, i) => <button key={`${filtro.campo}-${i}`} type="button"
        onClick={() => { setFiltros((atuais) => atuais.filter((_, j) => j !== i)); setPagina(1); }}
        className="relative inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-300 bg-white pl-3 pr-1.5 text-slate-700 hover:bg-slate-50" title="Remover filtro">
        {rotuloDoChip(filtro, opcoes)}
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-100" aria-hidden="true">×</span>
        <span className="sr-only">Remover filtro</span>
      </button>)}
      <button type="button" onClick={() => { setFiltros([]); setPagina(1); }} className="font-semibold text-blue-700 hover:underline">
        Limpar tudo
      </button>
    </div>}
    {erro && <Alerta>{erro}</Alerta>}
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11.5px] text-slate-500"><tr>
            {['Contato', 'Protocolo', 'Canal', 'Equipe', 'Início', 'Fim', 'Atendente inicial', 'Origem', 'Status'].map((h) => <th key={h} className="whitespace-nowrap px-3.5 py-2.5 font-semibold">{h}</th>)}
            <th className="px-3.5 py-2.5"><span className="sr-only">Ações</span></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {carregando && !dados && <tr><td colSpan={10} className="p-4"><SkeletonBloco className="h-4 w-full" /></td></tr>}
            {dados?.itens.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500">Nenhuma conversa com estes filtros.</td></tr>}
            {dados?.itens.map((linha) => <tr key={linha.id} className="hover:bg-slate-50">
              <td className="px-3.5 py-2.5">
                <span className="block font-bold text-slate-900">{linha.contato.nome}</span>
                <span className="block text-xs tabular-nums text-slate-500">{linha.contato.telefone ? telefoneLegivel(linha.contato.telefone.replace(/\D/g, '')) : '—'}</span>
              </td>
              <td className="px-3.5 py-2.5 font-mono text-[12.5px] tabular-nums">{linha.protocolo ?? '—'}</td>
              <td className="px-3.5 py-2.5">{linha.linha?.nome ?? 'Número da empresa'}</td>
              <td className="px-3.5 py-2.5">{linha.equipe?.nome ?? 'Sem equipe'}</td>
              <td className="whitespace-nowrap px-3.5 py-2.5 tabular-nums">{data(linha.criadoEm)}<span className="block text-xs text-slate-500">{hora(linha.criadoEm)}</span></td>
              <td className="whitespace-nowrap px-3.5 py-2.5 tabular-nums">
                {linha.finalizadoEm
                  ? <>{data(linha.finalizadoEm)}<span className="block text-xs text-slate-500">{hora(linha.finalizadoEm)}</span></>
                  : <span className="text-slate-500">Não finalizado</span>}
              </td>
              <td className="px-3.5 py-2.5">{linha.atendenteInicial?.nome ?? <span className="text-slate-500">Não atendido</span>}</td>
              <td className="px-3.5 py-2.5" title={linha.origem === 'ATIVO' ? 'Iniciada pela empresa' : 'Iniciada pelo cliente'}>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={linha.origem === 'ATIVO' ? 'M7 17 17 7M7 7h10v10' : 'M17 7 7 17M17 17H7V7'} />
                  </svg>
                  {linha.origem === 'ATIVO' ? 'Ativo' : 'Receptivo'}
                </span>
              </td>
              <td className="px-3.5 py-2.5">
                <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CLASSE_SITUACAO[linha.situacao]}`}>{LABEL_SITUACAO[linha.situacao]}</span>
              </td>
              <td className="px-3.5 py-2.5 text-right">
                <button type="button" aria-label={`Ver conversa de ${linha.contato.nome}`} onClick={() => setVendo(linha.id)}
                  className="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <IconeOlho />Ver conversa
                </button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {dados && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-[12.5px] text-slate-500">
        <span className="tabular-nums">
          {dados.total === 0 ? 'Nenhuma conversa' : <>Mostrando <strong className="text-slate-900">{primeiro}–{ultimo}</strong> de <strong className="text-slate-900">{dados.total}</strong> conversa(s)</>}
        </span>
        <div className="flex items-center gap-1.5">
          <Button tamanho="sm" variante="neutro" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
          <span className="px-2 tabular-nums">Página {pagina} de {totalPaginas}</span>
          <Button tamanho="sm" variante="neutro" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
        </div>
      </div>}
    </div>
    <GavetaFiltros aberta={gaveta} aoFechar={() => setGaveta(false)} aplicados={filtros} opcoes={opcoes}
      aoAplicar={(novos) => { setFiltros(novos); setPagina(1); }} />
  </div>;
}
