/** `5562999990000` -> `(62) 99999-0000`. Numero de fora do Brasil fica como veio, com `+`. */
export function telefoneLegivel(numero: string): string {
  const m = numero.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${numero}`;
}
