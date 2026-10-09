export type UsuarioDestino = { id: string; nome: string; perfil: string; status: string };
export type Destinos = { usuarios: UsuarioDestino[]; filas: Array<{ id: string; nome: string }> };
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function separarDestinos(destinos: Destinos, busca: string, agenteAtualId: string | null) {
  const termo = normalizar(busca.trim());
  const casa = (nome: string) => !termo || normalizar(nome).includes(termo);
  const pessoas = destinos.usuarios.filter((usuario) => usuario.id !== agenteAtualId && casa(usuario.nome));
  return {
    disponiveis: pessoas.filter((usuario) => usuario.status !== 'OFFLINE'),
    indisponiveis: pessoas.filter((usuario) => usuario.status === 'OFFLINE'),
    equipes: destinos.filas.filter((fila) => casa(fila.nome)),
  };
}
