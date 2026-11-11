// Lógica pura da análise de chamadas longas: divide o áudio em trechos que o Whisper aceita,
// ignora silêncio (onde o Whisper inventa texto), junta as faixas em ordem cronológica e
// quebra conversas grandes para o resumo caber no contexto do modelo local.

export const TAXA = 16000;
export const BYTES_POR_SEGUNDO = TAXA * 2; // mono, 16 bits
// 240 s = 7,7 MB: abaixo do limite de 10 MB do serviço Whisper. A variável existe para testar a divisão com áudio curto.
export const TRECHO_MAX_SEG = Number(process.env.WEBJS_TRECHO_MAX_SEG) || 240;
const RESTO_MIN_SEG = 30;
const FOLGA_CORTE_SEG = 8;

export function montarWav(pcm, canais = 1) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(canais, 22); header.writeUInt32LE(TAXA, 24);
  header.writeUInt32LE(BYTES_POR_SEGUNDO * canais, 28); header.writeUInt16LE(2 * canais, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function rms(pcm, inicio, fim) {
  let soma = 0; let n = 0;
  for (let i = inicio; i + 1 < fim; i += 2) { const v = pcm.readInt16LE(i); soma += v * v; n += 1; }
  return n ? Math.sqrt(soma / n) : 0;
}

/** Fração de janelas de 0,5 s com energia de fala. Faixa quase muda faz o Whisper inventar texto. */
export function fracaoAtiva(pcm, limiar = 300) {
  const janela = BYTES_POR_SEGUNDO / 2;
  let total = 0; let ativas = 0;
  for (let i = 0; i + janela <= pcm.length; i += janela) { total += 1; if (rms(pcm, i, i + janela) > limiar) ativas += 1; }
  return total ? ativas / total : 0;
}

/** Corta na pausa mais silenciosa perto do alvo, para não partir uma palavra ao meio. */
export function pontoDeCorte(pcm, alvo, folgaSeg = FOLGA_CORTE_SEG) {
  const janela = Math.round(BYTES_POR_SEGUNDO / 10); // 100 ms
  const de = Math.max(0, alvo - folgaSeg * BYTES_POR_SEGUNDO);
  const ate = Math.min(pcm.length - janela, alvo + folgaSeg * BYTES_POR_SEGUNDO);
  let melhor = alvo; let menor = Infinity;
  for (let i = de - (de % 2); i <= ate; i += janela) {
    const energia = rms(pcm, i, i + janela);
    if (energia < menor) { menor = energia; melhor = i; }
  }
  return melhor - (melhor % 2);
}

/** Intervalos [inicio, fim) em bytes; nenhum passa de TRECHO_MAX_SEG (+ resto curto absorvido pelo último). */
export function dividirEmTrechos(pcm, { maxSeg = TRECHO_MAX_SEG, restoMinSeg = RESTO_MIN_SEG } = {}) {
  const trechos = []; let inicio = 0;
  while (inicio < pcm.length) {
    let fim = Math.min(pcm.length, inicio + maxSeg * BYTES_POR_SEGUNDO);
    if (pcm.length - fim <= restoMinSeg * BYTES_POR_SEGUNDO) fim = pcm.length;
    else fim = Math.max(inicio + BYTES_POR_SEGUNDO, pontoDeCorte(pcm, fim));
    trechos.push([inicio, fim]); inicio = fim;
  }
  return trechos;
}

/** Falas [{quem, inicio, fim, texto}] de todas as faixas -> linhas "Quem: texto" em ordem de tempo. */
export function juntarFalas(falas, pausaMaxSeg = 2.5) {
  const ordenadas = [...falas].filter((f) => String(f.texto || '').trim()).sort((a, b) => a.inicio - b.inicio);
  const linhas = [];
  for (const fala of ordenadas) {
    const ultima = linhas.at(-1);
    if (ultima && ultima.quem === fala.quem && fala.inicio - ultima.fim <= pausaMaxSeg) {
      ultima.texto = `${ultima.texto} ${fala.texto.trim()}`; ultima.fim = Math.max(ultima.fim, fala.fim);
    } else linhas.push({ quem: fala.quem, texto: fala.texto.trim(), fim: fala.fim });
  }
  return linhas.map((l) => `${l.quem}: ${l.texto}`).join('\n\n');
}

export function contarPalavras(texto) { return (String(texto).match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).length; }

/** Confiança vem das métricas do Whisper e do volume de fala, não de um modelo reescrevendo o texto. */
export function estimarConfianca(partes, palavras) {
  if (palavras < 12) return 'BAIXA';
  // Média de "sem fala", não o pico: um único trecho duvidoso não pode derrubar uma conversa inteira bem reconhecida.
  const semFala = (p) => p.noSpeechMedia ?? p.noSpeechProb ?? null;
  const ruim = partes.some((p) => (p.avgLogprob != null && p.avgLogprob < -0.85) || (semFala(p) != null && semFala(p) >= 0.5));
  if (ruim) return 'BAIXA';
  const risco = partes.some((p) => (p.avgLogprob != null && p.avgLogprob < -0.55) || (semFala(p) != null && semFala(p) >= 0.25));
  return risco ? 'MEDIA' : 'ALTA';
}

/** Quebra o diálogo em blocos de até `maxChars`, sempre entre falas (nunca no meio de uma). */
export function dividirTexto(dialogo, maxChars = 7000) {
  const blocos = []; let atual = '';
  for (const fala of String(dialogo).split('\n\n')) {
    if (atual && atual.length + fala.length + 2 > maxChars) { blocos.push(atual); atual = ''; }
    if (fala.length > maxChars) {
      for (let i = 0; i < fala.length; i += maxChars) blocos.push(fala.slice(i, i + maxChars));
    } else atual = atual ? `${atual}\n\n${fala}` : fala;
  }
  if (atual) blocos.push(atual);
  return blocos;
}
