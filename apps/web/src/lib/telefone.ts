/** `5562999990000` -> `(62) 99999-0000`. Numero de fora do Brasil fica como veio, com `+`. */
export function telefoneLegivel(numero: string): string {
  const m = numero.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${numero}`;
}

/**
 * Mascara de digitacao: formata o que a pessoa digita num campo de telefone
 * para `+55 DD DDDDD-DDDD` (celular, 9 digitos) ou `+55 DD DDDD-DDDD` (fixo,
 * 8 digitos) progressivamente, aceitando so numeros — cola, traço ou
 * parenteses que a pessoa digitar sao ignorados e recalculados aqui.
 *
 * Motivo (2026-09-25): digitar o numero em formatos diferentes ("62992885001"
 * vs "+55 62 9288-5001") levava a menos digitos por engano num deles — a
 * mascara fixa o formato, evitando o typo de faltar/sobrar um digito.
 */
export function mascararTelefoneBr(valorDigitado: string): string {
  let digitos = valorDigitado.replace(/\D/g, '');
  // Se a pessoa colou o numero com 55 na frente, nao duplica o DDI.
  if (digitos.startsWith('55') && digitos.length > 11) digitos = digitos.slice(2);
  digitos = digitos.slice(0, 11); // DDD (2) + numero local (ate 9, celular)

  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  if (!ddd) return '+55';

  let saida = `+55 ${ddd}`;
  if (!resto) return saida;

  const quebra = resto.length > 4 ? resto.length - 4 : resto.length;
  const parte1 = resto.slice(0, quebra);
  const parte2 = resto.slice(quebra);
  saida += ` ${parte1}`;
  if (parte2) saida += `-${parte2}`;
  return saida;
}
