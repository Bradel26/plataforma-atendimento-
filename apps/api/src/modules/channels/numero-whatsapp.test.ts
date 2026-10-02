import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkNumber = vi.fn();
vi.mock('./channels.service', () => ({ obterConfig: vi.fn(async () => ({ ponteUrl: 'http://p', ponteToken: 't' })) }));
vi.mock('./whatsapp-provider.factory', () => ({ getWhatsAppProvider: () => ({ checkNumber }) }));

import { telefoneComMascara, telefoneConferidoNoWhatsApp } from './numero-whatsapp';

describe('telefoneComMascara', () => {
  it('celular de 9 digitos e numero antigo de 8', () => {
    expect(telefoneComMascara('5562984316390')).toBe('+55 62 98431-6390');
    expect(telefoneComMascara('556284316390')).toBe('+55 62 8431-6390');
  });
  it('fora do padrao brasileiro fica so com +', () => {
    expect(telefoneComMascara('14155550123')).toBe('+14155550123');
  });
});

describe('telefoneConferidoNoWhatsApp', () => {
  beforeEach(() => {
    checkNumber.mockReset();
  });

  it('recusa numero que nao esta no WhatsApp', async () => {
    checkNumber.mockResolvedValue({ existe: false, numero: null });
    await expect(telefoneConferidoNoWhatsApp('+55 62 9843-1639')).rejects.toMatchObject({ code: 'NUMERO_SEM_WHATSAPP' });
  });

  it('grava a forma real quando o WhatsApp usa outra (sem o nono digito)', async () => {
    checkNumber.mockResolvedValue({ existe: true, numero: '556284316390' });
    await expect(telefoneConferidoNoWhatsApp('+55 62 98431-6390')).resolves.toBe('+55 62 8431-6390');
  });

  it('mantem o numero digitado quando ja e o real', async () => {
    checkNumber.mockResolvedValue({ existe: true, numero: '5562984316390' });
    await expect(telefoneConferidoNoWhatsApp('+55 62 98431-6390')).resolves.toBe('+55 62 98431-6390');
  });

  it('nao sabe (ponte responde sem certeza): grava como veio', async () => {
    checkNumber.mockResolvedValue({ existe: null, numero: null });
    await expect(telefoneConferidoNoWhatsApp('+55 62 98431-6390')).resolves.toBe('+55 62 98431-6390');
  });

  it('nao sabe (ponte falhou): grava como veio', async () => {
    checkNumber.mockImplementation(() => Promise.reject(new Error('timeout')));
    const telefone = await telefoneConferidoNoWhatsApp('+55 62 98431-6390');
    expect(telefone).toBe('+55 62 98431-6390');
  });

  it('telefone que nao e numero nao consulta nada', async () => {
    await expect(telefoneConferidoNoWhatsApp('abc')).resolves.toBe('abc');
    expect(checkNumber).not.toHaveBeenCalled();
  });
});
