import { describe, expect, it } from 'vitest';
import { auditoriaSchema, filtrosDaAuditoria, situacaoDaConversa } from './conversations.auditoria';

describe('situacaoDaConversa', () => {
  it('traduz o status interno para o rótulo da auditoria', () => {
    expect(situacaoDaConversa('EM_ESPERA')).toBe('AGUARDANDO_FILA');
    expect(situacaoDaConversa('ATRIBUIDO')).toBe('EM_ATENDIMENTO');
    expect(situacaoDaConversa('EM_ATENDIMENTO')).toBe('EM_ATENDIMENTO');
    expect(situacaoDaConversa('FINALIZADO')).toBe('FINALIZADA');
  });
});

describe('auditoriaSchema', () => {
  it('aceita filtro repetido como lista e página padrão 1 x 10', () => {
    const q = auditoriaSchema.parse({ agenteId: '11111111-1111-1111-1111-111111111111', situacao: ['EM_ATENDIMENTO'] });
    expect(q.pagina).toBe(1);
    expect(q.tamanho).toBe(10);
    expect(q.agenteId).toEqual(['11111111-1111-1111-1111-111111111111']);
  });

  it('recusa intervalo de início invertido', () => {
    expect(() => auditoriaSchema.parse({ inicioDe: '2026-10-09', inicioAte: '2026-10-01' })).toThrow();
  });
});

describe('filtrosDaAuditoria', () => {
  const base = auditoriaSchema.parse({});

  it('sem filtro não restringe nada', () => {
    expect(filtrosDaAuditoria(base)).toEqual([]);
  });

  it('usuário casa com atendente inicial ou responsável atual', () => {
    const q = auditoriaSchema.parse({ agenteId: ['11111111-1111-1111-1111-111111111111'] });
    expect(filtrosDaAuditoria(q)).toContainEqual({
      OR: [
        { agenteId: { in: ['11111111-1111-1111-1111-111111111111'] } },
        { atendenteInicialId: { in: ['11111111-1111-1111-1111-111111111111'] } },
      ],
    });
  });

  it('situação vira status; SEM_EQUIPE vira filaId nulo', () => {
    const q = auditoriaSchema.parse({ situacao: ['EM_ATENDIMENTO', 'FINALIZADA'], filaId: ['SEM_EQUIPE'] });
    const filtros = filtrosDaAuditoria(q);
    expect(filtros).toContainEqual({ status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO', 'FINALIZADO'] } });
    expect(filtros).toContainEqual({ OR: [{ filaId: null }] });
  });

  it('telefone filtra só pelos dígitos', () => {
    const q = auditoriaSchema.parse({ telefone: '(62) 99219-7010' });
    expect(filtrosDaAuditoria(q)).toContainEqual({ contato: { telefone: { contains: '62992197010' } } });
  });
});
