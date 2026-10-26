import { EmConstrucao } from './EmConstrucao';
import type { PropsDaVisao } from './estadoEsteira';

/** Lista paginada no servidor (spec 6.3). PLACEHOLDER — Task 17 sobre `GET /esteiras/:operacao/lista`. */
export function ListaView({ pref }: PropsDaVisao) {
  return (
    <EmConstrucao
      titulo="Lista: em construção — Task 17"
      descricao={`${pref.lista.colunas.length} coluna(s) visíveis na sua preferência.`}
    />
  );
}
