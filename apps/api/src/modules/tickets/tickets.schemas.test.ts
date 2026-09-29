import { describe, expect, it } from 'vitest';
import { criarTicketSchema, listarTicketsSchema } from './tickets.schemas';

describe('criarTicketSchema — categoria/tipoTi (chamado de TI)', () => {
  it('categoria default e ATENDIMENTO quando nao informada, e nao exige tipoTi', () => {
    const r = criarTicketSchema.parse({ titulo: 'Sistema lento', descricao: 'Ao abrir a lista de contatos' });
    expect(r.categoria).toBe('ATENDIMENTO');
    expect(r.tipoTi).toBeUndefined();
  });

  it('aceita categoria TI_INTERNO com tipoTi ERRO ou MELHORIA', () => {
    const erro = criarTicketSchema.parse({
      titulo: 'Botao nao responde',
      descricao: 'Ao clicar em Salvar na ficha do contato',
      categoria: 'TI_INTERNO',
      tipoTi: 'ERRO',
    });
    expect(erro.categoria).toBe('TI_INTERNO');
    expect(erro.tipoTi).toBe('ERRO');

    const melhoria = criarTicketSchema.parse({
      titulo: 'Filtro por DDD',
      descricao: 'Seria util filtrar contatos por DDD direto na lista',
      categoria: 'TI_INTERNO',
      tipoTi: 'MELHORIA',
    });
    expect(melhoria.tipoTi).toBe('MELHORIA');
  });

  it('rejeita tipoTi fora do enum', () => {
    expect(() =>
      criarTicketSchema.parse({
        titulo: 'X',
        descricao: 'Y descricao valida',
        categoria: 'TI_INTERNO',
        tipoTi: 'URGENTE',
      }),
    ).toThrow();
  });
});

describe('listarTicketsSchema — filtro de categoria', () => {
  it('categoria e opcional e aceita os dois valores', () => {
    expect(listarTicketsSchema.parse({}).categoria).toBeUndefined();
    expect(listarTicketsSchema.parse({ categoria: 'TI_INTERNO' }).categoria).toBe('TI_INTERNO');
  });
});
