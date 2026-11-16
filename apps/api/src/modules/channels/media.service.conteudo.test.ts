import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Anexo que vem no proprio webhook (conector do WhatsApp Web): decodifica o
 * base64 e grava no storage, sem chamada de rede. O storage e simulado; o que se
 * prova aqui e a decisao (tipo aceito, vazio, limite) e o que e entregue a ele.
 */

const salvar = vi.fn();
vi.mock('../../lib/storage', () => ({
  limiteBytes: 1024,
  salvar: (...a: unknown[]) => salvar(...a),
  tipoAceito: (t: string) => ['image/jpeg', 'audio/ogg', 'application/pdf'].includes(t),
}));
vi.mock('./channels.service', () => ({ configDoDestino: vi.fn() }));
vi.mock('../../env', () => ({ env: { META_GRAPH_API_VERSION: 'v20.0' } }));

import { baixarAnexo } from './media.service';

const dados = (extra: object = {}) => ({
  tipoAnexo: 'AUDIO' as const,
  anexoUrl: null,
  anexoIdExterno: null,
  anexoNome: null,
  identificadorDestino: 'vendedor-x',
  anexoConteudo: { base64: Buffer.from('conteudo-do-audio').toString('base64'), mimetype: 'audio/ogg; codecs=opus' },
  ...extra,
});

beforeEach(() => {
  salvar.mockReset();
  salvar.mockResolvedValue({ url: '/api/arquivos/org/2026/11/x.ogg' });
});

describe('baixarAnexo — conteudo recebido do conector', () => {
  it('grava o binario decodificado com o tipo sem parametros e devolve a URL', async () => {
    const r = await baixarAnexo('WHATSAPP', dados());
    expect(r).toEqual({ url: '/api/arquivos/org/2026/11/x.ogg' });
    const arg = salvar.mock.calls[0]![0] as { buffer: Buffer; tipo: string; nome: string };
    expect(arg.buffer.toString()).toBe('conteudo-do-audio');
    expect(arg.tipo).toBe('audio/ogg');
    expect(arg.nome).toBe('audio');
  });

  it('usa o nome original quando existe', async () => {
    await baixarAnexo('WHATSAPP', dados({ tipoAnexo: 'ARQUIVO', anexoNome: 'proposta.pdf', anexoConteudo: { base64: 'QUJD', mimetype: 'application/pdf' } }));
    expect((salvar.mock.calls[0]![0] as { nome: string }).nome).toBe('proposta.pdf');
  });

  it('nao faz chamada de rede', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    await baixarAnexo('WHATSAPP', dados());
    expect(f).not.toHaveBeenCalled();
    f.mockRestore();
  });

  it('tipo nao aceito: sem URL, com motivo, e nada e gravado', async () => {
    const r = await baixarAnexo('WHATSAPP', dados({ anexoConteudo: { base64: 'QUJD', mimetype: 'application/x-msdownload' } }));
    expect(r.url).toBeNull();
    expect(r.motivo).toMatch(/tipo não aceito/);
    expect(salvar).not.toHaveBeenCalled();
  });

  it('acima do limite: sem URL e sem gravar', async () => {
    const grande = Buffer.alloc(2048, 1).toString('base64');
    const r = await baixarAnexo('WHATSAPP', dados({ anexoConteudo: { base64: grande, mimetype: 'audio/ogg' } }));
    expect(r.url).toBeNull();
    expect(r.motivo).toMatch(/acima do limite/);
    expect(salvar).not.toHaveBeenCalled();
  });

  it('base64 vazio: motivo "anexo vazio"', async () => {
    const r = await baixarAnexo('WHATSAPP', dados({ anexoConteudo: { base64: '', mimetype: 'audio/ogg' } }));
    expect(r).toMatchObject({ url: null, motivo: 'anexo vazio' });
  });

  it('falha do storage nao lanca: devolve o motivo (a mensagem nao pode se perder)', async () => {
    salvar.mockRejectedValue(new Error('disco cheio'));
    await expect(baixarAnexo('WHATSAPP', dados())).resolves.toEqual({ url: null, motivo: 'disco cheio' });
  });

  it('mensagem de texto continua sem anexo', async () => {
    await expect(baixarAnexo('WHATSAPP', dados({ tipoAnexo: 'TEXTO', anexoConteudo: null }))).resolves.toEqual({ url: null });
  });
});
