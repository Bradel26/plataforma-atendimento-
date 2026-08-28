import { describe, expect, it } from 'vitest';
import { NAV, itemDaRota } from './nav';

/**
 * O menu como fonte unica de rota e permissao.
 *
 * A rota de detalhe (`/contatos/:id`) e o caminho que **nao passa pelo menu**:
 * quem digita a URL, ou clica num link colado no chat, entra sem nunca ter visto
 * a barra lateral. Se a permissao dela vivesse numa lista separada, seria
 * possivel a rota do modulo exigir ADMIN e a rota do registro nao exigir nada,
 * e nenhum teste reclamaria. Estes casos amarram as duas.
 */
describe('navegacao', () => {
  it('a rota do modulo resolve para o proprio modulo', () => {
    expect(itemDaRota('/crm')?.rota).toBe('/crm');
    expect(itemDaRota('/configuracoes')?.rota).toBe('/configuracoes');
  });

  it('a rota de registro resolve para o modulo dono', () => {
    for (const caminho of ['/contatos/abc', '/clientes/abc', '/oportunidades/abc']) {
      expect(itemDaRota(caminho)?.rota).toBe('/crm');
    }
  });

  it('a rota de registro herda exatamente os perfis do modulo', () => {
    const crm = NAV.find((i) => i.rota === '/crm')!;
    for (const caminho of ['/contatos/abc', '/clientes/abc', '/oportunidades/abc']) {
      expect(itemDaRota(caminho)?.perfis).toEqual(crm.perfis);
    }
  });

  it('toda subrota declarada resolve de volta para quem a declarou', () => {
    // Vale para os modulos que ainda vao ganhar rota de registro nas proximas
    // etapas: a subrota que resolver para outro item — ou para nenhum — falha
    // aqui, e nao em producao com a permissao errada.
    for (const item of NAV) {
      for (const subrota of item.subrotas ?? []) {
        const exemplo = subrota.replace(/\/:[^/]+/g, '/exemplo');
        expect(itemDaRota(exemplo)?.rota, `${subrota} deveria pertencer a ${item.rota}`).toBe(item.rota);
      }
    }
  });

  it('a rota de registro sem id nao e rota de registro', () => {
    // `/contatos` sozinho nao existe: nao ha registro para abrir, e cair no CRM
    // faria a lista aparecer numa URL que ninguem gera.
    expect(itemDaRota('/contatos')).toBeUndefined();
    expect(itemDaRota('/clientes')).toBeUndefined();
    expect(itemDaRota('/oportunidades')).toBeUndefined();
  });

  it('rota desconhecida nao resolve para modulo nenhum', () => {
    expect(itemDaRota('/inventado')).toBeUndefined();
    // Prefixo parecido nao conta: era o defeito do `startsWith` solto, que
    // marcava `/configuracoes` como ativa em qualquer coisa comecando igual.
    expect(itemDaRota('/crm-antigo')).toBeUndefined();
    expect(itemDaRota('/configuracoes-old')).toBeUndefined();
  });

  it('nenhuma subrota colide com a rota de outro modulo', () => {
    const rotas = new Set(NAV.map((i) => i.rota));
    for (const item of NAV) {
      for (const subrota of item.subrotas ?? []) {
        const base = subrota.slice(0, subrota.indexOf('/:'));
        expect(rotas.has(base), `${subrota} colide com o modulo ${base}`).toBe(false);
      }
    }
  });
});
