import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CampoAuditado } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { diferencasDaOportunidade, ordenarTrilha, type EventoAuditoria } from './auditoria';

/**
 * O risco desta funcao nao e quebrar — e gravar linha a mais ou a menos.
 * Linha a mais enche a trilha de ruido e esconde a mudanca real; linha a menos
 * faz a auditoria omitir exatamente o que alguem foi procurar.
 */
describe('diferencasDaOportunidade', () => {
  it('campo ausente no depois nao gera linha — ausente e "nao mandei", nao "apague"', () => {
    /*
     * O classico defeito de PATCH, aqui com o agravante de virar registro
     * permanente: sem esta regra, editar so o titulo registraria que o
     * responsavel e a previsao foram removidos.
     */
    const d = diferencasDaOportunidade(
      { TITULO: 'Antes', RESPONSAVEL: { id: 'u1', nome: 'Joao' }, PREVISAO_FECHAMENTO: '2026-10-01' },
      { TITULO: 'Depois' },
    );
    expect(d).toEqual([{ campo: 'TITULO', de: 'Antes', para: 'Depois' }]);
  });

  it('campo que nao mudou nao gera linha', () => {
    const d = diferencasDaOportunidade({ TITULO: 'Igual' }, { TITULO: 'Igual' });
    expect(d).toEqual([]);
  });

  it('nulo e um valor: limpar a previsao aparece', () => {
    const d = diferencasDaOportunidade(
      { PREVISAO_FECHAMENTO: '2026-10-01T00:00:00.000Z' },
      { PREVISAO_FECHAMENTO: null },
    );
    expect(d).toEqual([{ campo: 'PREVISAO_FECHAMENTO', de: '2026-10-01T00:00:00.000Z', para: null }]);
  });

  it('preencher o que estava vazio tambem aparece', () => {
    const d = diferencasDaOportunidade({ RESPONSAVEL: null }, { RESPONSAVEL: { id: 'u1', nome: 'Joao' } });
    expect(d).toEqual([{ campo: 'RESPONSAVEL', de: null, para: { id: 'u1', nome: 'Joao' } }]);
  });

  it('campo ausente no antes conta como nulo', () => {
    // Coluna nova, registro antigo: nao ha valor anterior, e "de: null" e a
    // verdade. Pular a linha esconderia a mudanca.
    const d = diferencasDaOportunidade({}, { MESES_RECORRENCIA: 12 });
    expect(d).toEqual([{ campo: 'MESES_RECORRENCIA', de: null, para: 12 }]);
  });

  it('referencia compara por id: renomear o usuario nao e edicao da oportunidade', () => {
    /*
     * Sem isso, um administrador corrigindo "Joao" para "Joao Silva" no cadastro
     * faria aparecer uma linha dizendo que o responsavel da oportunidade mudou —
     * uma mudanca que ninguem fez, na trilha que existe para responder quem fez o
     * que.
     */
    const d = diferencasDaOportunidade(
      { RESPONSAVEL: { id: 'u1', nome: 'Joao' } },
      { RESPONSAVEL: { id: 'u1', nome: 'Joao Silva' } },
    );
    expect(d).toEqual([]);
  });

  it('troca de responsavel aparece com o nome dos dois', () => {
    const d = diferencasDaOportunidade(
      { RESPONSAVEL: { id: 'u1', nome: 'Joao' } },
      { RESPONSAVEL: { id: 'u2', nome: 'Maria' } },
    );
    expect(d).toEqual([
      { campo: 'RESPONSAVEL', de: { id: 'u1', nome: 'Joao' }, para: { id: 'u2', nome: 'Maria' } },
    ]);
  });

  it('a proposta compara quantidade e total', () => {
    const d = diferencasDaOportunidade(
      { ITENS: { quantidade: 3, total: 1000 } },
      { ITENS: { quantidade: 4, total: 1200 } },
    );
    expect(d).toHaveLength(1);
    expect(d[0]!.campo).toBe('ITENS');
  });

  it('proposta reordenada com o mesmo total nao gera linha', () => {
    // Trocar a ordem das linhas, ou trocar um item por outro de mesmo preco, nao
    // muda o que a trilha sabe afirmar — e a alternativa seria registrar uma
    // "mudanca" que nao muda numero nenhum.
    const d = diferencasDaOportunidade(
      { ITENS: { quantidade: 2, total: 500 } },
      { ITENS: { quantidade: 2, total: 500 } },
    );
    expect(d).toEqual([]);
  });

  it('zero nao e nulo', () => {
    // `0` e falsy, e o caminho obvio (`de ?? null` numa comparacao por
    // veracidade) confundiria "valor zerado" com "campo vazio".
    const d = diferencasDaOportunidade({ VALOR_INFORMADO: 0 }, { VALOR_INFORMADO: null });
    expect(d).toEqual([{ campo: 'VALOR_INFORMADO', de: 0, para: null }]);
  });

  it('numero e o texto do mesmo numero sao mudanca', () => {
    // `'1000'` vindo de um cliente e `1000` do banco nao sao o mesmo dado, e
    // esconder a diferenca esconderia um defeito de quem chama.
    const d = diferencasDaOportunidade({ VALOR_INFORMADO: 1000 }, { VALOR_INFORMADO: '1000' });
    expect(d).toHaveLength(1);
  });

  it('varias mudancas de uma vez geram uma linha cada', () => {
    const d = diferencasDaOportunidade(
      { TITULO: 'A', MESES_RECORRENCIA: 12 },
      { TITULO: 'B', MESES_RECORRENCIA: 24 },
    );
    expect(d.map((x) => x.campo).sort()).toEqual(['MESES_RECORRENCIA', 'TITULO']);
  });
});

describe('ordenarTrilha', () => {
  const evento = (id: string, iso: string, tipo: EventoAuditoria['tipo'] = 'CAMPO'): EventoAuditoria => ({
    id,
    tipo,
    campo: tipo === 'CAMPO' ? 'TITULO' : null,
    de: null,
    para: null,
    autor: null,
    ocorridoEm: new Date(iso),
  });

  it('do mais recente para o mais antigo', () => {
    const t = ordenarTrilha([
      evento('a', '2026-09-01T10:00:00Z'),
      evento('b', '2026-09-03T10:00:00Z'),
      evento('c', '2026-09-02T10:00:00Z'),
    ]);
    expect(t.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('as duas fontes se intercalam pela data, nao ficam em blocos', () => {
    // Etapa e campo vem de tabelas diferentes; sem a ordenacao conjunta a tela
    // mostraria todas as etapas e depois todos os campos, e a historia sairia
    // trocada.
    const t = ordenarTrilha([
      evento('campo-antigo', '2026-09-01T10:00:00Z', 'CAMPO'),
      evento('etapa-nova', '2026-09-05T10:00:00Z', 'ETAPA'),
      evento('campo-novo', '2026-09-04T10:00:00Z', 'CAMPO'),
      evento('etapa-antiga', '2026-09-02T10:00:00Z', 'ETAPA'),
    ]);
    expect(t.map((e) => e.id)).toEqual(['etapa-nova', 'campo-novo', 'etapa-antiga', 'campo-antigo']);
  });

  it('empate no mesmo instante desempata por id, para a ordem nao variar entre execucoes', () => {
    // Acontece sempre que uma transacao grava etapa e campo juntos.
    const t = ordenarTrilha([
      evento('zz', '2026-09-01T10:00:00Z'),
      evento('aa', '2026-09-01T10:00:00Z'),
    ]);
    expect(t.map((e) => e.id)).toEqual(['aa', 'zz']);
  });

  it('nao muda a lista recebida', () => {
    const entrada = [evento('a', '2026-09-01T10:00:00Z'), evento('b', '2026-09-03T10:00:00Z')];
    ordenarTrilha(entrada);
    expect(entrada.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

/**
 * A guarda que faltava: campo auditado sem nome na tela.
 *
 * Este defeito ja custou duas correcoes iguais. Quando condicao de pagamento e
 * prazo de entrega entraram no enum, a linha do historico apareceu como
 * ": — → 10 dias uteis" — o servidor conhecia o campo e a tela nao. Quando
 * origem entrou, o mesmo: o teste de navegador falhou procurando "Origem" numa
 * trilha que mostrava "ORIGEM".
 *
 * O teste compara o enum do Prisma com a lista que o front usa para nomear os
 * campos. Nao e elegante ler o arquivo do outro pacote, mas o alternativo e
 * descobrir a falta pela terceira vez em producao — e o front nao pode importar
 * `@prisma/client`.
 */
describe('nomes dos campos auditados', () => {
  it('todo valor do enum tem rotulo no front', () => {
    // `process.cwd()` e nao `import.meta`: o tsc deste pacote usa CommonJS e
    // recusa `import.meta` (a mesma pedra do teste de multi-tenant). O vitest
    // roda a suite da raiz do repositorio.
    const arquivo = readFileSync(join(process.cwd(), 'apps', 'web', 'src', 'lib', 'types.ts'), 'utf8');
    const lista = /export const CAMPOS_AUDITADOS = \[([\s\S]*?)\] as const;/.exec(arquivo);
    expect(lista, 'CAMPOS_AUDITADOS nao encontrado em apps/web/src/lib/types.ts').not.toBeNull();

    const noFront = [...lista![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    const noBanco = Object.values(CampoAuditado);

    // Ordenados nos dois lados: a ordem da lista e do enum nao precisa bater —
    // o que precisa bater e o conjunto.
    expect([...noFront].sort()).toEqual([...noBanco].sort());
  });
});
