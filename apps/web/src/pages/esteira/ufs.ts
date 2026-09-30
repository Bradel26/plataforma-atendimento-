/** As 27 unidades da federacao, na ordem alfabetica da sigla. */
export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

/** Estados em que a Bradel atua: a lista de UF do cadastro e do filtro de Contatos. */
export const UFS_ATENDIDAS = [
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'TO', nome: 'Tocantins' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'RR', nome: 'Roraima' },
] as const;
