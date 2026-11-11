import test from 'node:test';
import assert from 'node:assert/strict';
import { BYTES_POR_SEGUNDO, contarPalavras, dividirEmTrechos, dividirTexto, estimarConfianca, fracaoAtiva, juntarFalas, montarWav, pontoDeCorte } from './analise-chamada.mjs';

const silencio = (seg) => Buffer.alloc(seg * BYTES_POR_SEGUNDO);
function tom(seg, amp = 5000) {
  const b = Buffer.alloc(seg * BYTES_POR_SEGUNDO);
  for (let i = 0; i < b.length; i += 2) b.writeInt16LE(Math.round(amp * Math.sin(i / 20)), i);
  return b;
}

test('trecho nunca passa de 270 s e cobre o áudio todo sem sobra nem repetição', () => {
  const pcm = tom(600);
  const trechos = dividirEmTrechos(pcm);
  assert.ok(trechos.length >= 3);
  assert.equal(trechos[0][0], 0);
  assert.equal(trechos.at(-1)[1], pcm.length);
  trechos.forEach(([a, b], i) => {
    assert.ok(b - a <= 270 * BYTES_POR_SEGUNDO);
    if (i) assert.equal(a, trechos[i - 1][1]);
    assert.equal(a % 2, 0);
  });
});

test('áudio curto vira um trecho só; resto pequeno é absorvido pelo último', () => {
  assert.equal(dividirEmTrechos(tom(60)).length, 1);
  assert.equal(dividirEmTrechos(tom(250)).length, 1);
});

test('corta na pausa, não no meio da fala', () => {
  const pcm = Buffer.concat([tom(100), silencio(1), tom(200)]);
  const corte = pontoDeCorte(pcm, 98 * BYTES_POR_SEGUNDO);
  assert.ok(corte >= 100 * BYTES_POR_SEGUNDO - 4 && corte <= 101 * BYTES_POR_SEGUNDO + 4, String(corte / BYTES_POR_SEGUNDO));
});

test('faixa muda tem fração ativa 0 e faixa com fala, alta', () => {
  assert.equal(fracaoAtiva(silencio(10)), 0);
  assert.ok(fracaoAtiva(tom(10)) > 0.9);
});

test('wav montado tem cabeçalho correto', () => {
  const w = montarWav(tom(1));
  assert.equal(w.toString('ascii', 0, 4), 'RIFF');
  assert.equal(w.readUInt32LE(24), 16000);
  assert.equal(w.length, 44 + BYTES_POR_SEGUNDO);
});

test('junta as faixas em ordem de tempo e une falas seguidas da mesma pessoa', () => {
  const texto = juntarFalas([
    { quem: 'Atendente', inicio: 6, fim: 8, texto: 'Qual o modelo?' },
    { quem: 'Cliente', inicio: 0, fim: 2, texto: 'Bom dia,' },
    { quem: 'Cliente', inicio: 2.5, fim: 5, texto: 'preciso de um ar-condicionado.' },
  ]);
  assert.equal(texto, 'Cliente: Bom dia, preciso de um ar-condicionado.\n\nAtendente: Qual o modelo?');
});

test('confiança: pouca fala é BAIXA; métricas ruins BAIXA; risco MEDIA; limpo ALTA', () => {
  assert.equal(estimarConfianca([{ avgLogprob: -0.1, noSpeechProb: 0 }], 5), 'BAIXA');
  assert.equal(estimarConfianca([{ avgLogprob: -1.2, noSpeechProb: 0 }], 80), 'BAIXA');
  assert.equal(estimarConfianca([{ avgLogprob: -0.6, noSpeechProb: 0 }], 80), 'MEDIA');
  assert.equal(estimarConfianca([{ avgLogprob: -0.2, noSpeechProb: 0.01 }], 80), 'ALTA');
});

test('divide texto grande entre falas, sem perder conteúdo', () => {
  const falas = Array.from({ length: 40 }, (_, i) => `Cliente: fala número ${i} ${'x'.repeat(300)}`);
  const blocos = dividirTexto(falas.join('\n\n'), 3000);
  assert.ok(blocos.length > 3);
  assert.ok(blocos.every((b) => b.length <= 3000));
  assert.equal(blocos.join('\n\n'), falas.join('\n\n'));
  assert.equal(contarPalavras('Olá, tudo bem? 2026'), 4);
});
