import { Alerta, Button } from './index';
import { SkeletonTexto } from './Skeleton';

/**
 * Estados de uma tela que busca dados, para nao confundir "ainda nao chegou" e
 * "falhou" com "zero":
 * - carregando: esqueleto (nunca um zero ou lista vazia);
 * - erro sem dado: mensagem + "Tentar de novo";
 * - vazio de verdade: cada tela usa o seu `EmptyState`/texto, so depois de a
 *   consulta concluir com sucesso.
 */
export function Carregando({ rotulo = 'Carregando' }: { rotulo?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-2">
      <span className="sr-only">{rotulo}...</span>
      <SkeletonTexto linhas={3} />
    </div>
  );
}

export function ErroComTentarDeNovo({ mensagem, aoTentar }: { mensagem: string; aoTentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2">
      <Alerta>{mensagem}</Alerta>
      <Button variante="neutro" tamanho="sm" onClick={aoTentar}>
        Tentar de novo
      </Button>
    </div>
  );
}

/** Escolhe entre esqueleto e erro enquanto ainda nao ha dado nenhum. */
export function SemDadosAinda({ erro, aoTentar, rotulo }: { erro: string | null; aoTentar: () => void; rotulo?: string }) {
  return erro ? <ErroComTentarDeNovo mensagem={erro} aoTentar={aoTentar} /> : <Carregando rotulo={rotulo} />;
}
