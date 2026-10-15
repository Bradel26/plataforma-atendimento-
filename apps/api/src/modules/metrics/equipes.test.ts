import { describe, expect, it } from 'vitest';
import { montarEquipes } from './metrics.service';

describe('montarEquipes', () => {
  it('soma aguardando + atendimento no total e conta online pelos membros', () => {
    const filas = [
      {
        id: 'f-com',
        nome: 'Comercial',
        agentes: [
          { usuario: { id: 'u-g', nome: 'Guilherme', status: 'EM_ATENDIMENTO' as const, ativo: true } },
          { usuario: { id: 'u-c', nome: 'Comercial', status: 'OFFLINE' as const, ativo: true } },
        ],
      },
    ];
    const contagens = [
      { filaId: 'f-com', status: 'EM_ESPERA' as const, _count: { _all: 1 } },
      { filaId: 'f-com', status: 'ATRIBUIDO' as const, _count: { _all: 2 } },
      { filaId: 'f-com', status: 'EM_ATENDIMENTO' as const, _count: { _all: 1 } },
    ];
    const chats = [{ agenteId: 'u-g', _count: { _all: 14 } }];

    const [equipe] = montarEquipes(filas, contagens, chats);

    expect(equipe).toMatchObject({ nome: 'Comercial', usuariosOnline: 1, aguardando: 1, emAtendimento: 3, total: 4 });
    expect(equipe?.usuarios).toEqual([
      { id: 'u-c', nome: 'Comercial', status: 'OFFLINE', caixaEntrada: 1, chats: 0 },
      { id: 'u-g', nome: 'Guilherme', status: 'EM_ATENDIMENTO', caixaEntrada: 1, chats: 14 },
    ]);
  });

  it('conversa AGUARDANDO_CLIENTE conta como em atendimento, nao desaparece do painel', () => {
    const filas = [
      {
        id: 'f-com',
        nome: 'Comercial',
        agentes: [{ usuario: { id: 'u-g', nome: 'Guilherme', status: 'EM_ATENDIMENTO' as const, ativo: true } }],
      },
    ];
    const contagens = [
      { filaId: 'f-com', status: 'ATRIBUIDO' as const, _count: { _all: 1 } },
      { filaId: 'f-com', status: 'AGUARDANDO_CLIENTE' as const, _count: { _all: 2 } },
    ];

    const [equipe] = montarEquipes(filas, contagens, []);

    expect(equipe).toMatchObject({ aguardando: 0, emAtendimento: 3, total: 3 });
  });

  it('usuário desativado não entra', () => {
    const filas = [{ id: 'f', nome: 'X', agentes: [{ usuario: { id: 'u', nome: 'U', status: 'DISPONIVEL' as const, ativo: false } }] }];
    expect(montarEquipes(filas, [], [])[0]?.usuarios).toEqual([]);
  });
});
