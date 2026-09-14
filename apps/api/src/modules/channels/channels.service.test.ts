import { describe, expect, it } from 'vitest';
import { dadosContatoImportado, gerarNomeSessao, herdarCredenciaisDaPonte } from './channels.service';

/**
 * Herdar credenciais da ponte compartilhada evita que o ADMIN redigite
 * endereco/token/segredo em toda linha pessoal nova, quando todas apontam
 * para a mesma ponte.
 */
describe('herdarCredenciaisDaPonte', () => {
  it('herda os 3 campos da compartilhada quando o input nao trouxe nenhum', () => {
    const compartilhada = { ponteUrl: 'http://ponte:3100', ponteToken: 'token-x', ponteSegredo: 'segredo-x' };
    const resultado = herdarCredenciaisDaPonte(
      { ponteUrl: null, ponteToken: null, ponteSegredo: null },
      compartilhada,
    );
    expect(resultado).toEqual(compartilhada);
  });

  it('mantem os campos do input quando todos os 3 vieram preenchidos', () => {
    const input = { ponteUrl: 'http://input:3100', ponteToken: 'token-input', ponteSegredo: 'segredo-input' };
    const compartilhada = { ponteUrl: 'http://ponte:3100', ponteToken: 'token-x', ponteSegredo: 'segredo-x' };
    expect(herdarCredenciaisDaPonte(input, compartilhada)).toEqual(input);
  });

  it('herda so o que faltou quando o input e parcial', () => {
    const compartilhada = { ponteUrl: 'http://ponte:3100', ponteToken: 'token-x', ponteSegredo: 'segredo-x' };
    const resultado = herdarCredenciaisDaPonte(
      { ponteUrl: 'http://input:3100', ponteToken: null, ponteSegredo: null },
      compartilhada,
    );
    expect(resultado).toEqual({
      ponteUrl: 'http://input:3100',
      ponteToken: 'token-x',
      ponteSegredo: 'segredo-x',
    });
  });

  it('sem compartilhada e sem input, todos ficam nulos', () => {
    const resultado = herdarCredenciaisDaPonte({ ponteUrl: null, ponteToken: null, ponteSegredo: null }, null);
    expect(resultado).toEqual({ ponteUrl: null, ponteToken: null, ponteSegredo: null });
  });
});

describe('gerarNomeSessao', () => {
  it('gera um nome no formato esperado', () => {
    expect(gerarNomeSessao('abcdef12-3456-7890-abcd-ef1234567890')).toBe('vendedor-abcdef12');
  });

  it('e deterministico: mesma entrada gera sempre a mesma saida', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(gerarNomeSessao(id)).toBe(gerarNomeSessao(id));
  });

  it('donoId diferentes geram nomes diferentes', () => {
    const a = gerarNomeSessao('11111111-0000-0000-0000-000000000000');
    const b = gerarNomeSessao('22222222-0000-0000-0000-000000000000');
    expect(a).not.toBe(b);
  });
});

/**
 * `dadosContatoImportado` e a parte pura de `importarContatos`: monta os
 * campos do `Contact` a criar a partir de um contato vindo da ponte, sem
 * tocar em banco. O `findFirst`+`create` em loop nao tem teste de unidade —
 * fica para o smoke test, como o `vitest.config.ts` documenta.
 */
describe('dadosContatoImportado', () => {
  it('monta os dados do Contact com origem WHATSAPP e o responsavel informado', () => {
    expect(
      dadosContatoImportado(
        { numero: '5511999998888', nome: 'Fulano da Silva' },
        { organizacaoId: 'org-1', responsavelId: 'user-1' },
      ),
    ).toEqual({
      organizacaoId: 'org-1',
      nome: 'Fulano da Silva',
      telefone: '5511999998888',
      canalOrigem: 'WHATSAPP',
      responsavelId: 'user-1',
    });
  });

  it('sem responsavel (linha sem dono), o contato fica sem responsavel', () => {
    expect(
      dadosContatoImportado({ numero: '5511999998888', nome: 'Fulano' }, { organizacaoId: 'org-1', responsavelId: null }),
    ).toMatchObject({ responsavelId: null });
  });
});
