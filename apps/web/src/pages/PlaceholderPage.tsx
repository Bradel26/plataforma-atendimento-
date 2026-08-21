import { Card } from '../components/ui';

/**
 * Pagina de modulo ainda nao implementado. Existe para que o menu lateral da
 * Fase 0 seja navegavel por completo; cada rota e substituida na fase indicada.
 */
export function PlaceholderPage({ titulo, fase, descricao }: { titulo: string; fase: number; descricao: string }) {
  return (
    <Card titulo={titulo} descricao={`Previsto para a Fase ${fase} do roadmap`}>
      <p className="text-sm text-slate-600">{descricao}</p>
      <p className="mt-4 text-xs text-slate-400">
        A Fase 0 entrega fundacao, autenticacao com 3 perfis, layout base e White Label.
      </p>
    </Card>
  );
}
