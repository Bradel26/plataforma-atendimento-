import { AppError } from '../../lib/errors';
import { obterConfig } from './channels.service';
import { getWhatsAppProvider } from './whatsapp-provider.factory';
import { numeroNormalizado } from './whatsapp.modo';

/** `5562984316390` -> `+55 62 98431-6390` (mesmo desenho da mascara da tela de cadastro). */
export function telefoneComMascara(digitos: string): string {
  const m = digitos.match(/^55(\d{2})(\d{8,9})$/);
  if (!m) return `+${digitos}`;
  const local = m[2]!;
  return `+55 ${m[1]} ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
}

/**
 * Confere o telefone no WhatsApp antes de gravar o contato, como o Whatsbot Pro
 * faz no cadastro: numero que nao existe e recusado e o numero e gravado na forma
 * que o WhatsApp usa de verdade (com ou sem o nono digito). Se nao der para
 * perguntar (ponte fora do ar, canal sem suporte), grava como veio: a conferencia
 * nunca impede o cadastro por instabilidade.
 */
export async function telefoneConferidoNoWhatsApp(telefone: string): Promise<string> {
  const numero = numeroNormalizado(telefone);
  if (!numero) return telefone;

  let resultado: { existe: boolean | null; numero: string | null };
  try {
    const config = await obterConfig('WHATSAPP');
    const provider = getWhatsAppProvider();
    if (!config || !provider.checkNumber) return telefone;
    resultado = await provider.checkNumber(config, numero);
  } catch {
    return telefone;
  }

  if (resultado.existe === false) {
    throw new AppError(
      422,
      'NUMERO_SEM_WHATSAPP',
      'Este número não está no WhatsApp. Confira o DDD e os dígitos.',
    );
  }
  if (resultado.existe === true && resultado.numero && resultado.numero !== numero) {
    return telefoneComMascara(resultado.numero);
  }
  return telefone;
}
