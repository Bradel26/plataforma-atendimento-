/**
 * Tarefas de retomada em lote (CRM > Acompanhamentos > "Sem interacao").
 *
 * Cria so TAREFAS INTERNAS na agenda do responsavel; nao envia mensagem, nao liga,
 * nao chama o parceiro. Quem retoma o contato e uma pessoa, depois de ver a tarefa.
 * Regras: quem nao tem responsavel fica de fora (atribua antes); quem ja tem tarefa
 * de retomada aberta nao recebe outra.
 */
export type ParceiroParaRetomada = { id: string; contatoId: string; responsavelId: string | null };

export type PlanoDeRetomada = {
  criar: string[];
  semResponsavel: string[];
  jaTemTarefa: string[];
  naoEncontrados: string[];
};

export function planejarRetomada(
  idsPedidos: string[],
  encontrados: ParceiroParaRetomada[],
  contatosComTarefaAberta: Set<string>,
): PlanoDeRetomada {
  const porId = new Map(encontrados.map((p) => [p.id, p]));
  const plano: PlanoDeRetomada = { criar: [], semResponsavel: [], jaTemTarefa: [], naoEncontrados: [] };
  const contatosJaPlanejados = new Set<string>();
  for (const id of new Set(idsPedidos)) {
    const p = porId.get(id);
    if (!p) plano.naoEncontrados.push(id);
    else if (!p.responsavelId) plano.semResponsavel.push(id);
    else if (contatosComTarefaAberta.has(p.contatoId) || contatosJaPlanejados.has(p.contatoId)) plano.jaTemTarefa.push(id);
    else {
      contatosJaPlanejados.add(p.contatoId); // o mesmo contato em duas esteiras ganha uma tarefa so
      plano.criar.push(id);
    }
  }
  return plano;
}

export const PREFIXO_CHAVE_RETOMADA = 'retomada:';
