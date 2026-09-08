import { describe, expect, it } from 'vitest';
import {
  AVISO_NAO_OFICIAL,
  enderecosDaPonte,
  impedimentoDeEnvio,
  lerEstadoDaPonte,
  modoEfetivo,
  numeroNormalizado,
  type CredenciaisDoCanal,
} from './whatsapp.modo';

const PRONTO_OFICIAL: CredenciaisDoCanal = {
  ativo: true,
  accessToken: 'tok',
  phoneNumberId: '123',
  ponteUrl: null,
  ponteToken: null,
};

const PRONTO_PONTE: CredenciaisDoCanal = {
  ativo: true,
  accessToken: null,
  phoneNumberId: null,
  ponteUrl: 'http://ponte:3000/api',
  ponteToken: 'segredo',
};

describe('modoEfetivo', () => {
  it('nulo e OFICIAL: canal configurado antes de o modo existir era oficial', () => {
    // O WhatsApp que ja estava no banco nao muda de comportamento por causa de
    // uma coluna nova.
    expect(modoEfetivo(null)).toBe('OFICIAL');
    expect(modoEfetivo(undefined)).toBe('OFICIAL');
  });

  it('respeita o modo escolhido', () => {
    expect(modoEfetivo('NAO_OFICIAL')).toBe('NAO_OFICIAL');
    expect(modoEfetivo('OFICIAL')).toBe('OFICIAL');
  });
});

describe('impedimentoDeEnvio', () => {
  it('libera o oficial completo', () => {
    expect(impedimentoDeEnvio('OFICIAL', PRONTO_OFICIAL)).toBeNull();
  });

  it('libera a ponte completa', () => {
    expect(impedimentoDeEnvio('NAO_OFICIAL', PRONTO_PONTE)).toBeNull();
  });

  it('canal inativo barra os dois modos', () => {
    expect(impedimentoDeEnvio('OFICIAL', { ...PRONTO_OFICIAL, ativo: false })).toContain('inativo');
    expect(impedimentoDeEnvio('NAO_OFICIAL', { ...PRONTO_PONTE, ativo: false })).toContain('inativo');
  });

  it('cada modo cobra a credencial DELE, e diz qual', () => {
    // "Canal nao configurado" para os dois faria quem esta na ponte procurar um
    // token da Meta que ele nunca vai ter.
    expect(impedimentoDeEnvio('OFICIAL', { ...PRONTO_OFICIAL, accessToken: null })).toContain(
      'Cloud API',
    );
    expect(impedimentoDeEnvio('NAO_OFICIAL', { ...PRONTO_PONTE, ponteUrl: null })).toContain('ponte');
  });

  it('credencial do outro modo nao serve', () => {
    // Ponte configurada nao habilita o modo oficial, e vice-versa: sao caminhos
    // diferentes, e aceitar um pelo outro produziria um envio que falha depois.
    expect(impedimentoDeEnvio('OFICIAL', PRONTO_PONTE)).not.toBeNull();
    expect(impedimentoDeEnvio('NAO_OFICIAL', PRONTO_OFICIAL)).not.toBeNull();
  });

  it('modo nulo e cobrado como oficial', () => {
    expect(impedimentoDeEnvio(null, PRONTO_OFICIAL)).toBeNull();
    expect(impedimentoDeEnvio(null, PRONTO_PONTE)).not.toBeNull();
  });
});

describe('numeroNormalizado', () => {
  it('tira mascara e devolve so digitos', () => {
    expect(numeroNormalizado('+55 (11) 99999-9999')).toBe('5511999999999');
  });

  it('acrescenta o 55 quando falta o pais', () => {
    expect(numeroNormalizado('11999999999')).toBe('5511999999999');
  });

  it('nao mexe em numero que ja tem outro pais', () => {
    // 351 = Portugal. Forcar 55 mandaria a mensagem para o Brasil.
    expect(numeroNormalizado('+351912345678')).toBe('351912345678');
  });

  it('NAO adivinha o nono digito', () => {
    // Inserir um 9 num numero antigo de oito digitos criaria um numero que pode
    // ser de outra pessoa. Quem tem base antiga corrige o cadastro.
    expect(numeroNormalizado('1133334444')).toBe('551133334444');
  });

  it('recusa o que nao da para afirmar que e telefone', () => {
    expect(numeroNormalizado('99999')).toBeNull();
    expect(numeroNormalizado('')).toBeNull();
    expect(numeroNormalizado(null)).toBeNull();
    expect(numeroNormalizado('   ')).toBeNull();
  });

  it('recusa numero longo demais para E.164', () => {
    expect(numeroNormalizado('1234567890123456')).toBeNull();
  });
});

describe('lerEstadoDaPonte', () => {
  it('entende as tres formas comuns de "conectado"', () => {
    expect(lerEstadoDaPonte({ connected: true }).situacao).toBe('CONECTADO');
    expect(lerEstadoDaPonte({ status: 'CONNECTED' }).situacao).toBe('CONECTADO');
    expect(lerEstadoDaPonte({ state: 'open' }).situacao).toBe('CONECTADO');
  });

  it('entende as formas comuns de "desconectado"', () => {
    expect(lerEstadoDaPonte({ connected: false }).situacao).toBe('DESCONECTADO');
    expect(lerEstadoDaPonte({ state: 'close' }).situacao).toBe('DESCONECTADO');
    // Sessao esperando QR nao esta conectada: quem le precisa saber que ha
    // trabalho manual a fazer.
    expect(lerEstadoDaPonte({ status: 'qrcode' }).situacao).toBe('DESCONECTADO');
  });

  it('formato desconhecido e DESCONHECIDO, e nao desconectado', () => {
    // Bloquear o atendimento porque nao entendemos o diagnostico seria trocar um
    // problema pequeno por um grande.
    expect(lerEstadoDaPonte({ algo: 'nada a ver' }).situacao).toBe('DESCONHECIDO');
    expect(lerEstadoDaPonte(null).situacao).toBe('DESCONHECIDO');
    expect(lerEstadoDaPonte('texto').situacao).toBe('DESCONHECIDO');
  });

  it('guarda o detalhe que a ponte mandou, sem traduzir', () => {
    expect(lerEstadoDaPonte({ connected: false, message: 'aguardando leitura do QR' }).detalhe).toBe(
      'aguardando leitura do QR',
    );
    expect(lerEstadoDaPonte({ status: 'CONNECTED' }).detalhe).toBe('CONNECTED');
  });

  it('booleano vence o texto quando os dois vem', () => {
    // Ponte que manda `connected:true, state:'close'` esta descrevendo a sessao
    // no booleano e o socket no texto; o booleano e a resposta da pergunta.
    expect(lerEstadoDaPonte({ connected: true, state: 'close' }).situacao).toBe('CONECTADO');
  });
});

describe('enderecosDaPonte', () => {
  it('monta os caminhos', () => {
    const e = enderecosDaPonte('http://ponte:3000/api', null);
    expect(e).toEqual({
      texto: 'http://ponte:3000/api/mensagens',
      arquivo: 'http://ponte:3000/api/arquivos',
      estado: 'http://ponte:3000/api/estado',
      qr: 'http://ponte:3000/api/qr',
      desconectar: 'http://ponte:3000/api/desconectar',
    });
  });

  it('tolera barra no fim do endereco base', () => {
    // Endereco colado da documentacao vem com barra, e `//mensagens` da 404 em
    // algumas pontes.
    expect(enderecosDaPonte('http://ponte:3000/api/', null).texto).toBe('http://ponte:3000/api/mensagens');
  });

  it('inclui a sessao quando ela existe', () => {
    expect(enderecosDaPonte('http://ponte:3000/api', 'vendas').estado).toBe(
      'http://ponte:3000/api/estado/vendas',
    );
  });

  it('escapa a sessao: nome com espaco nao quebra a URL', () => {
    expect(enderecosDaPonte('http://p/api', 'sessao de vendas').texto).toBe(
      'http://p/api/mensagens/sessao%20de%20vendas',
    );
  });
});

describe('AVISO_NAO_OFICIAL', () => {
  it('diz o risco em vez de dizer que e "alternativo"', () => {
    // O aviso existe para a decisao ser tomada por quem tem autoridade para
    // toma-la, e nao descoberta no dia em que o numero para de funcionar.
    expect(AVISO_NAO_OFICIAL).toContain('termos de uso');
    expect(AVISO_NAO_OFICIAL).toContain('bloqueado');
  });
});
