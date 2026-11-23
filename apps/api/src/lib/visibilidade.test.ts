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
  perfil: 'SUPORTE',
  filaIds: [],
  equipeIds: [EU],
  veTudo: false,
  veEquipe: false,
  ...parcial,
});

const ADMIN = ctx({ perfil: 'ADMIN', veTudo: true });
const SUPERVISOR = ctx({ perfil: 'SUPERVISOR', veTudo: true });
const GESTOR = ctx({ perfil: 'GESTOR', veEquipe: true, equipeIds: [EU, COLEGA] });
const COMERCIAL = ctx({ perfil: 'COMERCIAL' });
const SUPORTE = ctx({ perfil: 'SUPORTE', filaIds: ['f-1'] });
const SUPORTE_SEM_FILA = ctx({ perfil: 'SUPORTE' });

/** Conversa do Numero da empresa: sem linha, ou linha sem dono (2026-10-05). */
const EMPRESA = { OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }] };
const ATRIBUIDA_A_MIM = { agenteId: EU };

/**
 * `politicaConversas` fica FORA desta lista: o SUPERVISOR nao recebe filtro
 * vazio nela (2026-10-05) — tem describe proprio em 'conversas', mais abaixo.
 */
const TODAS = [
  politicaProtocolos,
  politicaContatos,
  politicaContas,
  politicaLeads,
  politicaOportunidades,
  politicaAtividades,
];

describe('quem ve tudo', () => {
  it('ADMIN e SUPERVISOR recebem filtro vazio em todos os dominios (exceto conversas, ver describe proprio)', () => {
    for (const politica of TODAS) {
      expect(politica.filtro(ADMIN)).toEqual({});
      expect(politica.filtro(SUPERVISOR)).toEqual({});
    }
  });
});

describe('nada vira sem filtro', () => {
  it('nenhum perfil restrito recebe filtro vazio em dominio nenhum', () => {
    for (const politica of TODAS) {
      for (const contexto of [GESTOR, COMERCIAL, SUPORTE, SUPORTE_SEM_FILA]) {
        const filtro = politica.filtro(contexto);
        expect(
          Object.keys(filtro).length,
          `${contexto.perfil} recebeu filtro vazio — isso e "sem restricao"`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('suporte sem fila nenhuma nao ve espera nenhuma, e nao vira sem filtro', () => {
    // O termo da fila continua no filtro, com lista vazia: `in: []` nao casa
    // com nada. Omitir o termo seria "qualquer conversa em espera".
    expect(politicaConversas.filtro(SUPORTE_SEM_FILA)).toEqual({
      OR: [ATRIBUIDA_A_MIM, { status: 'EM_ESPERA', filaId: { in: [] } }],
    });
  });
});

describe('escopo por responsavel', () => {
  it('gestor alcanca a equipe; os demais, so a si', () => {
    expect(responsaveisNoEscopo(GESTOR)).toEqual([EU, COLEGA]);
    expect(responsaveisNoEscopo(COMERCIAL)).toEqual([EU]);
    expect(responsaveisNoEscopo(SUPORTE)).toEqual([EU]);
    // O proprio gestor esta na equipe: sem isso, gestor sem subordinado nao
    // veria nem os proprios registros.
    expect(responsaveisNoEscopo(GESTOR)).toContain(EU);
  });

  it('a carteira e os proprios registros mais os sem responsavel', () => {
    const esperado = { OR: [{ responsavelId: { in: [EU] } }, { responsavelId: null }] };
    expect(filtroCarteira(COMERCIAL)).toEqual(esperado);
    expect(filtroCarteira(SUPORTE)).toEqual(esperado);
  });
});

describe('conversas (organizadas por numero, 2026-10-05)', () => {
  it('ADMIN ve todas, inclusive numero pessoal de outra pessoa', () => {
    expect(politicaConversas.filtro(ADMIN)).toEqual({});
  });

  it('SUPERVISOR ve Numero da empresa, numeros de Comercial e Suporte, e o atribuido a ele', () => {
    expect(politicaConversas.filtro(SUPERVISOR)).toEqual({
      OR: [
        EMPRESA,
        { canalConfig: { dono: { perfil: { in: ['COMERCIAL', 'SUPORTE'] } } } },
        ATRIBUIDA_A_MIM,
      ],
    });
  });

  it('SUPERVISOR nunca recebe filtro vazio — sem isso veria o numero do Administrador', () => {
    expect(Object.keys(politicaConversas.filtro(SUPERVISOR)).length).toBeGreaterThan(0);
  });

  it('gestor: atribuidas, e a espera e a equipe so no Numero da empresa', () => {
    expect(politicaConversas.filtro(GESTOR)).toEqual({
      OR: [
        ATRIBUIDA_A_MIM,
        { AND: [EMPRESA, { OR: [{ agenteId: { in: [EU, COLEGA] } }, { status: 'EM_ESPERA' }] }] },
      ],
    });
  });

  it('comercial/suporte: atribuidas e espera das filas em que atuam', () => {
    // A origem da linha nao mantem acesso depois que a conversa e transferida.
    expect(politicaConversas.filtro(SUPORTE)).toEqual({
      OR: [ATRIBUIDA_A_MIM, { status: 'EM_ESPERA', filaId: { in: ['f-1'] } }],
    });
  });
});

describe('protocolos', () => {
  it('sem responsavel segue a fila, nao a carteira', () => {
    // Protocolo sem dono numa fila que nao e sua nao e seu. `Ticket` nao tem
    // status de espera — "espera" e responsavel nulo com fila.
    expect(politicaProtocolos.filtro(COMERCIAL)).toEqual({
      OR: [{ responsavelId: { in: [EU] } }, { responsavelId: null, filaId: { in: [] } }],
    });
    expect(politicaProtocolos.filtro(SUPORTE)).toEqual({
      OR: [{ responsavelId: { in: [EU] } }, { responsavelId: null, filaId: { in: ['f-1'] } }],
    });
  });
});

describe('contatos, contas, leads e oportunidades', () => {
  it('todos os perfis restritos usam carteira', () => {
    for (const contexto of [COMERCIAL, SUPORTE, GESTOR]) {
      expect(politicaContatos.filtro(contexto)).toEqual(filtroCarteira(contexto));
      expect(politicaContas.filtro(contexto)).toEqual(filtroCarteira(contexto));
      expect(politicaLeads.filtro(contexto)).toEqual(filtroCarteira(contexto));
      expect(politicaOportunidades.filtro(contexto)).toEqual(filtroCarteira(contexto));
    }
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
