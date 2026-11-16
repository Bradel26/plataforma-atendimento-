import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `concluirAgendamento` tem de respeitar a visibilidade do protocolo, como
 * `comentar`, `anexar` e `agendar`. Antes da correcao so conferia que o
 * agendamento pertencia ao protocolo informado, e `publicar` devolvia o detalhe
 * completo mesmo de um protocolo fora do escopo de quem chamava.
 *
 * O Prisma esta mockado: o que se prova aqui e a ORDEM e a decisao do servico
 * (visibilidade antes de qualquer escrita). Que a extensao de isolamento filtra
 * por organizacao e coberto por `tenant.contexto.test.ts`/`tenant.schema.test.ts`;
 * aqui o isolamento entre organizacoes e representado pelo `findFirst` que
 * devolve nulo para protocolo de outra organizacao — o mesmo sinal que a
 * extensao produz.
 */

type Protocolo = { id: string; organizacaoId: string; visivel: boolean };

const protocolos = new Map<string, Protocolo>();
const agendamentos = new Map<string, { id: string; ticketId: string; concluido: boolean }>();
let organizacaoDoChamador = 'org-a';

const atualizarAgendamento = vi.fn(async ({ where }: { where: { id: string } }) => {
  const a = agendamentos.get(where.id)!;
  a.concluido = true;
  return a;
});
const notificar = vi.fn();

function protocoloCompleto(id: string) {
  return {
    id,
    numero: 1,
    titulo: 't',
    descricao: null,
    status: 'ABERTO',
    prioridade: 'MEDIA',
    categoria: 'ATENDIMENTO',
    tipoTi: null,
    prazoSla: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    resolvidoEm: null,
    fechadoEm: null,
    conversaId: null,
    contato: null,
    conta: null,
    responsavel: null,
    fila: null,
    comentarios: [],
    anexos: [],
    agendamentos: [...agendamentos.values()],
  };
}

vi.mock('../../lib/prisma', () => ({
  prisma: {
    ticket: {
      // Visivel so quando o protocolo existe, e da organizacao de quem chama, e a
      // politica o deixa passar. Caso contrario nulo — a extensao e a politica
      // produzem exatamente este sinal.
      findFirst: vi.fn(async ({ where }: { where: { AND: [{ id: string }, unknown] } }) => {
        const p = protocolos.get(where.AND[0].id);
        if (!p || p.organizacaoId !== organizacaoDoChamador || !p.visivel) return null;
        return protocoloCompleto(p.id);
      }),
      // `carregar` (uso interno de `publicar`): sem politica de visibilidade.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = protocolos.get(where.id);
        return p ? protocoloCompleto(p.id) : null;
      }),
    },
    ticketSchedule: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => agendamentos.get(where.id) ?? null),
      update: (...a: [{ where: { id: string } }]) => atualizarAgendamento(...a),
    },
  },
}));
vi.mock('../../lib/politicas', () => ({
  filtroDe: async () => ({}),
  politicaProtocolos: {},
  politicaConversas: {},
  exigirVinculosVisiveis: vi.fn(),
}));
vi.mock('../../lib/storage', () => ({ urlAssinada: (u: string) => u }));
vi.mock('../../lib/tenant', () => ({ organizacaoAtual: () => organizacaoDoChamador }));
vi.mock('../../realtime/hub', () => ({ notificarProtocolo: (...a: unknown[]) => notificar(...a) }));

import { concluirAgendamento } from './tickets.service';

beforeEach(() => {
  protocolos.clear();
  agendamentos.clear();
  atualizarAgendamento.mockClear();
  notificar.mockClear();
  organizacaoDoChamador = 'org-a';
  protocolos.set('t-visivel', { id: 't-visivel', organizacaoId: 'org-a', visivel: true });
  protocolos.set('t-oculto', { id: 't-oculto', organizacaoId: 'org-a', visivel: false });
  protocolos.set('t-outra-org', { id: 't-outra-org', organizacaoId: 'org-b', visivel: true });
  agendamentos.set('ag-1', { id: 'ag-1', ticketId: 't-visivel', concluido: false });
  agendamentos.set('ag-2', { id: 'ag-2', ticketId: 't-oculto', concluido: false });
  agendamentos.set('ag-3', { id: 'ag-3', ticketId: 't-outra-org', concluido: false });
});

describe('concluirAgendamento — visibilidade do protocolo', () => {
  it('conclui o agendamento de um protocolo visivel ao usuario', async () => {
    const detalhe = await concluirAgendamento('t-visivel', 'ag-1');

    expect(atualizarAgendamento).toHaveBeenCalledTimes(1);
    expect(agendamentos.get('ag-1')!.concluido).toBe(true);
    expect(detalhe.id).toBe('t-visivel');
  });

  it('protocolo fora do escopo do usuario responde 404 e nao escreve nada', async () => {
    await expect(concluirAgendamento('t-oculto', 'ag-2')).rejects.toMatchObject({ status: 404 });

    expect(atualizarAgendamento).not.toHaveBeenCalled();
    expect(agendamentos.get('ag-2')!.concluido).toBe(false);
    // Nem o detalhe vazou, nem os interessados foram notificados.
    expect(notificar).not.toHaveBeenCalled();
  });

  it('protocolo de OUTRA organizacao responde 404 e nao escreve nada', async () => {
    await expect(concluirAgendamento('t-outra-org', 'ag-3')).rejects.toMatchObject({ status: 404 });

    expect(atualizarAgendamento).not.toHaveBeenCalled();
    expect(agendamentos.get('ag-3')!.concluido).toBe(false);
  });

  it('agendamento de outro protocolo (mesmo visivel) continua respondendo 404', async () => {
    // ag-2 pertence a t-oculto; pedir por t-visivel nao pode concluir nem revelar.
    await expect(concluirAgendamento('t-visivel', 'ag-2')).rejects.toMatchObject({ status: 404 });

    expect(atualizarAgendamento).not.toHaveBeenCalled();
    expect(agendamentos.get('ag-2')!.concluido).toBe(false);
  });

  it('protocolo inexistente responde 404', async () => {
    await expect(concluirAgendamento('nao-existe', 'ag-1')).rejects.toMatchObject({ status: 404 });
    expect(atualizarAgendamento).not.toHaveBeenCalled();
  });
});
