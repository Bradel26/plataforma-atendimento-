import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';

type CampanhaParceiro = {
  id: string; nome: string; operacao: 'TIM' | 'STARLINK'; descricao: string | null;
  produtosServicos: string[]; incentivos: string[]; criterios: string | null;
  status: 'RASCUNHO' | 'AGENDADA' | 'VIGENTE' | 'ENCERRADA' | 'CANCELADA';
  inicioEm: string | null; fimEm: string | null;
  anexos?: Array<{ id: string; nome: string; url: string }>;
};
const STATUS: Record<CampanhaParceiro['status'], string> = {
  RASCUNHO: 'Rascunho', AGENDADA: 'Agendada', VIGENTE: 'Vigente', ENCERRADA: 'Encerrada', CANCELADA: 'Cancelada',
};
const localDate = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';

/** Incentivos comerciais separados do disparo de campanhas de mensagens. */
export function CampanhasParceirosTab() {
  const [items, setItems] = useState<CampanhaParceiro[]>([]);
  const [nome, setNome] = useState('');
  const [operacao, setOperacao] = useState<'TIM' | 'STARLINK'>('TIM');
  const [descricao, setDescricao] = useState('');
  const [incentivos, setIncentivos] = useState('');
  const [produtos, setProdutos] = useState('');
  const [criterios, setCriterios] = useState('');
  const [materialNome, setMaterialNome] = useState('');
  const [materialUrl, setMaterialUrl] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [inicioEm, setInicioEm] = useState('');
  const [fimEm, setFimEm] = useState('');
  const [filtro, setFiltro] = useState('TODOS');
  const [filtroIncentivo, setFiltroIncentivo] = useState('TODOS');
  const [periodo, setPeriodo] = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(async () => {
    try { setItems((await api.get<{ campanhas: CampanhaParceiro[] }>('/campanhas/parceiros')).campanhas); setErro(null); }
    catch (e) { setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar as campanhas.'); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const criar = async (event: React.FormEvent) => {
    event.preventDefault(); setSalvando(true);
    try {
      const { campanha } = await api.post<{ campanha: CampanhaParceiro }>('/campanhas/parceiros', {
        nome, operacao, descricao: descricao || null,
        incentivos: incentivos.split('\n').map((x) => x.trim()).filter(Boolean),
        produtosServicos: produtos.split(',').map((x) => x.trim()).filter(Boolean),
        criterios: criterios || null,
        materiais: materialUrl ? [{ nome: materialNome || 'Material da campanha', url: materialUrl }] : [],
        inicioEm: inicioEm ? new Date(inicioEm).toISOString() : null,
        fimEm: fimEm ? new Date(fimEm).toISOString() : null,
      });
      for (const arquivo of arquivos) await api.upload(`/campanhas/parceiros/${campanha.id}/anexos`, arquivo);
      setNome(''); setDescricao(''); setIncentivos(''); setProdutos(''); setCriterios(''); setMaterialNome(''); setMaterialUrl(''); setInicioEm(''); setFimEm(''); setArquivos([]); await carregar();
    } catch (e) { setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar.'); }
    finally { setSalvando(false); }
  };

  const visiveis = items.filter((x) => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    const incluiPeriodo = !periodo || (() => {
      const inicioMes = new Date(`${periodo}-01T00:00:00`);
      const fimMes = new Date(inicioMes.getFullYear(), inicioMes.getMonth() + 1, 0, 23, 59, 59, 999);
      const inicioCampanha = x.inicioEm ? new Date(x.inicioEm) : null;
      const fimCampanha = x.fimEm ? new Date(x.fimEm) : null;
      return (!inicioCampanha || inicioCampanha <= fimMes) && (!fimCampanha || fimCampanha >= inicioMes);
    })();
    return (filtro === 'TODOS' || x.status === filtro || x.operacao === filtro) &&
      (filtroIncentivo === 'TODOS' || x.incentivos.includes(filtroIncentivo)) && incluiPeriodo &&
      (!termo || `${x.nome} ${x.descricao ?? ''} ${x.incentivos.join(' ')}`.toLocaleLowerCase('pt-BR').includes(termo));
  });
  const incentivosDisponiveis = [...new Set(items.flatMap((x) => x.incentivos))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
    <Card titulo="Nova campanha para parceiros" descricao="Incentivos e ações comerciais. Não dispara mensagens.">
      <form onSubmit={(e) => void criar(e)} className="space-y-3">
        <Field label="Nome"><Input required minLength={3} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Aceleração Starlink" /></Field>
        <Field label="Operação"><Select value={operacao} onChange={(e) => setOperacao(e.target.value as 'TIM' | 'STARLINK')}><option value="TIM">TIM</option><option value="STARLINK">Starlink</option></Select></Field>
        <Field label="Descrição"><textarea className="min-h-20 w-full rounded-md border border-slate-300 p-2 text-sm" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Field>
        <Field label="Incentivos" hint="Um incentivo por linha"><textarea className="min-h-20 w-full rounded-md border border-slate-300 p-2 text-sm" value={incentivos} onChange={(e) => setIncentivos(e.target.value)} placeholder="Bônus por ativação" /></Field>
        <Field label="Produtos ou serviços" hint="Separe por vírgula"><Input value={produtos} onChange={(e) => setProdutos(e.target.value)} placeholder="Fibra, Starlink" /></Field>
        <Field label="Critérios de participação"><Input value={criterios} onChange={(e) => setCriterios(e.target.value)} /></Field>
        <div className="grid gap-2 sm:grid-cols-2"><Field label="Material (nome)"><Input value={materialNome} onChange={(e) => setMaterialNome(e.target.value)} /></Field><Field label="Link do material"><Input type="url" value={materialUrl} onChange={(e) => setMaterialUrl(e.target.value)} placeholder="https://…" /></Field></div>
        <Field label="Arquivos de apoio" hint="Imagens, PDFs e documentos compatíveis. Limite definido pelo servidor."><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.mp3,.ogg,.opus,.m4a,.aac,.weba,.mp4,.webm,.pdf,.doc,.docx,.xls,.xlsx,.zip,.csv,.txt" onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2" />{arquivos.length > 0 && <span className="text-xs text-slate-500">{arquivos.map((a) => a.name).join(' · ')}</span>}</Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Início"><Input type="date" value={inicioEm} onChange={(e) => setInicioEm(e.target.value)} /></Field><Field label="Término"><Input type="date" value={fimEm} onChange={(e) => setFimEm(e.target.value)} /></Field></div>
        <Button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Criar rascunho'}</Button>
      </form>
    </Card>
    <Card titulo="Campanhas e histórico" descricao="Registros da organização, por operação e status">
      {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}
      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Operação ou status"><Select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="TODOS">Todas</option><option value="TIM">TIM</option><option value="STARLINK">Starlink</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field><Field label="Período"><Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></Field><Field label="Tipo de incentivo"><Select value={filtroIncentivo} onChange={(e) => setFiltroIncentivo(e.target.value)}><option value="TODOS">Todos</option>{incentivosDisponiveis.map((incentivo) => <option key={incentivo} value={incentivo}>{incentivo}</option>)}</Select></Field><Field label="Buscar campanha ou incentivo"><Input value={busca} onChange={(e) => setBusca(e.target.value)} /></Field></div>
      {visiveis.length === 0 ? <p className="text-sm text-slate-500">Nenhuma campanha para parceiros cadastrada.</p> : <ul className="divide-y divide-slate-100">{visiveis.map((x) => <li key={x.id} className="py-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{x.nome}</strong><Badge tom={x.operacao === 'TIM' ? 'marca' : 'neutro'}>{x.operacao}</Badge><Select aria-label="Status da campanha" className="w-auto" value={x.status} onChange={(e) => void api.patch(`/campanhas/parceiros/${x.id}`, { status: e.target.value }).then(carregar).catch((err) => setErro(err instanceof ApiError ? err.message : 'Falha ao atualizar status'))}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>{x.descricao && <p className="mt-1 text-sm text-slate-600">{x.descricao}</p>}<p className="mt-1 text-xs text-slate-500">{localDate(x.inicioEm)} – {localDate(x.fimEm)}{x.incentivos.length ? ` · ${x.incentivos.join(' · ')}` : ''}</p>{x.anexos && x.anexos.length > 0 && <ul className="mt-2 space-y-1 text-sm">{x.anexos.map((anexo) => <li key={anexo.id} className="flex items-center gap-3"><a className="text-blue-700 underline" href={anexo.url} target="_blank" rel="noreferrer">{anexo.nome}</a>{x.status === 'RASCUNHO' && <button type="button" className="text-xs text-red-600" onClick={() => void api.del(`/campanhas/parceiros/${x.id}/anexos/${anexo.id}`).then(carregar).catch((err) => setErro(err instanceof ApiError ? err.message : 'Falha ao remover anexo'))}>Remover</button>}</li>)}</ul>}</li>)}</ul>}
    </Card>
  </div>;
}
