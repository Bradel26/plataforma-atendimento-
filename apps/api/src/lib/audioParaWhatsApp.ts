import { spawn } from 'node:child_process';

/**
 * Audio que o atendente grava/anexa na plataforma chega em webm, m4a, mp3...; o
 * WhatsApp Web recusou o webm ("falha no envio de arquivo: t", 25/11/2026). O formato
 * nativo do WhatsApp e ogg/opus: converte antes de enviar. Sem o ffmpeg no ambiente, ou
 * se a conversao falhar, devolve nulo e quem chama manda o arquivo original (o
 * comportamento de antes), nunca derruba o envio.
 */
export type ArquivoDeAudio = { buffer: Buffer; nome: string; tipo: string; legenda?: string };

export const TIPO_OGG_OPUS = 'audio/ogg; codecs=opus';

/** A saida em opus 32k mono e pequena; passar disso indica entrada anomala. */
const LIMITE_SAIDA_BYTES = 25 * 1024 * 1024;

/** Executa o ffmpeg com o audio no stdin e devolve o stdout; nulo se nao existir ou falhar. */
export type ExecutorFfmpeg = (entrada: Buffer) => Promise<Buffer | null>;

// O arquivo vem de upload do usuario: `-protocol_whitelist pipe` impede que um arquivo
// forjado (playlist HLS/concat) faca o ffmpeg ler arquivos locais ou buscar URLs; so a
// entrada recebida por stdin e aberta.
export const ARGS_FFMPEG = ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'pipe', '-i', 'pipe:0', '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', 'pipe:1'];

export const executarFfmpeg: ExecutorFfmpeg = (entrada) =>
  new Promise((resolver) => {
    const binario = process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
    let processo: ReturnType<typeof spawn>;
    try {
      processo = spawn(binario, ARGS_FFMPEG, { stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      resolver(null);
      return;
    }
    const pedacos: Buffer[] = [];
    let acumulado = 0;
    const prazo = setTimeout(() => {
      processo.kill('SIGKILL');
      resolver(null);
    }, 30_000);
    processo.stdout?.on('data', (p: Buffer) => {
      acumulado += p.length;
      if (acumulado > LIMITE_SAIDA_BYTES) {
        processo.kill('SIGKILL'); // saida maior que o razoavel para um audio: descarta
        return;
      }
      pedacos.push(p);
    });
    processo.on('error', () => {
      clearTimeout(prazo);
      resolver(null); // ffmpeg nao instalado
    });
    processo.on('close', (codigo) => {
      clearTimeout(prazo);
      const saida = Buffer.concat(pedacos);
      resolver(codigo === 0 && acumulado <= LIMITE_SAIDA_BYTES && saida.length > 0 ? saida : null);
    });
    processo.stdin?.on('error', () => undefined);
    processo.stdin?.end(entrada);
  });

/** Ja esta no formato do WhatsApp (ogg/opus): nao reconverte. */
export function jaEOggOpus(tipo: string): boolean {
  return /^audio\/ogg/i.test(tipo.trim());
}

export function ehAudio(tipo: string): boolean {
  return /^audio\//i.test(tipo.trim());
}

export function nomeOgg(nome: string): string {
  const base = nome.replace(/\.[^./\\]+$/, '') || 'audio';
  return `${base}.ogg`;
}

/** Converte para ogg/opus; nulo quando nao for audio, ja estiver em ogg, ou a conversao nao for possivel. */
export async function converterAudioParaWhatsApp(
  arquivo: ArquivoDeAudio,
  executar: ExecutorFfmpeg = executarFfmpeg,
): Promise<ArquivoDeAudio | null> {
  if (!ehAudio(arquivo.tipo) || jaEOggOpus(arquivo.tipo)) return null;
  const saida = await executar(arquivo.buffer);
  if (!saida) return null;
  return { ...arquivo, buffer: saida, nome: nomeOgg(arquivo.nome), tipo: TIPO_OGG_OPUS };
}
