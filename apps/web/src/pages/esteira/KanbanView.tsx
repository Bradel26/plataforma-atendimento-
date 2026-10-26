import { EmConstrucao } from './EmConstrucao';
import type { PropsDaVisao } from './estadoEsteira';

/** Kanban da operação (spec 6.1). PLACEHOLDER — a Task 15 implementa sobre `GET /esteiras/:operacao/kanban`. */
export function KanbanView({ estrutura }: PropsDaVisao) {
  return (
    <EmConstrucao
      titulo="Kanban: em construção — Task 15"
      descricao={`${estrutura.etapas.length} etapa(s) nesta operação. O quadro volta na próxima entrega.`}
    />
  );
}
