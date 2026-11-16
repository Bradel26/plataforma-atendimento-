/**
 * Confere se os bytes de um arquivo correspondem ao tipo que o cliente declarou.
 *
 * O MIME vem do cabecalho do upload (ou do provedor de WhatsApp) e quem o escreve
 * e quem envia: sem esta conferencia, "image/png" e so um rotulo que um HTML, um
 * executavel ou um arquivo de outro formato pode vestir. A lista fechada de tipos
 * em `storage.ts` impede SVG/HTML declarados; isto impede que eles entrem
 * disfarcados de um tipo permitido.
 *
 * Alcance: assinatura (magic bytes) para os formatos que a tem, estrutura minima
 * para OOXML (docx/xlsx sao ZIP com pastas conhecidas) e ausencia de binario para
 * texto. NAO e antivirus nem inspeciona o conteudo interno de ZIP/Office: o
 * servidor nunca extrai nem executa esses arquivos, eles so sao armazenados e
 * devolvidos como download com `nosniff`.
 */

const comecaCom = (b: Buffer, ...bytes: number[]) => bytes.every((v, i) => b[i] === v);
const ascii = (b: Buffer, inicio: number, fim: number) => b.subarray(inicio, fim).toString('latin1');

const ehZip = (b: Buffer) => comecaCom(b, 0x50, 0x4b, 0x03, 0x04) || comecaCom(b, 0x50, 0x4b, 0x05, 0x06);
const ehOle2 = (b: Buffer) => comecaCom(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
// Container ISO (mp4, m4a, mov): `ftyp` a partir do 5o byte.
const ehIsoMedia = (b: Buffer) => b.length >= 12 && ascii(b, 4, 8) === 'ftyp';
const ehEbml = (b: Buffer) => comecaCom(b, 0x1a, 0x45, 0xdf, 0xa3); // webm/matroska
const ehRiff = (b: Buffer, formato: string) => b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === formato;

/** Quadro de audio MPEG: 11 bits de sincronismo ligados. */
const sincroniaMpeg = (b: Buffer, i: number) => b[i] === 0xff && ((b[i + 1] ?? 0) & 0xe0) === 0xe0;
function ehMp3(b: Buffer) {
  if (ascii(b, 0, 3) === 'ID3') return true;
  // Alguns arquivos comecam com lixo curto antes do primeiro quadro.
  const limite = Math.min(b.length - 1, 4096);
  for (let i = 0; i < limite; i++) if (sincroniaMpeg(b, i)) return true;
  return false;
}

// ADTS: 12 bits de sincronismo e camada 00.
const ehAdts = (b: Buffer) => b[0] === 0xff && ((b[1] ?? 0) & 0xf6) === 0xf0;

function ehPdf(b: Buffer) {
  // A especificacao admite lixo ate 1024 bytes antes do cabecalho.
  return b.subarray(0, 1024).includes('%PDF-', 0, 'latin1');
}

/** Texto: sem byte nulo nas primeiras paginas e sem assinatura de binario conhecido. */
function ehTexto(b: Buffer) {
  const amostra = b.subarray(0, 64 * 1024);
  if (amostra.includes(0x00)) return false;
  if (comecaCom(amostra, 0x4d, 0x5a)) return false; // MZ (Windows PE)
  if (comecaCom(amostra, 0x7f, 0x45, 0x4c, 0x46)) return false; // ELF
  if (comecaCom(amostra, 0x50, 0x4b, 0x03, 0x04)) return false; // ZIP renomeado
  if (ehPdf(amostra)) return false;
  return true;
}

const DOCX_PASTAS = ['word/', '[Content_Types].xml'];
const XLSX_PASTAS = ['xl/', '[Content_Types].xml'];
const contemTodos = (b: Buffer, termos: string[]) => termos.every((t) => b.includes(t, 0, 'latin1'));

const VERIFICADORES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => comecaCom(b, 0xff, 0xd8, 0xff),
  'image/png': (b) => comecaCom(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  'image/gif': (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a',
  'image/webp': (b) => ehRiff(b, 'WEBP'),
  'audio/mpeg': ehMp3,
  'audio/wav': (b) => ehRiff(b, 'WAVE'),
  'audio/ogg': (b) => ascii(b, 0, 4) === 'OggS',
  'audio/opus': (b) => ascii(b, 0, 4) === 'OggS',
  'audio/mp4': ehIsoMedia,
  // AAC aparece em ADTS puro ou dentro de um container MP4.
  'audio/aac': (b) => ehAdts(b) || ehIsoMedia(b),
  'audio/webm': ehEbml,
  'video/mp4': ehIsoMedia,
  'video/webm': ehEbml,
  'application/pdf': ehPdf,
  'application/msword': ehOle2,
  'application/vnd.ms-excel': ehOle2,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => ehZip(b) && contemTodos(b, DOCX_PASTAS),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => ehZip(b) && contemTodos(b, XLSX_PASTAS),
  'application/zip': ehZip,
  'text/csv': ehTexto,
  'text/plain': ehTexto,
};

/**
 * `true` quando o conteudo e coerente com o tipo declarado.
 *
 * Tipo sem verificador devolve `false`: se alguem acrescentar um formato a lista
 * de aceitos em `storage.ts` sem ensinar a validacao, o upload falha alto em vez
 * de passar sem conferencia.
 */
export function conteudoCompativel(tipo: string, buffer: Buffer): boolean {
  const verificar = VERIFICADORES[tipo];
  return verificar ? verificar(buffer) : false;
}

export const tiposComVerificacao = () => Object.keys(VERIFICADORES);
