import { describe, expect, it } from 'vitest';
import type { EstruturaEsteira, FiltrosEsteira } from '../../lib/esteiraTypes';
import {
  LIMITE_FAVORITOS,
  apagarFavorito,
  estadoDaUrl,
  normalizarPreferencia,
  operacaoDoParametro,
  operacaoInicial,
  operacoesPermitidas,
  preferenciaPadrao,
  queryDosFiltros,
  quantosFiltros,
  salvarFavorito,
  urlDoEstado,
} from './estadoEsteira';

const etapa = (chave: string, tipo: 'NORMAL' | 'DESVIO' | 'SAIDA', ordem: number) => ({
  chave,
  nome: chave,
  tipo,
  ordem,
  papel: null,
  trilho: tipo === 'NORMAL' ? ordem : null,
  id: `id-${chave}`,
  diasParado: null,
  diasParadoEfetivo: tipo === 'SAIDA' ? null : 7,
  ativa: true,
});

const coluna = (chave: string, padrao: boolean, ordenavel = true) => ({
  chave,
  rotulo: chave,
  tipo: 'texto' as const,
  editavel: false,
  padrao,
  ordenavel,
});

const estrutura = {
  operacao: 'STARLINK',
  etapas: [
    etapa('SL_AGUARDANDO', 'NORMAL', 1),
    etapa('SL_EM_ATENDIMENTO', 'NORMAL', 2),
    etapa('SL_MEI', 'DESVIO', 3),
    etapa('SL_NURTURE', 'SAIDA', 4),
  ],
  colunas: [coluna('parceiro', true), coluna('cnpj', false), coluna('telefone', true, false), coluna('vsm', true)],
  motivosPerda: [],
  filtrosEspecificos: [],
  origens: [],
  nivel: 'EDICAO',
  podeForcar: false,
} as EstruturaEsteira;

describe('estado da esteira na URL', () => {
  it('urlDoEstado traz a visão e só os filtros preenchidos', () => {
    const url = urlDoEstado('lista', { ufs: ['GO'] });
    expect(url).toContain('visao=lista');
    expect(url).toContain('ufs=GO');
    expect(url).not.toContain('busca');
  });

  it('listas vão em CSV e os específicos achatados, no formato de parseFiltros', () => {
    const q = queryDosFiltros({
      ufs: ['GO', 'TO'],
      tim: { dep: ['TIM', 'BRADEL'], trafegoPago: false },
      starlink: { vsm: 'VAZIO' },
      paradoHaMaisDe: 0,
      busca: '  ',
      cidades: [],
    });
    expect(q.get('ufs')).toBe('GO,TO');
    expect(q.get('dep')).toBe('TIM,BRADEL');
    expect(q.get('trafegoPago')).toBe('false');
    expect(q.get('vsm')).toBe('VAZIO');
    expect(q.get('paradoHaMaisDe')).toBe('0');
    expect(q.has('busca')).toBe(false);
    expect(q.has('cidades')).toBe(false);
  });

  it('ida e volta preserva a visão e os filtros', () => {
    const filtros: FiltrosEsteira = {
      busca: 'maria, filha',
      responsavelIds: ['0b8f3a52-6a4e-4c8e-9b8e-0e6d9b1a2c3d'],
      ufs: ['GO', 'TO'],
      cidades: ['Goiânia', 'Palmas'],
      etapas: ['SL_MEI', 'SL_AGUARDANDO'],
      situacoes: ['EM_ANDAMENTO', 'NURTURE'],
      periodoCampo: 'estagioDesde',
      desde: '2026-01-01',
      ate: '2026-01-31',
      paradoHaMaisDe: 10,
      origem: ['WHATSAPP'],
      tim: { dep: ['PARCEIRO'], trafegoPago: true, vendaLiberada: false },
      starlink: { tipoCaptacao: ['LEAD_INBOUND'], vivensis: ['APROVADO', 'PENDENTE'], vsm: 'NAO' },
    };
    expect(estadoDaUrl(urlDoEstado('funil', filtros))).toEqual({ visao: 'funil', filtros });
    expect(estadoDaUrl(urlDoEstado('kanban', { ufs: ['GO'] }))).toEqual({ visao: 'kanban', filtros: { ufs: ['GO'] } });
  });

  it('sem parâmetros: nem visão nem filtros (vale a preferência)', () => {
    expect(estadoDaUrl('')).toEqual({});
    expect(estadoDaUrl('?visao=kanban')).toEqual({ visao: 'kanban' });
  });

  it('ignora valores inválidos da URL', () => {
    expect(estadoDaUrl('?visao=xpto&ufs=goias,GO&paradoHaMaisDe=abc&vsm=TALVEZ&desde=ontem&periodoCampo=x')).toEqual({
      filtros: { ufs: ['GO'] },
    });
  });
});

describe('preferência da esteira', () => {
  it('padrão: kanban, colunas padrão, desvios e saídas recolhidos', () => {
    const p = preferenciaPadrao(estrutura);
    expect(p.visao).toBe('kanban');
    expect(p.filtros).toEqual({});
    expect(p.lista.colunas).toEqual(['parceiro', 'telefone', 'vsm']);
    expect(p.lista.ordenacao).toBeNull();
    expect(p.kanban.recolhidas).toEqual(['SL_MEI', 'SL_NURTURE']);
    expect(p.favoritos).toEqual([]);
  });

  it('null ou lixo vira o padrão', () => {
    expect(normalizarPreferencia(null, estrutura)).toEqual(preferenciaPadrao(estrutura));
    expect(normalizarPreferencia('texto', estrutura)).toEqual(preferenciaPadrao(estrutura));
    expect(normalizarPreferencia([1, 2], estrutura)).toEqual(preferenciaPadrao(estrutura));
  });

  it('visão inválida volta a kanban; descarta colunas que não existem', () => {
    const p = normalizarPreferencia({ visao: 'xpto', lista: { colunas: ['naoExiste', 'cnpj'] } }, estrutura);
    expect(p.visao).toBe('kanban');
    expect(p.lista.colunas).toEqual(['cnpj']);
  });

  it('descarta etapas, larguras e ordenação que não valem nesta estrutura', () => {
    const p = normalizarPreferencia(
      {
        visao: 'lista',
        filtros: { etapas: ['TIM_CRED_OK', 'SL_MEI'], ufs: ['GO', 'xx'], paradoHaMaisDe: -3 },
        lista: {
          colunas: ['vsm', 'vsm', 'parceiro'],
          larguras: { vsm: 120, naoExiste: 90, parceiro: 'largo', cnpj: 99999 },
          ordenacao: { chave: 'telefone', direcao: 'asc' },
        },
        kanban: { recolhidas: ['SL_NURTURE', 'TIM_DESISTENCIA'], densidade: 'compacta', camposOcultos: ['cidade', 'xpto'] },
      },
      estrutura,
    );
    expect(p.visao).toBe('lista');
    expect(p.filtros).toEqual({ etapas: ['SL_MEI'], ufs: ['GO'] });
    expect(p.lista.colunas).toEqual(['vsm', 'parceiro']);
    expect(p.lista.larguras).toEqual({ vsm: 120, cnpj: 800 });
    // `telefone` não é ordenável.
    expect(p.lista.ordenacao).toBeNull();
    expect(p.kanban).toEqual({ recolhidas: ['SL_NURTURE'], densidade: 'compacta', camposOcultos: ['cidade'] });
  });

  it('colunas todas inválidas voltam às padrão; ordenação válida fica', () => {
    const p = normalizarPreferencia({ lista: { colunas: ['x'], ordenacao: { chave: 'vsm', direcao: 'desc' } } }, estrutura);
    expect(p.lista.colunas).toEqual(['parceiro', 'telefone', 'vsm']);
    expect(p.lista.ordenacao).toEqual({ chave: 'vsm', direcao: 'desc' });
  });

  it('favoritos: nome obrigatório, sem repetir nome, no máximo o limite', () => {
    const muitos = Array.from({ length: LIMITE_FAVORITOS + 5 }, (_, i) => ({ nome: `F${i}`, filtros: { ufs: ['GO'] } }));
    const p = normalizarPreferencia({ favoritos: [{ nome: ' ', filtros: {} }, { nome: 'F0', filtros: null }, ...muitos] }, estrutura);
    expect(p.favoritos).toHaveLength(LIMITE_FAVORITOS);
    expect(p.favoritos[0]).toEqual({ nome: 'F0', filtros: {} });
  });
});

describe('favoritos', () => {
  it('salvar acrescenta, substitui pelo nome e respeita o limite', () => {
    const um = salvarFavorito([], ' Goiás ', { ufs: ['GO'] });
    expect(um).toEqual([{ nome: 'Goiás', filtros: { ufs: ['GO'] } }]);
    const substituido = salvarFavorito(um as never, 'goiás', { ufs: ['TO'] });
    expect(substituido).toEqual([{ nome: 'goiás', filtros: { ufs: ['TO'] } }]);
    const cheio = Array.from({ length: LIMITE_FAVORITOS }, (_, i) => ({ nome: `F${i}`, filtros: {} }));
    expect(salvarFavorito(cheio, 'Novo', {})).toBe('LIMITE');
    expect(salvarFavorito(cheio, 'F3', { ufs: ['GO'] })).not.toBe('LIMITE');
    expect(salvarFavorito([], '  ', {})).toBe('SEM_NOME');
  });

  it('apagar remove pelo nome', () => {
    expect(apagarFavorito([{ nome: 'A', filtros: {} }, { nome: 'B', filtros: {} }], 'A')).toEqual([{ nome: 'B', filtros: {} }]);
  });
});

describe('operação da rota', () => {
  it('permitidas na ordem fixa, sem SEM_ACESSO', () => {
    expect(operacoesPermitidas({ STARLINK: 'LEITURA', TIM: 'EDICAO' })).toEqual(['TIM', 'STARLINK']);
    expect(operacoesPermitidas({ TIM: 'SEM_ACESSO', STARLINK: 'EDICAO' })).toEqual(['STARLINK']);
    expect(operacoesPermitidas(undefined)).toEqual([]);
  });

  it('parâmetro da URL sem diferenciar caixa', () => {
    expect(operacaoDoParametro('tim')).toBe('TIM');
    expect(operacaoDoParametro('StarLink')).toBe('STARLINK');
    expect(operacaoDoParametro('vivo')).toBeNull();
    expect(operacaoDoParametro(undefined)).toBeNull();
  });

  it('inicial: a última usada se ainda permitida, senão a primeira', () => {
    expect(operacaoInicial(['TIM', 'STARLINK'], { operacao: 'STARLINK' })).toBe('STARLINK');
    expect(operacaoInicial(['TIM'], { operacao: 'STARLINK' })).toBe('TIM');
    expect(operacaoInicial(['STARLINK'], 'lixo')).toBe('STARLINK');
    expect(operacaoInicial([], { operacao: 'TIM' })).toBeNull();
  });
});

describe('contagem de filtros', () => {
  it('conta cada filtro preenchido uma vez', () => {
    expect(quantosFiltros({})).toBe(0);
    expect(quantosFiltros({ ufs: ['GO', 'TO'], busca: 'x', tim: { dep: ['TIM'] }, desde: '2026-01-01', ate: '2026-01-02' })).toBe(4);
  });
});
