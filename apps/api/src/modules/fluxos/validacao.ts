import { badRequest } from '../../lib/errors';

export const TIPOS_NO = ['inicio', 'texto', 'imagem', 'audio', 'documento', 'video', 'menu', 'equipe', 'usuario', 'espera', 'finalizar'] as const;
export type TipoNoFluxo = (typeof TIPOS_NO)[number];

export type NoFluxo = {
  id: string;
  type: TipoNoFluxo;
  position?: { x: number; y: number };
  data: Record<string, unknown>;
};

export type ArestaFluxo = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};

export type GrafoFluxo = { nodes: NoFluxo[]; edges: ArestaFluxo[] };

export function lerGrafo(valor: unknown): GrafoFluxo {
  if (!valor || typeof valor !== 'object') throw badRequest('O fluxo precisa ter nós e conexões');
  const grafo = valor as Partial<GrafoFluxo>;
  if (!Array.isArray(grafo.nodes) || !Array.isArray(grafo.edges)) {
    throw badRequest('O fluxo precisa ter nós e conexões');
  }
  return grafo as GrafoFluxo;
}

export function validarGrafo(grafo: GrafoFluxo) {
  if (grafo.nodes.length < 2) throw badRequest('Adicione pelo menos um bloco ao Início');
  if (grafo.nodes.length > 100) throw badRequest('O fluxo pode ter no máximo 100 blocos');
  if (grafo.edges.length > 200) throw badRequest('O fluxo pode ter no máximo 200 conexões');

  const ids = new Set<string>();
  for (const node of grafo.nodes) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !node.id.trim() || ids.has(node.id)) {
      throw badRequest('Há blocos sem identificador ou com identificador repetido');
    }
    ids.add(node.id);
    if (!TIPOS_NO.includes(node.type)) throw badRequest(`Tipo de bloco não suportado: ${String(node.type)}`);
    if (!node.data || typeof node.data !== 'object' || Array.isArray(node.data)) {
      throw badRequest(`Configure o bloco ${node.id}`);
    }
  }

  const inicios = grafo.nodes.filter((node) => node.type === 'inicio');
  if (inicios.length !== 1) throw badRequest('O fluxo precisa ter exatamente um bloco Início');

  const arestas = new Set<string>();
  const saidasPorHandle = new Set<string>();
  for (const edge of grafo.edges) {
    if (!edge || typeof edge !== 'object' || typeof edge.source !== 'string' || typeof edge.target !== 'string' ||
        !ids.has(edge.source) || !ids.has(edge.target)) {
      throw badRequest('Há uma conexão apontando para um bloco removido');
    }
    if (edge.sourceHandle != null && typeof edge.sourceHandle !== 'string') throw badRequest('Uma conexão tem uma saída inválida');
    const handleKey = `${edge.source}:${edge.sourceHandle || 'next'}`;
    if (saidasPorHandle.has(handleKey)) throw badRequest('Cada saída pode apontar para apenas um próximo bloco');
    saidasPorHandle.add(handleKey);
    const chave = `${edge.source}:${edge.sourceHandle ?? 'next'}:${edge.target}`;
    if (arestas.has(chave)) throw badRequest('Há conexões duplicadas entre blocos');
    arestas.add(chave);
  }

  const saidas = new Map<string, Set<string>>();
  for (const edge of grafo.edges) {
    const lista = saidas.get(edge.source) ?? new Set<string>();
    lista.add(edge.sourceHandle || 'next');
    saidas.set(edge.source, lista);
  }
  for (const edge of grafo.edges) {
    const source = grafo.nodes.find((node) => node.id === edge.source)!;
    const handle = edge.sourceHandle || 'next';
    const permitted = source.type === 'menu'
      ? new Set([...(Array.isArray(source.data.opcoes) ? source.data.opcoes.map((item: any) => item?.id).filter((id: unknown): id is string => typeof id === 'string') : []), ...(minutos(source.data.timeoutMin) > 0 ? ['timeout'] : [])])
      : source.type === 'equipe'
        ? new Set(['next', ...(minutos(source.data.timeoutMin) > 0 ? ['timeout'] : [])])
        : source.type === 'espera'
          ? new Set(['timeout'])
          : new Set(['next']);
    if (!permitted.has(handle)) throw badRequest(`A saída "${handle}" não é válida no bloco ${source.data.nome || source.id}`);
  }
  const exigeSaida = (node: NoFluxo, handle: string, label: string) => {
    if (!saidas.get(node.id)?.has(handle)) throw badRequest(`Conecte a saída “${label}” do bloco ${node.data.nome || node.id}`);
  };

  for (const node of grafo.nodes) {
    const data = node.data;
    if (node.type === 'inicio' || node.type === 'texto' || node.type === 'imagem' || node.type === 'audio' || node.type === 'documento' || node.type === 'video') exigeSaida(node, 'next', 'Próximo passo');
    if (node.type === 'texto' && !texto(data.texto)) throw badRequest(`Preencha o texto do bloco ${data.nome || node.id}`);
    if (['imagem', 'audio', 'documento', 'video'].includes(node.type) && !texto(data.midiaId)) {
      throw badRequest(`Selecione um arquivo no bloco ${data.nome || node.id}`);
    }
    if (node.type === 'menu') {
      if (!texto(data.texto)) throw badRequest(`Preencha a mensagem do menu ${data.nome || node.id}`);
      if (!Array.isArray(data.opcoes) || data.opcoes.length < 1 || data.opcoes.length > 10) {
        throw badRequest(`O menu ${data.nome || node.id} precisa ter de 1 a 10 opções`);
      }
      const idsOpcoes = new Set<string>();
      for (const opcao of data.opcoes as Array<{ id?: unknown; label?: unknown }>) {
        if (!opcao || typeof opcao !== 'object' || typeof opcao.id !== 'string' || !opcao.id || typeof opcao.label !== 'string' || !opcao.label.trim()) {
          throw badRequest(`Preencha todas as opções do menu ${data.nome || node.id}`);
        }
        if (idsOpcoes.has(opcao.id)) throw badRequest(`Há opções repetidas no menu ${data.nome || node.id}`);
        idsOpcoes.add(opcao.id);
        exigeSaida(node, opcao.id, opcao.label);
      }
      if (minutos(data.timeoutMin) > 0) exigeSaida(node, 'timeout', 'Sem resposta');
    }
    if (node.type === 'equipe' && minutos(data.timeoutMin) > 0) exigeSaida(node, 'timeout', 'Prazo vencido');
    if (node.type === 'espera') {
      if (minutos(data.minutos) < 1) throw badRequest(`Defina o prazo do bloco ${data.nome || node.id}`);
      exigeSaida(node, 'timeout', 'Prazo vencido');
    }
  }
}

export const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');
export const minutos = (valor: unknown): number => (typeof valor === 'number' && Number.isFinite(valor) ? Math.floor(valor) : 0);

export function proximoNo(grafo: GrafoFluxo, nodeId: string, handle = 'next') {
  return grafo.edges.find((edge) => edge.source === nodeId && (edge.sourceHandle || 'next') === handle)?.target ?? null;
}

export function inicioDoFluxo(grafo: GrafoFluxo) {
  return grafo.nodes.find((node) => node.type === 'inicio')!;
}

export function obterNo(grafo: GrafoFluxo, id: string) {
  return grafo.nodes.find((node) => node.id === id) ?? null;
}
