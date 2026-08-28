import { describe, expect, it } from 'vitest';
import {
  politicaAtividades,
  politicaContas,
  politicaContatos,
  politicaConversas,
  politicaLeads,
  politicaOportunidades,
  politicaProtocolos,
} from './politicas';
import { apenasVisivel, filtroCarteira, responsaveisNoEscopo, type ContextoVisibilidade } from './visibilidade';

/**
 * As politicas de visibilidade, como funcoes puras.
 *
 * Nao tocam o banco de proposito: o que se verifica aqui e a **forma do filtro**,
 * e um teste que precisa de Postgresql para provar que um `where` tem certo termo
 * so acrescenta motivo para falhar por outra razao. O efeito no banco e coberto
 * pelo `smoke:visibilidade`, com cinco usuarios de verdade.
 *
 * A propriedade mais importante esta em "nada vira sem filtro": um filtro vazio
 * (`{}`) significa **sem restricao** no Prisma. Se a politica de um perfil
 * restrito devolvesse `{}` por descuido — um `if` a mais, uma lista vazia
 * tratada como "ignore este termo" — a consulta passaria a devolver a
 * organizacao inteira, e nenhum teste de caminho felizo notaria.
 */

const EU = 'u-eu';
const COLEGA = 'u-colega';

const ctx = (parcial: Partial<ContextoVisibilidade>): ContextoVisibilidade => ({
  usuarioId: EU,
  perfil: 'AGENTE',
  filaIds: [],
  equipeIds: [EU],
  veTudo: false,
  veEquipe: false,
  carteiraAberta: false,
  ...parcial,
});

const ADMIN = ctx({ perfil: 'ADMIN', veTudo: true, carteiraAberta: true });
const SUPERVISOR = ctx({ perfil: 'SUPERVISOR', veTudo: true, carteiraAberta: true });
const GESTOR = ctx({ perfil: 'GESTOR', veEquipe: true, carteiraAberta: true, equipeIds: [EU, COLEGA] });
const COMERCIAL = ctx({ perfil: 'COMERCIAL', carteiraAberta: true });
const AGENTE = ctx({ perfil: 'AGENTE', filaIds: ['f-1'] });
const AGENTE_SEM_FILA = ctx({ perfil: 'AGENTE' });

const TODAS = [
  politicaConversas,
  politicaProtocolos,
  politicaContatos,
  politicaContas,
  politicaLeads,
  politicaOportunidades,
  politicaAtividades,
];

describe('quem ve tudo', () => {
  it('ADMIN e SUPERVISOR recebem filtro vazio em todos os dominios', () => {
    for (const politica of TODAS) {
      expect(politica.filtro(ADMIN)).toEqual({});
      expect(politica.filtro(SUPERVISOR)).toEqual({});
    }
  });
});

describe('nada vira sem filtro', () => {
  it('nenhum perfil restrito recebe filtro vazio em dominio nenhum', () => {
    for (const politica of TODAS) {
      for (const contexto of [GESTOR, COMERCIAL, AGENTE, AGENTE_SEM_FILA]) {
        const filtro = politica.filtro(contexto);
        expect(
          Object.keys(filtro).length,
          `${contexto.perfil} recebeu filtro vazio — isso e "sem restricao"`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('agente sem fila nenhuma nao ve espera nenhuma, e nao vira sem filtro', () => {
    const filtro = politicaConversas.filtro(AGENTE_SEM_FILA);
    // O termo da fila continua no filtro, com lista vazia: `in: []` nao casa
    // com nada. Omitir o termo seria "qualquer conversa em espera".
    expect(filtro).toEqual({
      OR: [{ agenteId: EU }, { status: 'EM_ESPERA', filaId: { in: [] } }],
    });
  });
});

describe('escopo por responsavel', () => {
  it('gestor alcanca a equipe; os demais, so a si', () => {
    expect(responsaveisNoEscopo(GESTOR)).toEqual([EU, COLEGA]);
    expect(responsaveisNoEscopo(COMERCIAL)).toEqual([EU]);
    expect(responsaveisNoEscopo(AGENTE)).toEqual([EU]);
    // O proprio gestor esta na equipe: sem isso, gestor sem subordinado nao
    // veria nem os proprios registros.
    expect(responsaveisNoEscopo(GESTOR)).toContain(EU);
  });

  it('carteira aberta acrescenta "sem responsavel"; sem ela, o termo nao existe', () => {
    expect(filtroCarteira(COMERCIAL)).toEqual({
      OR: [{ responsavelId: { in: [EU] } }, { responsavelId: null }],
    });
    expect(filtroCarteira(AGENTE)).toEqual({ OR: [{ responsavelId: { in: [EU] } }] });
  });
});

describe('conversas', () => {
  it('gestor ve a equipe e a espera — espera e fila, nao carteira', () => {
    expect(politicaConversas.filtro(GESTOR)).toEqual({
      OR: [{ agenteId: { in: [EU, COLEGA] } }, { status: 'EM_ESPERA' }],
    });
  });

  it('comercial e agente veem as proprias e a espera das filas em que atuam', () => {
    expect(politicaConversas.filtro(AGENTE)).toEqual({
      OR: [{ agenteId: EU }, { status: 'EM_ESPERA', filaId: { in: ['f-1'] } }],
    });
  });
});

describe('protocolos', () => {
  it('sem responsavel segue a fila, nao a carteira', () => {
    // Mesmo para quem tem carteira aberta: protocolo sem dono numa fila que nao
    // e sua nao e seu. `Ticket` nao tem status de espera — "espera" e
    // responsavel nulo com fila.
    expect(politicaProtocolos.filtro(COMERCIAL)).toEqual({
      OR: [{ responsavelId: { in: [EU] } }, { responsavelId: null, filaId: { in: [] } }],
    });
    expect(politicaProtocolos.filtro(AGENTE)).toEqual({
      OR: [{ responsavelId: { in: [EU] } }, { responsavelId: null, filaId: { in: ['f-1'] } }],
    });
  });
});

describe('contatos', () => {
  it('gestao e comercial usam carteira', () => {
    expect(politicaContatos.filtro(COMERCIAL)).toEqual(filtroCarteira(COMERCIAL));
    expect(politicaContatos.filtro(GESTOR)).toEqual(filtroCarteira(GESTOR));
  });

  it('para o agente, contato sem responsavel NAO fica visivel por ser sem responsavel', () => {
    const filtro = politicaContatos.filtro(AGENTE) as { OR: Array<Record<string, unknown>> };

    /*
     * A regra do agente e vinculo operacional: um termo `responsavelId: null`
     * **solto no topo** abriria toda a base numa instalacao onde ninguem
     * atribuiu responsavel — que e o caso hoje.
     *
     * A conferencia e nos termos do topo, e nao no JSON inteiro: dentro do
     * filtro de protocolo o `responsavelId: null` aparece de forma legitima,
     * pareado com `filaId` (protocolo sem dono numa fila que e dele). Foi o que
     * a primeira versao deste teste acusou por engano.
     */
    expect(filtro.OR.some((t) => 'responsavelId' in t && t.responsavelId === null)).toBe(false);
    expect(filtro).toEqual({
      OR: [
        { responsavelId: EU },
        { conversas: { some: politicaConversas.filtro(AGENTE) } },
        { protocolos: { some: politicaProtocolos.filtro(AGENTE) } },
      ],
    });
  });
});

describe('contas', () => {
  it('agente chega ao cliente pela tabela, nao por carteira', () => {
    expect(politicaContas.filtro(AGENTE)).toEqual({
      contatos: { some: politicaContatos.filtro(AGENTE) },
    });
  });
});

describe('leads e oportunidades', () => {
  it('agente nao alcanca nenhum, e o filtro recusa em vez de nao filtrar', () => {
    // O `requireRole` da rota e a primeira trava. Esta e a segunda: se alguem
    // remover a primeira, o agente continua sem ver o funil.
    for (const politica of [politicaLeads, politicaOportunidades]) {
      expect(politica.filtro(AGENTE)).toEqual({ id: { in: [] } });
      expect(politica.filtro(AGENTE_SEM_FILA)).toEqual({ id: { in: [] } });
    }
  });

  it('comercial e gestor usam carteira', () => {
    expect(politicaOportunidades.filtro(COMERCIAL)).toEqual(filtroCarteira(COMERCIAL));
    expect(politicaLeads.filtro(GESTOR)).toEqual(filtroCarteira(GESTOR));
  });
});

describe('atividades', () => {
  it('a visibilidade deriva: responsavel, autor ou registro-pai visivel', () => {
    const filtro = politicaAtividades.filtro(COMERCIAL);
    expect(filtro).toEqual({
      OR: [
        { responsavelId: { in: [EU] } },
        { criadoPorId: EU },
        { contato: politicaContatos.filtro(COMERCIAL) },
        { conta: politicaContas.filtro(COMERCIAL) },
        { oportunidade: politicaOportunidades.filtro(COMERCIAL) },
      ],
    });
  });

  it('atividade nao tem termo proprio de "sem responsavel"', () => {
    // Uma nota escrita numa ficha nao pode ser mais aberta do que a ficha. O
    // `responsavelId: null` so entra aqui atraves do pai, se o pai o permitir.
    const raiz = politicaAtividades.filtro(COMERCIAL) as { OR: Array<Record<string, unknown>> };
    expect(raiz.OR.some((t) => 'responsavelId' in t && t.responsavelId === null)).toBe(false);
  });
});

describe('acesso por id', () => {
  it('usa o mesmo filtro da listagem, num AND com o id', () => {
    const filtro = politicaContas.filtro(COMERCIAL);
    expect(apenasVisivel('abc', filtro)).toEqual({ AND: [{ id: 'abc' }, filtro] });
  });
});
