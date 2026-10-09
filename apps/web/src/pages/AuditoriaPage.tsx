import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button } from '../components/ui';
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
const TOM: Record<LinhaAuditoria['situacao'], 'sucesso' | 'neutro' | 'alerta'> = {
  EM_ATENDIMENTO: 'sucesso', FINALIZADA: 'neutro', AGUARDANDO_FILA: 'alerta',
};
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

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

  return <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-3 py-2"><Button tamanho="sm" variante="neutro" onClick={aoVoltar}>← Voltar para a auditoria</Button></div>
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

  return <div className="space-y-3">
    <div className="flex items-center justify-end">
      <Button variante="neutro" onClick={() => setGaveta(true)}>Filtrar <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-xs text-white">{filtros.length}</span></Button>
    </div>
    {filtros.length > 0 && opcoes && <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">Filtros aplicados:</span>
      {filtros.map((filtro, i) => <button key={`${filtro.campo}-${i}`} type="button"
        onClick={() => { setFiltros((atuais) => atuais.filter((_, j) => j !== i)); setPagina(1); }}
        className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200" title="Remover filtro">
        {rotuloDoChip(filtro, opcoes)} ×
      </button>)}
    </div>}
    {erro && <Alerta>{erro}</Alerta>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1100px] text-left text-xs">
        <thead className="border-b border-slate-200 text-slate-500"><tr>
          {['Contato', 'Telefone', 'Protocolo', 'Canal', 'Equipe', 'Data início', 'Data fim', 'Atendente inicial', 'Origem', 'Status', 'Ações'].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {carregando && !dados && <tr><td colSpan={11} className="p-4"><SkeletonBloco className="h-4 w-full" /></td></tr>}
          {dados?.itens.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-slate-500">Nenhuma conversa com estes filtros.</td></tr>}
          {dados?.itens.map((linha) => <tr key={linha.id} className="hover:bg-slate-50">
            <td className="px-3 py-2">{linha.contato.nome}</td>
            <td className="px-3 py-2">{linha.contato.telefone ? telefoneLegivel(linha.contato.telefone.replace(/\D/g, '')) : '—'}</td>
            <td className="px-3 py-2 font-mono">{linha.protocolo ?? '—'}</td>
            <td className="px-3 py-2">{linha.linha?.nome ?? 'Número da empresa'}</td>
            <td className="px-3 py-2">{linha.equipe?.nome ?? 'Sem equipe'}</td>
            <td className="px-3 py-2">{dataHora(linha.criadoEm)}</td>
            <td className="px-3 py-2">{linha.finalizadoEm ? dataHora(linha.finalizadoEm) : 'Não finalizado'}</td>
            <td className="px-3 py-2">{linha.atendenteInicial?.nome ?? 'Não atendido'}</td>
            <td className="px-3 py-2" title={linha.origem === 'ATIVO' ? 'Iniciada pela empresa' : 'Iniciada pelo cliente'}>{linha.origem === 'ATIVO' ? '↗' : '↙'}</td>
            <td className="px-3 py-2"><Badge tom={TOM[linha.situacao]}>{LABEL_SITUACAO[linha.situacao]}</Badge></td>
            <td className="px-3 py-2"><button type="button" title="Visualizar" aria-label="Visualizar conversa" onClick={() => setVendo(linha.id)} className="rounded px-1.5 py-0.5 hover:bg-slate-100">📄</button></td>
          </tr>)}
        </tbody>
      </table>
      {dados && <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        <span>Itens {dados.itens.length} de {dados.total}</span><div className="flex items-center gap-1">
          <Button tamanho="sm" variante="neutro" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
          <span className="px-2">{pagina} / {totalPaginas}</span>
          <Button tamanho="sm" variante="neutro" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próximo</Button>
        </div>
      </div>}
    </div>
    <GavetaFiltros aberta={gaveta} aoFechar={() => setGaveta(false)} aplicados={filtros} opcoes={opcoes}
      aoAplicar={(novos) => { setFiltros(novos); setPagina(1); }} />
  </div>;
}
