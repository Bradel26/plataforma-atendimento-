import { describe, expect, it } from 'vitest';
import { resumoConversasPorStatus } from './metrics.service';

describe('resumoConversasPorStatus', () => {
  it('soma AGUARDANDO_CLIENTE dentro de emAtendimento, sem subnotificar o card do dashboard', () => {
    const r = resumoConversasPorStatus({ EM_ESPERA: 2, ATRIBUIDO: 1, EM_ATENDIMENTO: 3, AGUARDANDO_CLIENTE: 4, FINALIZADO: 5 });
    expect(r).toEqual({ emEspera: 2, atribuidas: 1, emAtendimento: 7, finalizadas: 5 });
  });

  it('grupo ausente conta como zero', () => {
    const r = resumoConversasPorStatus({});
    expect(r).toEqual({ emEspera: 0, atribuidas: 0, emAtendimento: 0, finalizadas: 0 });
  });
});
