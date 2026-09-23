import { describe, expect, it } from 'vitest';
import { motivoParaRecusarCampanha } from './campanha.guarda';

describe('motivoParaRecusarCampanha', () => {
  it('recusa WhatsApp no modo nao oficial', () => {
    expect(motivoParaRecusarCampanha('WHATSAPP', 'NAO_OFICIAL')).toMatch(/sem API oficial/);
  });

  it('libera WhatsApp no modo oficial', () => {
    expect(motivoParaRecusarCampanha('WHATSAPP', 'OFICIAL')).toBeNull();
  });

  it('modo nulo vale como oficial (canal configurado antes de o modo existir)', () => {
    expect(motivoParaRecusarCampanha('WHATSAPP', null)).toBeNull();
    expect(motivoParaRecusarCampanha('WHATSAPP', undefined)).toBeNull();
  });

  it('nao interfere em outros canais', () => {
    expect(motivoParaRecusarCampanha('INSTAGRAM', 'NAO_OFICIAL')).toBeNull();
    expect(motivoParaRecusarCampanha('FACEBOOK', null)).toBeNull();
  });
});
