import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Analise da ligacao com o Ollama simulado. O que se prova: texto curto segue na
 * chamada unica; texto longo vai em blocos que cabem na janela, e a transcricao
 * do Whisper nunca e reescrita; falha do Ollama sobe como erro (o job tenta de novo).
 */

vi.mock('../../env', () => ({
  env: {
    LIGACAO_IA_OLLAMA_URL: 'http://ollama.test:11434',
    LIGACAO_IA_OLLAMA_MODELO: 'qwen3:4b',
    OPORTUNIDADE_IA_OLLAMA_MODELO: 'qwen3:4b',
    LIGACAO_IA_NUM_CTX: 8192,
  },
}));

import { analisarTranscricaoLocal, dividirEmBlocos, numerosForaDaTranscricao } from './analise-local.service';

type Corpo = { options: { num_ctx: number }; messages: { role: string; content: string }[] };
const chamadas: Corpo[] = [];

function ollamaResponde(conteudoPorChamada: (n: number) => object) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    chamadas.push(JSON.parse(String((init as RequestInit).body)));
    return new Response(
      JSON.stringify({ message: { content: JSON.stringify(conteudoPorChamada(chamadas.length)) }, prompt_eval_count: 100, eval_count: 20 }),
      { status: 200 },
    );
  });
}

const parcial = { resumo: 'Cliente quer saber o prazo de entrega.', sentimento: 'NEUTRO', proximasAcoes: ['Enviar prazo'] };
beforeEach(() => {
  chamadas.length = 0;
  vi.restoreAllMocks();
});

describe('dividirEmBlocos', () => {
  it('nenhum bloco passa do limite e nada se perde', () => {
    const texto = Array.from({ length: 400 }, (_, i) => `Cliente: fala número ${i} com algum texto de preenchimento`).join('\n');
    const blocos = dividirEmBlocos(texto, 1000);
    expect(blocos.length).toBeGreaterThan(5);
    for (const b of blocos) expect(b.length).toBeLessThanOrEqual(1000);
    expect(blocos.join('\n').replace(/\s+/g, ' ')).toBe(texto.replace(/\s+/g, ' '));
  });

  it('quebra na fala (linha), nao no meio dela', () => {
    const blocos = dividirEmBlocos('Cliente: um dois três\nAtendente: quatro cinco seis\nCliente: sete', 40);
    expect(blocos).toEqual(['Cliente: um dois três', 'Atendente: quatro cinco seis', 'Cliente: sete']);
  });

  it('linha unica maior que o bloco e cortada em espaco', () => {
    const blocos = dividirEmBlocos('palavra '.repeat(400).trim(), 500);
    for (const b of blocos) {
      expect(b.length).toBeLessThanOrEqual(500);
      expect(b.startsWith('palavra')).toBe(true);
      expect(b.endsWith('palavra')).toBe(true);
    }
  });
});

describe('analisarTranscricaoLocal', () => {
  it('texto curto: uma unica chamada de resumo, e a transcricao sai exatamente como entrou', async () => {
    ollamaResponde(() => parcial);
    const r = await analisarTranscricaoLocal('Cliente: oi, quero saber o prazo.');
    expect(chamadas).toHaveLength(1);
    expect(r.resumo).toBe(parcial.resumo);
    expect(r.transcricaoCorrigida).toBe('Cliente: oi, quero saber o prazo.');
    expect(r.correcoesAplicadas).toEqual([]);
  });

  it('o modelo nunca e instruido a reescrever a transcricao', async () => {
    ollamaResponde(() => parcial);
    await analisarTranscricaoLocal('Cliente: oi.');
    const pedido = JSON.stringify(chamadas[0]);
    expect(pedido).not.toMatch(/transcricaoCorrigida|Corrija erros|corrigid/i);
  });

  it('texto longo: um resumo por bloco mais o final, cada chamada pequena, janela configurada', async () => {
    ollamaResponde(() => parcial);
    const longo = Array.from({ length: 600 }, (_, i) => `Cliente: fala ${i} sobre entrega e pagamento do equipamento`).join('\n');
    const r = await analisarTranscricaoLocal(longo);
    const blocos = dividirEmBlocos(longo);
    expect(blocos.length).toBeGreaterThan(1);
    expect(chamadas).toHaveLength(blocos.length + 1);
    for (const c of chamadas) {
      expect(c.options.num_ctx).toBe(8192);
      expect(c.messages.map((m) => m.content).join('').length).toBeLessThan(8000);
    }
    expect(r.motor).toContain('blocos');
  });

  it('texto longo: a transcricao devolvida e a original, sem reescrita', async () => {
    ollamaResponde(() => parcial);
    const longo = 'Cliente: palavra exata do cliente.\n'.repeat(400);
    const r = await analisarTranscricaoLocal(longo);
    expect(r.transcricaoCorrigida).toBe(longo);
    expect(r.trechosIncertos).toEqual([]);
    expect(r.correcoesAplicadas).toEqual([]);
  });

  it('texto longo: limita as proximas acoes a 8 e soma o consumo', async () => {
    ollamaResponde((n) => (n === 1 ? parcial : { ...parcial, proximasAcoes: Array.from({ length: 15 }, (_, i) => `Ação ${i + 1}`) }));
    const longo = 'Cliente: texto de teste.\n'.repeat(600);
    const r = await analisarTranscricaoLocal(longo);
    expect(r.proximasAcoes.length).toBeLessThanOrEqual(8);
    expect(r.unidades).toBe(chamadas.length * 120);
  });

  it('as instrucoes proibem adivinhar palavra duvidosa', async () => {
    ollamaResponde(() => parcial);
    await analisarTranscricaoLocal('Cliente: texto.\n'.repeat(600));
    const sistema = chamadas[0]!.messages[0]!.content;
    expect(sistema).toMatch(/Nunca adivinhe/);
    expect(sistema).toMatch(/provavelmente/);
  });

  it('Ollama fora: o erro sobe (o job tenta de novo), sem resumo parcial', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(analisarTranscricaoLocal('Cliente: texto.\n'.repeat(600))).rejects.toThrow(/Ollama indisponível/);
  });

  it('Ollama devolve resumo invalido em um bloco: erro claro', async () => {
    ollamaResponde(() => ({ resumo: '', sentimento: 'NEUTRO', proximasAcoes: [] }));
    await expect(analisarTranscricaoLocal('Cliente: texto.\n'.repeat(600))).rejects.toThrow(/formato inválido/);
  });
});

describe('conferencia de numeros do resumo', () => {
  it('detecta numero que o resumo trocou (18000 virou 1800) e ignora o que existe na transcricao', () => {
    const fala = 'Cliente: dois de 18000 BTUs e o pedido 4821, total de 12.000 reais, em trinta dias.';
    expect(numerosForaDaTranscricao('Pedido 4821 com dois de 1800 BTUs', fala)).toEqual(['1800']);
    expect(numerosForaDaTranscricao('Pedido 4821, 18000 BTUs e 12000 reais', fala)).toEqual([]);
    expect(numerosForaDaTranscricao('pagamento em 30 dias, 3 aparelhos', fala)).toEqual([]); // < 3 digitos: nao confere
  });

  it('numero trocado: repete a chamada uma vez avisando quais numeros nao existem', async () => {
    const fala = 'Cliente: quero dois aparelhos de 18000 BTUs.';
    ollamaResponde((n) => ({ ...parcial, resumo: n === 1 ? 'Cliente quer dois de 1800 BTUs.' : 'Cliente quer dois de 18000 BTUs.' }));
    const r = await analisarTranscricaoLocal(fala);
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1]!.messages[0]!.content).toMatch(/1800.*NÃO estão na transcrição/);
    expect(r.resumo).toBe('Cliente quer dois de 18000 BTUs.');
  });

  it('numero trocado mesmo na segunda tentativa: o resumo avisa para conferir o audio', async () => {
    ollamaResponde(() => ({ ...parcial, resumo: 'Cliente quer dois de 1800 BTUs.' }));
    const r = await analisarTranscricaoLocal('Cliente: quero dois aparelhos de 18000 BTUs.');
    expect(chamadas).toHaveLength(2);
    expect(r.resumo).toMatch(/Conferir no áudio.*1800/);
  });

  it('resumo coerente: nenhuma repeticao de chamada', async () => {
    ollamaResponde(() => ({ ...parcial, resumo: 'Cliente quer dois de 18000 BTUs.' }));
    await analisarTranscricaoLocal('Cliente: quero dois aparelhos de 18000 BTUs.');
    expect(chamadas).toHaveLength(1);
  });
});
