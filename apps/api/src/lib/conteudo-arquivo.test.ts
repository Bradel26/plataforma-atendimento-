import { describe, expect, it } from 'vitest';
import { conteudoCompativel, tiposComVerificacao } from './conteudo-arquivo';

const b = (...bytes: number[]) => Buffer.from(bytes);
const comRelleno = (cabecalho: Buffer, total = 64) => Buffer.concat([cabecalho, Buffer.alloc(total)]);
const ftyp = comRelleno(Buffer.concat([b(0, 0, 0, 0x18), Buffer.from('ftypmp42')]));
const riff = (fmt: string) => comRelleno(Buffer.concat([Buffer.from('RIFF'), b(0, 0, 0, 0), Buffer.from(fmt)]));

const VALIDOS: Record<string, Buffer> = {
  'image/jpeg': comRelleno(b(0xff, 0xd8, 0xff, 0xe0)),
  'image/png': comRelleno(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
  'image/gif': comRelleno(Buffer.from('GIF89a')),
  'image/webp': riff('WEBPVP8 '),
  'audio/mpeg': comRelleno(Buffer.from('ID3')),
  'audio/wav': riff('WAVEfmt '),
  'audio/ogg': comRelleno(Buffer.from('OggS')),
  'audio/opus': comRelleno(Buffer.from('OggS')),
  'audio/mp4': ftyp,
  'audio/aac': comRelleno(b(0xff, 0xf1)),
  'audio/webm': comRelleno(b(0x1a, 0x45, 0xdf, 0xa3)),
  'video/mp4': ftyp,
  'video/webm': comRelleno(b(0x1a, 0x45, 0xdf, 0xa3)),
  'application/pdf': Buffer.from('%PDF-1.7\n%conteudo'),
  'application/msword': comRelleno(b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)),
  'application/vnd.ms-excel': comRelleno(b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': Buffer.concat([b(0x50, 0x4b, 3, 4), Buffer.from('[Content_Types].xml word/document.xml')]),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': Buffer.concat([b(0x50, 0x4b, 3, 4), Buffer.from('[Content_Types].xml xl/workbook.xml')]),
  'application/zip': comRelleno(b(0x50, 0x4b, 3, 4)),
  'text/csv': Buffer.from('nome;valor\nAna;10\n', 'utf8'),
  'text/plain': Buffer.from('ola, mundo — acentuação ok', 'utf8'),
};

describe('conteudoCompativel — arquivos legitimos continuam passando', () => {
  for (const [tipo, conteudo] of Object.entries(VALIDOS)) {
    it(`aceita conteudo real de ${tipo}`, () => {
      expect(conteudoCompativel(tipo, conteudo)).toBe(true);
    });
  }

  it('MP3 sem tag ID3, com quadro de sincronismo, passa', () => {
    expect(conteudoCompativel('audio/mpeg', comRelleno(b(0xff, 0xfb, 0x90, 0x00)))).toBe(true);
  });

  it('PDF com lixo curto antes do cabecalho (permitido pela especificacao) passa', () => {
    expect(conteudoCompativel('application/pdf', Buffer.from('\n\n%PDF-1.4\n'))).toBe(true);
  });

  it('AAC dentro de container MP4 passa', () => {
    expect(conteudoCompativel('audio/aac', ftyp)).toBe(true);
  });

  it('CSV em Windows-1252 (acento como byte unico, sem nulo) passa', () => {
    expect(conteudoCompativel('text/csv', Buffer.from([0x4a, 0x6f, 0xe3, 0x6f, 0x3b, 0x31]))).toBe(true);
  });
});

describe('conteudoCompativel — conteudo incompativel e recusado', () => {
  const html = Buffer.from('<html><script>alert(document.cookie)</script></html>');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
  const exe = comRelleno(Buffer.from('MZ'));
  const elf = comRelleno(b(0x7f, 0x45, 0x4c, 0x46));
  const png = VALIDOS['image/png']!;

  it('HTML e SVG vestidos de imagem sao recusados', () => {
    for (const tipo of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(conteudoCompativel(tipo, html)).toBe(false);
      expect(conteudoCompativel(tipo, svg)).toBe(false);
    }
  });

  it('executaveis vestidos de qualquer tipo aceito sao recusados', () => {
    for (const tipo of Object.keys(VALIDOS)) {
      expect(conteudoCompativel(tipo, exe)).toBe(false);
      expect(conteudoCompativel(tipo, elf)).toBe(false);
    }
  });

  it('formato trocado e recusado (PNG declarado como PDF, PDF como imagem, ZIP como PDF)', () => {
    expect(conteudoCompativel('application/pdf', png)).toBe(false);
    expect(conteudoCompativel('image/png', VALIDOS['application/pdf']!)).toBe(false);
    expect(conteudoCompativel('application/pdf', VALIDOS['application/zip']!)).toBe(false);
    expect(conteudoCompativel('image/jpeg', png)).toBe(false);
  });

  it('script HTML declarado como audio ou video e recusado', () => {
    for (const tipo of ['audio/mpeg', 'audio/ogg', 'audio/wav', 'video/mp4', 'video/webm']) {
      expect(conteudoCompativel(tipo, html)).toBe(false);
    }
  });

  it('ZIP generico nao passa por docx/xlsx (falta a estrutura OOXML)', () => {
    const zipQualquer = comRelleno(b(0x50, 0x4b, 3, 4));
    expect(conteudoCompativel('application/vnd.openxmlformats-officedocument.wordprocessingml.document', zipQualquer)).toBe(false);
    expect(conteudoCompativel('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zipQualquer)).toBe(false);
  });

  it('"texto" com byte nulo, ZIP ou PDF renomeado nao passa por txt/csv', () => {
    expect(conteudoCompativel('text/plain', Buffer.from('abc\u0000def'))).toBe(false);
    expect(conteudoCompativel('text/csv', VALIDOS['application/zip']!)).toBe(false);
    expect(conteudoCompativel('text/plain', VALIDOS['application/pdf']!)).toBe(false);
  });

  it('arquivos truncados ou minusculos nao estouram: so sao recusados', () => {
    for (const tipo of Object.keys(VALIDOS)) {
      expect(() => conteudoCompativel(tipo, Buffer.from([0x00]))).not.toThrow();
    }
    expect(conteudoCompativel('image/png', Buffer.from([0x89]))).toBe(false);
  });

  it('tipo sem verificador e recusado (nao passa sem conferencia)', () => {
    expect(conteudoCompativel('application/x-novo-formato', Buffer.from('qualquer'))).toBe(false);
  });
});

describe('cobertura', () => {
  it('todo tipo aceito pelo storage tem verificador (um novo tipo nao entra sem validacao)', async () => {
    const { tipoAceito } = await import('./storage');
    const candidatos = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/opus',
      'audio/mp4', 'audio/aac', 'audio/webm', 'video/mp4', 'video/webm', 'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'text/csv', 'text/plain',
    ];
    for (const tipo of candidatos) {
      expect(tipoAceito(tipo)).toBe(true);
      expect(tiposComVerificacao()).toContain(tipo);
    }
  });
});
