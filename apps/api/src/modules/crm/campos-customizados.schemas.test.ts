import { describe, expect, it } from 'vitest';
import { atualizarCampoCustomizadoSchema, criarCampoCustomizadoSchema } from './campos-customizados.schemas';

describe('criarCampoCustomizadoSchema', () => {
  it('aceita um campo TEXTO simples', () => {
    const r = criarCampoCustomizadoSchema.safeParse({ entidade: 'CONTA', nome: 'Cor favorita', tipo: 'TEXTO' });
    expect(r.success).toBe(true);
  });

  it('SELECAO exige ao menos 2 opcoes', () => {
    expect(
      criarCampoCustomizadoSchema.safeParse({ entidade: 'CONTA', nome: 'Porte', tipo: 'SELECAO', opcoes: ['P'] })
        .success,
    ).toBe(false);
    expect(
      criarCampoCustomizadoSchema.safeParse({
        entidade: 'CONTA',
        nome: 'Porte',
        tipo: 'SELECAO',
        opcoes: ['P', 'M', 'G'],
      }).success,
    ).toBe(true);
  });

  it('recusa entidade fora do vocabulario (nao inventa um quarto lugar)', () => {
    expect(
      criarCampoCustomizadoSchema.safeParse({ entidade: 'CONTATO', nome: 'X', tipo: 'TEXTO' }).success,
    ).toBe(false);
  });

  it('obrigatorio e valorUnico tem padrao false', () => {
    const r = criarCampoCustomizadoSchema.parse({ entidade: 'LEAD', nome: 'Origem detalhada', tipo: 'TEXTO' });
    expect(r.obrigatorio).toBe(false);
    expect(r.valorUnico).toBe(false);
  });
});

describe('atualizarCampoCustomizadoSchema', () => {
  it('exige ao menos um campo', () => {
    expect(atualizarCampoCustomizadoSchema.safeParse({}).success).toBe(false);
  });

  it('aceita desativar sozinho', () => {
    expect(atualizarCampoCustomizadoSchema.safeParse({ ativo: false }).success).toBe(true);
  });

  it('nao aceita mudar entidade nem tipo — nao fazem parte do vocabulario de update', () => {
    const r = atualizarCampoCustomizadoSchema.safeParse({ tipo: 'NUMERO' });
    // O campo extra simplesmente nao aparece no resultado: zod ignora chaves
    // desconhecidas por padrao, mas como nao sobra nenhum campo valido aqui,
    // o refine de "ao menos um campo" recusa o corpo inteiro.
    expect(r.success).toBe(false);
  });
});
