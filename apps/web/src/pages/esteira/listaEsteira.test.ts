import { describe, expect, it } from 'vitest';
import type { ColunaEsteira } from '../../lib/esteiraTypes';
import {
  LIMITE_SELECAO,
  alternarColuna,
  alternarPagina,
  alternarSelecao,
  chavesParaExportar,
  pedidoDeExportacao,
  colunasVisiveis,
  formatarCelula,
  larguraLimitada,
  montarPatchDeEdicao,
  proximaOrdenacao,
  reordenarColunas,
} from './listaEsteira';

const col = (c: Partial<ColunaEsteira> & Pick<ColunaEsteira, 'chave' | 'tipo'>): ColunaEsteira => ({
  rotulo: c.chave,
  editavel: false,
  padrao: false,
  ordenavel: false,
  ...c,
});

const COLUNAS: ColunaEsteira[] = [
  col({ chave: 'parceiro', tipo: 'texto', padrao: true, ordenavel: true }),
  col({ chave: 'responsavel', tipo: 'texto', editavel: true, campo: 'responsavelId', padrao: true, ordenavel: true }),
  col({ chave: 'observacoes', tipo: 'texto', editavel: true, campo: 'observacoes' }),
  col({ chave: 'vsm', tipo: 'booleano3', editavel: true, campo: 'campos.vsm', padrao: true, ordenavel: true }),
  col({ chave: 'ehParceiro', tipo: 'booleano3', editavel: true, campo: 'campos.parceiro' }),
  col({ chave: 'flagTrafegoPago', tipo: 'booleano', editavel: true, campo: 'campos.flagTrafegoPago' }),
  col({
    chave: 'dep',
    tipo: 'enum',
    opcoes: [
      { valor: 'TIM', rotulo: 'TIM' },
      { valor: 'PARCEIRO', rotulo: 'Parceiro' },
    ],
    editavel: true,
    campo: 'campos.dep',
  }),
  col({ chave: 'ultimaInteracaoEm', tipo: 'data' }),
  col({ chave: 'diasNaEtapa', tipo: 'numero' }),
  col({ chave: 'origem', tipo: 'enum', opcoes: [{ valor: 'MANUAL', rotulo: 'Manual' }] }),
];
const porChave = (k: string) => COLUNAS.find((c) => c.chave === k)!;

describe('formatarCelula', () => {
  it('vazio vira travessão em qualquer tipo', () => {
    for (const c of COLUNAS) {
      expect(formatarCelula(c, null)).toBe('—');
    }
    expect(formatarCelula(porChave('parceiro'), '   ')).toBe('—');
  });

  it('booleano3: Sim/Não, e nulo nunca é Não', () => {
    expect(formatarCelula(porChave('vsm'), true)).toBe('Sim');
    expect(formatarCelula(porChave('vsm'), false)).toBe('Não');
    expect(formatarCelula(porChave('vsm'), null)).toBe('—');
  });

  it('booleano: Sim/Não', () => {
    expect(formatarCelula(porChave('flagTrafegoPago'), true)).toBe('Sim');
    expect(formatarCelula(porChave('flagTrafegoPago'), false)).toBe('Não');
  });

  it('enum usa o rótulo da opção; valor desconhecido passa como está', () => {
    expect(formatarCelula(porChave('dep'), 'PARCEIRO')).toBe('Parceiro');
    expect(formatarCelula(porChave('dep'), 'OUTRO')).toBe('OUTRO');
  });

  it('data no dia de Brasília', () => {
    // 02:00 UTC do dia 3 ainda é dia 2 em Brasília.
    expect(formatarCelula(porChave('ultimaInteracaoEm'), '2026-10-03T02:00:00.000Z')).toBe('02/10/2026');
    expect(formatarCelula(porChave('ultimaInteracaoEm'), 'lixo')).toBe('—');
  });

  it('número em pt-BR', () => {
    expect(formatarCelula(porChave('diasNaEtapa'), 1234)).toBe('1.234');
    expect(formatarCelula(porChave('diasNaEtapa'), 0)).toBe('0');
  });
});

describe('proximaOrdenacao', () => {
  it('coluna nova começa crescente; depois decrescente; depois sem ordenação', () => {
    const a = proximaOrdenacao(null, 'parceiro');
    expect(a).toEqual({ chave: 'parceiro', direcao: 'asc' });
    const b = proximaOrdenacao(a, 'parceiro');
    expect(b).toEqual({ chave: 'parceiro', direcao: 'desc' });
    expect(proximaOrdenacao(b, 'parceiro')).toBeNull();
  });

  it('trocar de coluna recomeça crescente', () => {
    expect(proximaOrdenacao({ chave: 'parceiro', direcao: 'desc' }, 'uf')).toEqual({ chave: 'uf', direcao: 'asc' });
  });
});

describe('reordenarColunas', () => {
  const lista = ['a', 'b', 'c', 'd'];
  it('leva a coluna para a posição da outra (para frente e para trás)', () => {
    expect(reordenarColunas(lista, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(reordenarColunas(lista, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });
  it('subir/descer uma posição é trocar com a vizinha', () => {
    expect(reordenarColunas(lista, 'c', 'b')).toEqual(['a', 'c', 'b', 'd']);
    expect(reordenarColunas(lista, 'b', 'c')).toEqual(['a', 'c', 'b', 'd']);
  });
  it('chave ausente ou igual devolve a mesma ordem (sem mutar)', () => {
    expect(reordenarColunas(lista, 'x', 'a')).toEqual(lista);
    expect(reordenarColunas(lista, 'a', 'x')).toEqual(lista);
    expect(reordenarColunas(lista, 'b', 'b')).toEqual(lista);
    expect(lista).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('alternarColuna', () => {
  it('mostrar acrescenta no fim; ocultar tira', () => {
    expect(alternarColuna(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(alternarColuna(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('nunca deixa a lista sem coluna', () => {
    expect(alternarColuna(['a'], 'a')).toEqual(['a']);
  });
});

describe('colunasVisiveis', () => {
  it('segue a ordem da preferência e ignora chaves que não existem', () => {
    expect(colunasVisiveis(['vsm', 'zzz', 'parceiro'], COLUNAS).map((c) => c.chave)).toEqual(['vsm', 'parceiro']);
  });
  it('sem nenhuma válida, cai nas padrão', () => {
    expect(colunasVisiveis(['zzz'], COLUNAS).map((c) => c.chave)).toEqual(['parceiro', 'responsavel', 'vsm']);
  });
});

describe('larguraLimitada', () => {
  it('arredonda e limita entre 60 e 800 px', () => {
    expect(larguraLimitada(10)).toBe(60);
    expect(larguraLimitada(5000)).toBe(800);
    expect(larguraLimitada(123.6)).toBe(124);
    expect(larguraLimitada(Number.NaN)).toBe(60);
  });
});

describe('montarPatchDeEdicao', () => {
  it('responsável e observações vão no topo do corpo', () => {
    expect(montarPatchDeEdicao(porChave('responsavel'), 'u1')).toEqual({ responsavelId: 'u1' });
    expect(montarPatchDeEdicao(porChave('responsavel'), null)).toEqual({ responsavelId: null });
    expect(montarPatchDeEdicao(porChave('observacoes'), '  oi  ')).toEqual({ observacoes: 'oi' });
  });

  it('campos da operação vão em `campos` com o nome do campo (não a chave da coluna)', () => {
    expect(montarPatchDeEdicao(porChave('ehParceiro'), true)).toEqual({ campos: { parceiro: true } });
    expect(montarPatchDeEdicao(porChave('vsm'), null)).toEqual({ campos: { vsm: null } });
    expect(montarPatchDeEdicao(porChave('dep'), 'TIM')).toEqual({ campos: { dep: 'TIM' } });
  });

  it('texto vazio vira nulo; enum vazio vira nulo', () => {
    expect(montarPatchDeEdicao(porChave('observacoes'), '   ')).toEqual({ observacoes: null });
    expect(montarPatchDeEdicao(porChave('dep'), '')).toEqual({ campos: { dep: null } });
  });

  it('booleano não aceita nulo; enum fora das opções é recusado', () => {
    expect(montarPatchDeEdicao(porChave('flagTrafegoPago'), null)).toBeNull();
    expect(montarPatchDeEdicao(porChave('flagTrafegoPago'), false)).toEqual({ campos: { flagTrafegoPago: false } });
    expect(montarPatchDeEdicao(porChave('dep'), 'BRADEL')).toBeNull();
  });

  it('coluna não editável ou sem campo não gera corpo', () => {
    expect(montarPatchDeEdicao(porChave('parceiro'), 'x')).toBeNull();
    expect(montarPatchDeEdicao({ ...porChave('vsm'), campo: undefined }, true)).toBeNull();
  });
});

describe('chavesParaExportar', () => {
  it('as colunas visíveis, na ordem, só as que existem', () => {
    expect(chavesParaExportar(['vsm', 'zzz', 'parceiro', 'vsm'], COLUNAS)).toEqual(['vsm', 'parceiro']);
  });
  it('sem nenhuma válida, as padrão', () => {
    expect(chavesParaExportar([], COLUNAS)).toEqual(['parceiro', 'responsavel', 'vsm']);
  });
});

describe('seleção para exportar', () => {
  it('alternar marca e desmarca um id, sem mudar o conjunto original', () => {
    const vazio = new Set<string>();
    const um = alternarSelecao(vazio, 'a');
    expect([...um]).toEqual(['a']);
    expect(vazio.size).toBe(0);
    expect([...alternarSelecao(um, 'a')]).toEqual([]);
  });

  it('marcar a página acrescenta os dela (mantém os de outras páginas); desmarcar tira só os dela', () => {
    const outras = new Set(['x']);
    const marcada = alternarPagina(outras, ['a', 'b'], true);
    expect([...marcada].sort()).toEqual(['a', 'b', 'x']);
    expect([...alternarPagina(marcada, ['a', 'b'], false)]).toEqual(['x']);
  });

  it(`não passa de ${LIMITE_SELECAO} selecionados`, () => {
    const cheio = new Set(Array.from({ length: LIMITE_SELECAO }, (_, i) => `id${i}`));
    expect(alternarSelecao(cheio, 'novo').size).toBe(LIMITE_SELECAO);
    expect(alternarSelecao(cheio, 'id0').size).toBe(LIMITE_SELECAO - 1);
    const quase = new Set(Array.from({ length: LIMITE_SELECAO - 1 }, (_, i) => `id${i}`));
    expect(alternarPagina(quase, ['p1', 'p2', 'p3'], true).size).toBe(LIMITE_SELECAO);
  });

  it('pedido de exportação: sem seleção, filtros + colunas + ordenação na query e sem corpo', () => {
    const p = pedidoDeExportacao({
      query: 'ufs=GO',
      formato: 'xlsx',
      colunas: ['parceiro', 'vsm'],
      ordenacao: { chave: 'parceiro', direcao: 'desc' },
      selecionados: new Set(),
    });
    const q = new URLSearchParams(p.query);
    expect(q.get('ufs')).toBe('GO');
    expect(q.get('formato')).toBe('xlsx');
    expect(q.get('colunas')).toBe('parceiro,vsm');
    expect(q.get('ordenarPor')).toBe('parceiro');
    expect(q.get('direcao')).toBe('desc');
    expect(p.corpo).toBeUndefined();
  });

  it('pedido de exportação: com seleção, os ids vão no corpo (em AND com os filtros da query)', () => {
    const p = pedidoDeExportacao({ query: 'ufs=GO', formato: 'csv', colunas: ['parceiro'], ordenacao: null, selecionados: new Set(['b', 'a']) });
    expect(new URLSearchParams(p.query).get('ufs')).toBe('GO');
    expect(new URLSearchParams(p.query).has('ids')).toBe(false);
    expect(p.corpo).toEqual({ ids: ['b', 'a'] });
  });
});
