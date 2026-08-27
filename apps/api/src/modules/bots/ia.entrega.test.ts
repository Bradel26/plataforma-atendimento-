import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assinarEntrega, corpoDaEntrega, type MensagemParaIa } from './ia.service';

/**
 * O contrato com o plugin do whatsbot-pro, do lado da plataforma.
 *
 * Estes testes existem porque as duas pontas sao repositorios diferentes: o
 * campo que eu renomear aqui nao quebra nada que o typecheck veja — quebra
 * silenciosamente o `inbound.py` do outro lado, em producao, na primeira
 * mensagem. Cada `expect` abaixo e um campo que o plugin le.
 */

const CONTATO = {
  id: 'contato-1',
  nome: 'Fulano',
  telefone: '+5562912345678',
  email: 'fulano@exemplo.com',
};

const CONVERSA = {
  id: 'conv-1',
  canal: 'WHATSAPP' as const,
  agenteId: null,
  status: 'EM_ESPERA' as const,
};

const mensagem = (extra: Partial<MensagemParaIa> = {}): MensagemParaIa => ({
  id: 'msg-1',
  autor: 'CLIENTE',
  conteudo: 'bom dia',
  tipoAnexo: 'TEXTO',
  anexoUrl: null,
  criadoEm: new Date('2026-08-27T12:00:00.000Z'),
  ...extra,
});

describe('corpo da entrega ao motor de IA', () => {
  it('manda os campos que o plugin le', () => {
    const corpo = corpoDaEntrega(mensagem(), CONVERSA, CONTATO);

    expect(corpo.evento).toBe('mensagem');
    expect(corpo.conversaId).toBe('conv-1');
    expect(corpo.mensagemId).toBe('msg-1');
    expect(corpo.canal).toBe('WHATSAPP');
    expect(corpo.texto).toBe('bom dia');
    expect(corpo.contato).toEqual(CONTATO);
    expect(corpo.criadoEm).toBe('2026-08-27T12:00:00.000Z');
    expect(corpo.anexo).toBeNull();
  });

  it('traduz CLIENTE para CONTATO', () => {
    // O vocabulario do plugin e o de um canal de mensageria, nao o nosso.
    expect(corpoDaEntrega(mensagem(), CONVERSA, CONTATO).autor).toBe('CONTATO');
  });

  it('aciona a IA na mensagem do cliente sem atendente', () => {
    expect(corpoDaEntrega(mensagem(), CONVERSA, CONTATO).acionarIa).toBe(true);
  });

  it('nao aciona a IA quando um humano assumiu a conversa', () => {
    // O caso que mais importa: sem isto o agente responde por cima do
    // atendente, e o cliente recebe duas respostas diferentes.
    const corpo = corpoDaEntrega(mensagem(), { ...CONVERSA, agenteId: 'agente-1' }, CONTATO);
    expect(corpo.acionarIa).toBe(false);
  });

  it('nao aciona a IA em conversa finalizada', () => {
    const corpo = corpoDaEntrega(mensagem(), { ...CONVERSA, status: 'FINALIZADO' }, CONTATO);
    expect(corpo.acionarIa).toBe(false);
  });

  it('manda a mensagem do atendente como contexto, sem acionar', () => {
    // Sem o que o humano respondeu, o agente repete a pergunta que a pessoa
    // acabou de responder. Com acionarIa true, o bot responderia a si mesmo.
    const corpo = corpoDaEntrega(mensagem({ autor: 'AGENTE', conteudo: 'ja verifiquei' }), CONVERSA, CONTATO);
    expect(corpo.autor).toBe('AGENTE');
    expect(corpo.acionarIa).toBe(false);
  });

  it('nao aciona a IA na propria resposta dela', () => {
    expect(corpoDaEntrega(mensagem({ autor: 'BOT' }), CONVERSA, CONTATO).acionarIa).toBe(false);
  });

  it('descreve o anexo com o vocabulario do plugin e URL absoluta assinada', () => {
    const corpo = corpoDaEntrega(
      mensagem({ tipoAnexo: 'ARQUIVO', anexoUrl: '/api/arquivos/2026/08/' + 'a'.repeat(8) + '-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf' }),
      CONVERSA,
      CONTATO,
    );

    // ARQUIVO nao existe no vocabulario do plugin; DOCUMENTO existe.
    expect(corpo.anexo?.tipo).toBe('DOCUMENTO');
    // Absoluta: o motor de IA baixa de fora da rede, e caminho relativo nao
    // resolve para nada la.
    expect(corpo.anexo?.url.startsWith('http')).toBe(true);
    // Assinada: a rota de arquivos exige a assinatura na propria URL.
    expect(corpo.anexo?.url).toContain('?t=');
  });

  it('ignora anexoUrl quando o tipo diz que a mensagem e texto', () => {
    // Anunciar anexo sem tipo faria o outro lado tentar baixar o que nao ha.
    const corpo = corpoDaEntrega(mensagem({ anexoUrl: '/api/arquivos/x' }), CONVERSA, CONTATO);
    expect(corpo.anexo).toBeNull();
  });
});

describe('assinatura da entrega', () => {
  const SEGREDO = 'segredo-de-teste-com-tamanho';

  it('assina timestamp e corpo, no formato que o plugin confere', () => {
    const corpo = '{"evento":"mensagem"}';
    const esperado = createHmac('sha256', SEGREDO).update(`1787832000.${corpo}`).digest('hex');
    expect(assinarEntrega(SEGREDO, 1_787_832_000, corpo)).toBe(`sha256=${esperado}`);
  });

  it('muda quando o timestamp muda, mesmo com o corpo igual', () => {
    // E o que impede o reenvio de uma requisicao legitima capturada: assinando
    // so o corpo, a mesma entrega valeria para sempre e o agente responderia de
    // novo a cada reenvio.
    const corpo = '{"a":1}';
    expect(assinarEntrega(SEGREDO, 1, corpo)).not.toBe(assinarEntrega(SEGREDO, 2, corpo));
  });

  it('muda quando um byte do corpo muda', () => {
    expect(assinarEntrega(SEGREDO, 1, '{"a":1}')).not.toBe(assinarEntrega(SEGREDO, 1, '{"a":2}'));
  });

  it('muda com outro segredo', () => {
    expect(assinarEntrega(SEGREDO, 1, '{}')).not.toBe(assinarEntrega('outro-segredo-qualquer', 1, '{}'));
  });
});
