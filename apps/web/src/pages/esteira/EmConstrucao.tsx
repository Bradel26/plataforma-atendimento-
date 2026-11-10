import { EmptyState } from '../../components/ui';

/** Marcador das partes da Esteira ainda não reimplementadas sobre a API nova. */
export function EmConstrucao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return <EmptyState titulo={titulo} descricao={descricao} />;
}
