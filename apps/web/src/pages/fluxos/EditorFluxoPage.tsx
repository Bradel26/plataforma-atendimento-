import { memo, useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate, useParams } from 'react-router-dom';
import { Alerta, Badge, Button, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';

type TipoNo = 'inicio' | 'texto' | 'imagem' | 'audio' | 'documento' | 'video' | 'menu' | 'equipe' | 'usuario' | 'espera' | 'finalizar';
type OpcaoMenu = { id: string; label: string };
type DadosNo = {
  nome: string;
  texto?: string;
  opcoes?: OpcaoMenu[];
  filaId?: string;
  usuarioId?: string;
  timeoutMin?: number;
  limiteTentativas?: number;
  minutos?: number;
  midiaId?: string;
  nomeArquivo?: string;
  tipoArquivo?: string;
  legenda?: string;
};
type NoEditor = Node<DadosNo, TipoNo>;
type ArestaEditor = Edge;
type GrafoEditor = { nodes: NoEditor[]; edges: ArestaEditor[] };
type Canal = { id: string; nome: string | null; ponteSessao: string | null; dono: { nome: string } | null };
type Fila = { id: string; nome: string };
type Usuario = { id: string; nome: string; perfil: string };
type Midia = { id: string; nome: string; tipo: string; tamanho: number; url: string };
type RegistroFluxo = {
  id: string;
  nome: string;
  ativo: boolean;
  versao: number;
  canalConfigId: string | null;
  canalConfigRascunhoId: string | null;
  rascunho: GrafoEditor;
  publicado: GrafoEditor | null;
};

const ROTULOS: Record<TipoNo, string> = {
  inicio: 'Início', texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', documento: 'Documento', video: 'Vídeo', menu: 'Menu de texto', equipe: 'Enviar para equipe',
  usuario: 'Enviar para usuário', espera: 'Aguardar prazo', finalizar: 'Finalizar',
};
const ICONE: Record<TipoNo, string> = { inicio: '▶', texto: 'T', imagem: '▧', audio: '♫', documento: '▤', video: '▶', menu: '☷', equipe: '▤', usuario: '♙', espera: '◷', finalizar: '×' };

function idNovo() { return crypto.randomUUID(); }
function novaOpcao(label: string): OpcaoMenu { return { id: idNovo(), label }; }

function NoCard({ data, selected, tipo }: NodeProps<NoEditor> & { tipo: TipoNo }) {
  const opcoes = data.opcoes ?? [];
  const textoPreview = data.texto?.trim() || 'Clique para configurar este bloco';
  const portas: Array<{ id: string; label: string; top: number }> = tipo === 'menu'
    ? [...opcoes.map((opcao, i) => ({ id: opcao.id, label: `${i + 1} · ${opcao.label}`, top: 52 + i * 23 })), ...(data.timeoutMin ? [{ id: 'timeout', label: `Após ${data.timeoutMin} min`, top: 58 + opcoes.length * 23 }] : [])]
    : tipo === 'equipe'
      ? [{ id: 'next', label: 'Após aceite', top: 48 }, ...(data.timeoutMin ? [{ id: 'timeout', label: `Após ${data.timeoutMin} min`, top: 70 }] : [])]
      : tipo === 'espera'
        ? [{ id: 'timeout', label: 'Prazo vencido', top: 54 }]
        : tipo === 'finalizar' || tipo === 'inicio' ? [] : [{ id: 'next', label: '', top: 50 }];
  const destino = tipo === 'equipe' ? data.filaId : tipo === 'usuario' ? data.usuarioId : undefined;
  return (
    <div className={`relative min-w-[174px] max-w-[205px] rounded-lg border bg-white shadow-sm ${selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      {tipo !== 'inicio' && <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400" />}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-semibold ${tipo === 'menu' || tipo === 'equipe' || tipo === 'usuario' || tipo === 'espera' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{ICONE[tipo]}</span>
        <span className="text-xs font-semibold text-slate-800">{data.nome || ROTULOS[tipo]}</span>
      </div>
      <div className="px-3 pb-3 pt-1.5 text-[11px] leading-4 text-slate-500">
        {tipo === 'texto' || tipo === 'menu' ? <span className="line-clamp-3">{textoPreview}</span>
          : ['imagem', 'audio', 'documento', 'video'].includes(tipo) ? <span className="line-clamp-2">{data.nomeArquivo || 'Selecione um arquivo'}</span>
          : tipo === 'equipe' ? <span>{destino ? 'Fila selecionada' : 'Escolha uma equipe'}</span>
              : tipo === 'usuario' ? <span>{destino ? 'Atendente selecionado' : 'Escolha um atendente'}</span>
                : tipo === 'espera' ? <span>Aguardar {data.minutos || 1} minutos</span>
                  : tipo === 'finalizar' ? <span>Encerra sem encaminhar</span>
                    : tipo === 'inicio' ? <span>Entrada da mensagem</span> : null}
        {tipo === 'menu' && <div className="mt-1 space-y-0.5">{opcoes.map((opcao, i) => <div key={opcao.id}>{i + 1} · {opcao.label}</div>)}</div>}
      </div>
      {tipo === 'inicio' && <Handle type="source" position={Position.Right} id="next" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-emerald-500" />}
      {portas.map((porta) => (
        <div key={porta.id} className="absolute right-0 translate-x-full" style={{ top: porta.top }}>
          <span className="absolute right-4 -top-1 whitespace-nowrap text-[10px] text-slate-400">{porta.label}</span>
          <Handle type="source" position={Position.Right} id={porta.id} className="!relative !left-auto !right-auto !top-auto !h-2.5 !w-2.5 !translate-x-0 !translate-y-0 !border-2 !border-white !bg-rose-500" />
        </div>
      ))}
    </div>
  );
}

const InicioNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="inicio" />);
const TextoNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="texto" />);
const MenuNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="menu" />);
const EquipeNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="equipe" />);
const UsuarioNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="usuario" />);
const EsperaNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="espera" />);
const FinalizarNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="finalizar" />);

const ImagemNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="imagem" />);
const AudioNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="audio" />);
const DocumentoNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="documento" />);
const VideoNode = memo((props: NodeProps<NoEditor>) => <NoCard {...props} tipo="video" />);

const NODE_TYPES = {
  inicio: InicioNode, texto: TextoNode, imagem: ImagemNode, audio: AudioNode,
  documento: DocumentoNode, video: VideoNode, menu: MenuNode, equipe: EquipeNode,
  usuario: UsuarioNode, espera: EsperaNode, finalizar: FinalizarNode,
};

const criarNo = (tipo: TipoNo, position: { x: number; y: number }): NoEditor => {
  const base: NoEditor = { id: idNovo(), type: tipo, position, data: { nome: ROTULOS[tipo] } };
  if (tipo === 'texto') base.data.texto = 'Escreva a mensagem que o cliente vai receber.';
  if (['imagem', 'audio', 'documento', 'video'].includes(tipo)) base.data.legenda = '';
  if (tipo === 'menu') { base.data.texto = 'Como podemos ajudar?'; base.data.opcoes = [novaOpcao('Vendas'), novaOpcao('Suporte')]; base.data.limiteTentativas = 3; }
  if (tipo === 'equipe') base.data.timeoutMin = 1440;
  if (tipo === 'espera') base.data.minutos = 60;
  return base;
};

function canalLabel(canal: Canal) {
  return canal.dono?.nome ? `${canal.dono.nome} · ${canal.nome ?? canal.ponteSessao ?? 'WhatsApp'}` : canal.nome ?? canal.ponteSessao ?? 'WhatsApp compartilhado';
}

function EditorConteudo() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { screenToFlowPosition, fitView } = useReactFlow<NoEditor, ArestaEditor>();
  const [nodes, setNodes, onNodesChange] = useNodesState<NoEditor>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ArestaEditor>([]);
  const [fluxo, setFluxo] = useState<RegistroFluxo | null>(null);
  const [nome, setNome] = useState('');
  const [canalConfigId, setCanalConfigId] = useState('');
  const [canais, setCanais] = useState<Canal[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [midias, setMidias] = useState<Midia[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const nodeSelecionado = nodes.find((node) => node.id === selecionado) ?? null;
  const nodeTypes = useMemo(() => NODE_TYPES, []);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      api.get<{ fluxo: RegistroFluxo }>(`/fluxos/${id}`),
      api.get<{ canais: Canal[]; filas: Fila[]; usuarios: Usuario[] }>('/fluxos/recursos'),
      api.get<{ midias: Midia[] }>(`/fluxos/${id}/midias`),
    ]).then(([resultado, recursos, arquivos]) => {
      if (!ativo) return;
      setFluxo(resultado.fluxo);
      setNome(resultado.fluxo.nome);
      setCanalConfigId(resultado.fluxo.canalConfigRascunhoId ?? '');
      const grafo = resultado.fluxo.rascunho;
      setNodes(grafo.nodes.map((node) => ({ ...node, data: { ...node.data } })));
      setEdges(grafo.edges);
      setCanais(recursos.canais);
      setFilas(recursos.filas);
      setUsuarios(recursos.usuarios);
      setMidias(arquivos.midias);
      setCarregando(false);
      window.setTimeout(() => fitView({ padding: 0.24, duration: 180 }), 80);
    }).catch((e: unknown) => {
      if (ativo) {
        setErro(e instanceof ApiError ? e.message : 'Não foi possível abrir o fluxo');
        setCarregando(false);
      }
    });
    return () => { ativo = false; };
  }, [id, setEdges, setNodes, fitView]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8', strokeWidth: 1.7 } }, current));
  }, [setEdges]);

  const inserirBloco = useCallback((tipo: TipoNo, position?: { x: number; y: number }) => {
    const ponto = position ?? { x: 280 + (nodes.length % 4) * 45, y: 160 + (nodes.length % 4) * 70 };
    const node = criarNo(tipo, ponto);
    setNodes((current) => [...current, node]);
    setSelecionado(node.id);
  }, [nodes.length, setNodes]);

  const iniciarArraste = (event: DragEvent, tipo: TipoNo) => {
    event.dataTransfer.setData('application/reactflow', tipo);
    event.dataTransfer.effectAllowed = 'move';
  };
  const aoSoltar = (event: DragEvent) => {
    event.preventDefault();
    const tipo = event.dataTransfer.getData('application/reactflow') as TipoNo;
    if (!['texto', 'menu', 'equipe', 'usuario', 'espera', 'finalizar'].includes(tipo)) return;
    inserirBloco(tipo, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const atualizarDado = (campo: keyof DadosNo, valor: unknown) => {
    if (!selecionado) return;
    setNodes((atual) => atual.map((node) => node.id === selecionado ? { ...node, data: { ...node.data, [campo]: valor } } : node));
  };

  const enviarMidia = async (arquivo: File) => {
    setErro(null);
    try {
      const resposta = await api.upload<{ midia: Midia }>(`/fluxos/${id}/midias`, arquivo);
      setMidias((atuais) => [resposta.midia, ...atuais.filter((item) => item.id !== resposta.midia.id)]);
      atualizarDado('midiaId', resposta.midia.id);
      atualizarDado('nomeArquivo', resposta.midia.nome);
      atualizarDado('tipoArquivo', resposta.midia.tipo);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível enviar o arquivo');
    }
  };

  const salvarRascunho = async () => {
    setErro(null); setSucesso(null); setSalvando(true);
    try {
      const resposta = await api.put<{ fluxo: RegistroFluxo }>(`/fluxos/${id}`, {
        nome,
        canalConfigId: canalConfigId || null,
        grafo: { nodes: nodes.map(({ selected: _selected, dragging: _dragging, ...node }) => node), edges },
      });
      setFluxo(resposta.fluxo);
      setSucesso('Rascunho salvo.');
      return true;
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o rascunho');
      return false;
    } finally { setSalvando(false); }
  };

  const publicar = async () => {
    if (!(await salvarRascunho())) return;
    setErro(null); setSucesso(null); setSalvando(true);
    try {
      const resposta = await api.post<{ fluxo: RegistroFluxo }>(`/fluxos/${id}/publicar`, {});
      setFluxo(resposta.fluxo);
      setSucesso(`Fluxo publicado · versão ${resposta.fluxo.versao}. Novas conversas já usarão esta versão.`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível publicar o fluxo');
    } finally { setSalvando(false); }
  };

  const removerNo = () => {
    if (!selecionado || nodeSelecionado?.type === 'inicio') return;
    setNodes((atual) => atual.filter((node) => node.id !== selecionado));
    setEdges((atual) => atual.filter((edge) => edge.source !== selecionado && edge.target !== selecionado));
    setSelecionado(null);
  };

  const atualizarOpcao = (index: number, valor: string) => {
    const opcoes = [...(nodeSelecionado?.data.opcoes ?? [])];
    if (!opcoes[index]) return;
    opcoes[index] = { ...opcoes[index]!, label: valor };
    atualizarDado('opcoes', opcoes);
  };
  const adicionarOpcao = () => atualizarDado('opcoes', [...(nodeSelecionado?.data.opcoes ?? []), novaOpcao(`Opção ${(nodeSelecionado?.data.opcoes?.length ?? 0) + 1}`)]);
  const excluirOpcao = (index: number) => atualizarDado('opcoes', (nodeSelecionado?.data.opcoes ?? []).filter((_, i) => i !== index));

  const nomeDoDestino = (node: NoEditor): string => {
    if (node.type === 'equipe') return filas.find((fila) => fila.id === node.data.filaId)?.nome ?? 'Equipe não selecionada';
    if (node.type === 'usuario') return usuarios.find((usuario) => usuario.id === node.data.usuarioId)?.nome ?? 'Usuário não selecionado';
    return '';
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-0 flex-col bg-slate-100 text-slate-900">
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2 font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white">B</span>Fluxos</div>
        <span className="text-slate-300">/</span><span className="text-xs text-slate-500">Configurações</span>
        <Input aria-label="Nome do fluxo" className="max-w-[250px]" value={nome} onChange={(e) => setNome(e.target.value)} />
        {fluxo?.ativo ? <Badge tom="sucesso">Publicado · v{fluxo.versao}</Badge> : <Badge>Rascunho</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <Button variante="neutro" onClick={() => navigate('/configuracoes?aba=fluxos')}>Sair</Button>
          <Button variante="neutro" disabled={salvando || carregando} onClick={() => void salvarRascunho()}>{salvando ? 'Salvando...' : 'Salvar rascunho'}</Button>
          <Button disabled={salvando || carregando} onClick={() => void publicar()}>{salvando ? 'Publicando...' : 'Salvar e ativar'}</Button>
        </div>
      </header>
      <div className="flex min-h-11 items-center gap-3 border-b border-slate-200 bg-white px-4 text-xs">
        <span className="font-medium text-blue-700">Editor do fluxo</span>
        <span className="text-slate-500">Tipo</span>
        <Select aria-label="Número WhatsApp Web do fluxo" className="max-w-[270px] !py-1 !text-xs" value={canalConfigId} onChange={(e) => setCanalConfigId(e.target.value)}>
          <option value="">Selecione o número WhatsApp Web</option>
          {canais.map((canal) => <option key={canal.id} value={canal.id}>{canalLabel(canal)}</option>)}
        </Select>
        <span className="ml-auto text-slate-400">Versão em andamento · {fluxo?.versao ?? 0}</span>
      </div>
      {(erro || sucesso) && <div className="px-4 pt-2">{erro ? <Alerta>{erro}</Alerta> : <Alerta tipo="sucesso">{sucesso}</Alerta>}</div>}
      <div className="grid min-h-0 flex-1 grid-cols-[170px_minmax(0,1fr)_290px]">
        <aside className="z-10 border-r border-slate-200 bg-white p-3">
          <p className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Blocos</p>
          <div className="space-y-1">
            {(['texto', 'imagem', 'audio', 'documento', 'video', 'menu', 'equipe', 'usuario', 'espera', 'finalizar'] as TipoNo[]).map((tipo) => (
              <button key={tipo} type="button" draggable onDragStart={(event) => iniciarArraste(event, tipo)} onClick={() => inserirBloco(tipo)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                <span className="grid h-6 w-6 place-items-center rounded bg-slate-100 font-semibold text-slate-600">{ICONE[tipo]}</span>{ROTULOS[tipo]}
              </button>
            ))}
          </div>
          <p className="mt-4 px-1 text-[11px] leading-relaxed text-slate-400">Arraste um bloco para a área de trabalho e conecte as saídas para montar os caminhos.</p>
        </aside>
        <main className="relative min-h-0 bg-slate-50" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={aoSoltar}>
          {carregando ? <div className="absolute inset-0 z-20 grid place-items-center bg-slate-50/80 text-sm text-slate-500">Carregando editor...</div> : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelecionado(node.id)}
            onPaneClick={() => setSelecionado(null)}
            onNodesDelete={(removidos) => { if (removidos.some((node) => node.type === 'inicio')) setNodes((atual) => atual.some((node) => node.type === 'inicio') ? atual : [criarNo('inicio', { x: 80, y: 200 }), ...atual]); }}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.24 }}
            defaultEdgeOptions={{ type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8', strokeWidth: 1.7 } }}
            nodesConnectable
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#cbd5e1" gap={18} size={1} />
            <MiniMap nodeColor={(node) => node.type === 'inicio' ? '#10b981' : node.type === 'finalizar' ? '#64748b' : '#d7a63e'} maskColor="rgb(241 245 249 / 70%)" />
            <Controls position="bottom-left" />
          </ReactFlow>
        </main>
        <aside className="overflow-y-auto border-l border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div><h2 className="text-sm font-semibold">{nodeSelecionado ? ROTULOS[(nodeSelecionado.type ?? 'texto') as TipoNo] : 'Configurações'}</h2><p className="mt-1 text-xs text-slate-500">{nodeSelecionado ? 'Defina os detalhes deste bloco.' : 'Selecione um bloco no canvas.'}</p></div>
            {nodeSelecionado && nodeSelecionado.type !== 'inicio' && <Button variante="perigo" tamanho="sm" onClick={removerNo}>Excluir</Button>}
          </div>
          {nodeSelecionado && <EditorDoNo
            node={nodeSelecionado}
            filas={filas}
            usuarios={usuarios}
            midias={midias}
            enviarMidia={enviarMidia}
            destino={nomeDoDestino(nodeSelecionado)}
            atualizarDado={atualizarDado}
            atualizarOpcao={atualizarOpcao}
            adicionarOpcao={adicionarOpcao}
            excluirOpcao={excluirOpcao}
          />}
          {!nodeSelecionado && <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">Conecte o bloco Início ao primeiro passo. Menus criam uma saída por opção; equipes podem abrir um caminho quando o prazo vencer.</div>}
        </aside>
      </div>
      <footer className="flex h-8 items-center justify-between border-t border-slate-200 bg-white px-4 text-[10px] text-slate-400"><span>● Rascunho salvo pelo administrador</span><span>{nodes.length} blocos · {edges.length} conexões</span></footer>
    </div>
  );
}

function CampoTexto({ label, value, onChange, placeholder, multiline = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return <Field label={label}><div>{multiline
    ? <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" rows={4} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    : <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}</div></Field>;
}

function CampoNumero({ label, value, onChange, min = 1, max = 10080 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return <Field label={label}><Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>;
}

function EditorDoNo({
  node, filas, usuarios, midias, enviarMidia, atualizarDado, atualizarOpcao, adicionarOpcao, excluirOpcao,
}: {
  node: NoEditor; filas: Fila[]; usuarios: Usuario[]; midias: Midia[]; destino: string;
  enviarMidia: (arquivo: File) => Promise<void>;
  atualizarDado: (campo: keyof DadosNo, valor: unknown) => void;
  atualizarOpcao: (index: number, value: string) => void;
  adicionarOpcao: () => void; excluirOpcao: (index: number) => void;
}) {
  const partes: ReactNode[] = [
    <CampoTexto key="nome" label="Nome do bloco" value={node.data.nome} onChange={(value) => atualizarDado('nome', value)} />,
  ];
  if (node.type === 'texto' || node.type === 'menu') {
    partes.push(<CampoTexto key="texto" label={node.type === 'menu' ? 'Mensagem do menu' : 'Texto'} value={node.data.texto ?? ''} multiline onChange={(value) => atualizarDado('texto', value)} placeholder="Digite o texto que o cliente receberá" />);
    partes.push(<p key="vars" className="-mt-2 text-[11px] text-slate-400">Variáveis: {'{{nome}}'}, {'{{telefone}}'}, {'{{protocolo}}'}</p>);
  }
  if (node.type === 'imagem' || node.type === 'audio' || node.type === 'documento' || node.type === 'video') {
    const accept = node.type === 'imagem' ? 'image/*' : node.type === 'audio' ? 'audio/*' : node.type === 'video' ? 'video/*' : undefined;
    const selecionada = midias.find((midia) => midia.id === node.data.midiaId);
    partes.push(<Field key="midia" label={node.type === 'documento' ? 'Arquivo' : ROTULOS[node.type]}>
      <div className="space-y-2">
        <Input type="file" accept={accept} aria-label={`Selecionar ${ROTULOS[node.type].toLocaleLowerCase()}`} onChange={(e) => { const arquivo = e.target.files?.[0]; if (arquivo) void enviarMidia(arquivo); e.currentTarget.value = ''; }} />
        {selecionada && <div className="rounded border border-slate-200 p-2 text-xs text-slate-600">{selecionada.nome} · {(selecionada.tamanho / 1024).toFixed(0)} KB</div>}
        {node.data.nomeArquivo && !selecionada && <div className="rounded border border-slate-200 p-2 text-xs text-slate-600">{node.data.nomeArquivo}</div>}
      </div>
    </Field>);
    partes.push(<CampoTexto key="legenda" label="Legenda (opcional)" value={node.data.legenda ?? ''} multiline onChange={(value) => atualizarDado('legenda', value)} />);
  }
  if (node.type === 'menu') {
    partes.push(<div key="opcoes" className="space-y-2"><div className="text-xs font-medium text-slate-700">Opções e saídas</div>{(node.data.opcoes ?? []).map((opcao, index) => (
      <div key={opcao.id} className="flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-slate-100 text-xs font-medium">{index + 1}</span><Input value={opcao.label} onChange={(e) => atualizarOpcao(index, e.target.value)} aria-label={`Texto da opção ${index + 1}`} /><button type="button" className="text-xs text-red-600" onClick={() => excluirOpcao(index)}>Remover</button></div>
    ))}<Button variante="neutro" tamanho="sm" onClick={adicionarOpcao} disabled={(node.data.opcoes?.length ?? 0) >= 10}>Adicionar opção</Button></div>);
    partes.push(<CampoNumero key="tentativas" label="Tentativas inválidas" min={1} max={5} value={node.data.limiteTentativas ?? 3} onChange={(value) => atualizarDado('limiteTentativas', value)} />);
    partes.push(<CampoNumero key="timeout" label="Prazo sem resposta (minutos, opcional)" min={0} value={node.data.timeoutMin ?? 0} onChange={(value) => atualizarDado('timeoutMin', value)} />);
  }
  if (node.type === 'equipe') {
    partes.push(<Field key="fila" label="Equipe de atendimento"><Select value={node.data.filaId ?? ''} onChange={(e) => atualizarDado('filaId', e.target.value)}><option value="">Selecione uma equipe</option>{filas.map((fila) => <option key={fila.id} value={fila.id}>{fila.nome}</option>)}</Select></Field>);
    partes.push(<CampoNumero key="timeout" label="Aguardar aceite (minutos)" min={0} value={node.data.timeoutMin ?? 1440} onChange={(value) => atualizarDado('timeoutMin', value)} />);
    partes.push(<p key="aviso" className="rounded-md bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800">Se alguém assumir a conversa, o prazo é cancelado. Sem aceite, o fluxo segue pela saída do prazo.</p>);
  }
  if (node.type === 'usuario') {
    partes.push(<Field key="usuario" label="Usuário que receberá"><Select value={node.data.usuarioId ?? ''} onChange={(e) => atualizarDado('usuarioId', e.target.value)}><option value="">Selecione um usuário</option>{usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nome} · {usuario.perfil}</option>)}</Select></Field>);
    partes.push(<p key="aviso" className="rounded-md bg-blue-50 p-2 text-[11px] leading-relaxed text-blue-800">A conversa será atribuída diretamente a este usuário e sai da fila compartilhada.</p>);
  }
  if (node.type === 'espera') partes.push(<CampoNumero key="minutos" label="Aguardar (minutos)" value={node.data.minutos ?? 60} onChange={(value) => atualizarDado('minutos', value)} />);
  if (node.type === 'finalizar') partes.push(<p key="finalizar" className="text-xs leading-relaxed text-slate-500">Encerra a conversa e registra o evento no histórico, sem atribuir a um atendente.</p>);
  if (node.type === 'inicio') partes.push(<p key="inicio" className="text-xs leading-relaxed text-slate-500">Ponto de entrada para uma nova conversa recebida neste número.</p>);
  return <div className="space-y-4">{partes}</div>;
}

export function EditorFluxoPage() {
  return <ReactFlowProvider><EditorConteudo /></ReactFlowProvider>;
}
