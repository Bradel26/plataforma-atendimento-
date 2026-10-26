/**
 * Regras de movimento vistas pela tela (Kanban e gaveta) — puro, sem React.
 *
 * A API é a barreira de verdade (`movimento.ts`): aqui só se decide o que
 * mostrar antes de chamar (coluna desabilitada, diálogo que já abre pedindo
 * justificativa ou motivo) e como traduzir a recusa do servidor (409/403/400)
 * no estado do `DialogoMovimento`. Quando a tela erra para mais (deixa tentar),
 * o servidor responde e o diálogo abre do mesmo jeito.
 */
import type {
  Avaliacao,
  EstruturaEsteira,
  EtapaEsteira,
  Opcao,
  Operacao,
} from '../../lib/esteiraTypes';

export type ResultadoDestino = Avaliacao['resultado'];

/** O que o diálogo pede além da justificativa: motivo livre (TIM) ou da lista de perdas (Starlink). */
export type PedidoDeMotivo = null | { tipo: 'texto' } | { tipo: 'perda'; opcoes: Opcao[] };

export type EstadoDialogo = {
  titulo: string;
  descricao: string;
  /** Pendências já traduzidas para leitura. */
  pendencias: string[];
  pedeJustificativa: boolean;
  motivo: PedidoDeMotivo;
  /** Recusa definitiva (403/proibido): o diálogo só explica e fecha. */
  bloqueio: string | null;
  /** Erro da última tentativa de confirmar. */
  erro: string | null;
};

/** Contexto para traduzir um erro quando o diálogo ainda não estava aberto. */
export type ContextoDialogo = { titulo: string; operacao: Operacao; motivoSeExigido: PedidoDeMotivo };

export type DecisaoMovimento =
  | { tipo: 'direto'; contexto: ContextoDialogo }
  | { tipo: 'dialogo'; estado: EstadoDialogo; contexto: ContextoDialogo }
  | { tipo: 'bloqueado'; motivo: string; contexto: ContextoDialogo };

const AVISO_SEM_PERMISSAO = 'Fora da regra: só administrador, supervisor ou gestor pode autorizar';

/** Se o cartão pode ser solto na coluna durante o arraste, e o aviso a mostrar nela. */
export function podeSoltar(destino: ResultadoDestino | undefined, podeForcar: boolean): { permitido: boolean; aviso: string | null } {
  switch (destino) {
    case 'LIVRE':
      return { permitido: true, aviso: null };
    case 'JUSTIFICATIVA':
      return { permitido: true, aviso: 'Pede justificativa' };
    case 'EXCECAO':
      return podeForcar
        ? { permitido: true, aviso: 'Fora da regra: pede justificativa' }
        : { permitido: false, aviso: AVISO_SEM_PERMISSAO };
    default:
      return { permitido: false, aviso: 'Movimento não permitido' };
  }
}

/** Classe de motivo que leva a cada saída da Starlink (spec 5.2). */
const CLASSE_DA_SAIDA: Record<string, 'RECUPERAVEL' | 'DEFINITIVO'> = {
  SL_NURTURE: 'RECUPERAVEL',
  SL_DESCARTADO: 'DEFINITIVO',
};

/** Motivo que a etapa exige ao entrar: saída TIM → texto; saída Starlink → lista filtrada pela classe. */
export function motivoDaEtapa(
  operacao: Operacao,
  etapa: Pick<EtapaEsteira, 'chave' | 'tipo'>,
  motivosPerda: EstruturaEsteira['motivosPerda'],
): PedidoDeMotivo {
  if (etapa.tipo !== 'SAIDA') return null;
  if (operacao === 'TIM') return { tipo: 'texto' };
  const classe = CLASSE_DA_SAIDA[etapa.chave];
  return {
    tipo: 'perda',
    opcoes: motivosPerda.filter((m) => !classe || m.classe === classe).map((m) => ({ valor: m.valor, rotulo: m.rotulo })),
  };
}

export const dialogoVazio = (titulo: string, descricao = ''): EstadoDialogo => ({
  titulo,
  descricao,
  pendencias: [],
  pedeJustificativa: false,
  motivo: null,
  bloqueio: null,
  erro: null,
});

/**
 * Antes de chamar o servidor: vai direto (LIVRE numa etapa sem motivo, e
 * EXCECAO — o 409 traz as pendências), abre o diálogo (justificativa e saídas)
 * ou recusa já (proibido; exceção sem permissão).
 */
export function decidirMovimento(p: {
  operacao: Operacao;
  destino: ResultadoDestino | undefined;
  etapa: Pick<EtapaEsteira, 'chave' | 'nome' | 'tipo'>;
  podeForcar: boolean;
  motivosPerda: EstruturaEsteira['motivosPerda'];
}): DecisaoMovimento {
  const motivo = motivoDaEtapa(p.operacao, p.etapa, p.motivosPerda);
  const contexto: ContextoDialogo = { titulo: `Mover para ${p.etapa.nome}`, operacao: p.operacao, motivoSeExigido: motivo };
  const soltura = podeSoltar(p.destino, p.podeForcar);
  if (!soltura.permitido) return { tipo: 'bloqueado', motivo: soltura.aviso ?? 'Movimento não permitido', contexto };

  const pedeJustificativa = p.destino === 'JUSTIFICATIVA';
  if (!motivo && !pedeJustificativa) return { tipo: 'direto', contexto };
  const descricao = motivo
    ? 'O parceiro sai da esteira em andamento. Informe o motivo.'
    : 'Este movimento corrige o caminho do parceiro e fica registrado no histórico.';
  return { tipo: 'dialogo', contexto, estado: { ...dialogoVazio(contexto.titulo, descricao), pedeJustificativa, motivo } };
}

/** Erro da API como chega em `ApiError`. */
export type ErroDaApi = { status: number; code: string; message: string; details?: unknown };

const pendenciasDe = (details: unknown): string[] => {
  const lista = (details as { pendencias?: unknown } | null | undefined)?.pendencias;
  return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
};

/**
 * Recusa do servidor → estado do diálogo; nulo quando não é erro de regra
 * (validação, rede, 404…), que a tela mostra do jeito de sempre.
 */
export function estadoDoErro(erro: ErroDaApi, atual: EstadoDialogo | null, contexto: ContextoDialogo): EstadoDialogo | null {
  const base = atual ?? dialogoVazio(contexto.titulo);
  const traduzir = (lista: string[]) => lista.map((c) => rotuloPendencia(contexto.operacao, c));

  if (erro.status === 409 && erro.code === 'EXIGE_JUSTIFICATIVA') {
    const pendencias = traduzir(pendenciasDe(erro.details));
    const foraDaRegra = (erro.details as { resultado?: unknown } | undefined)?.resultado === 'EXCECAO';
    return {
      ...base,
      descricao: foraDaRegra
        ? 'Este movimento foge da regra. Ele será gravado como exceção autorizada, com a sua justificativa.'
        : base.descricao || 'Este movimento pede uma justificativa, que fica registrada no histórico.',
      pendencias: pendencias.length ? pendencias : base.pendencias,
      erro: base.pedeJustificativa ? erro.message : null,
      pedeJustificativa: true,
      bloqueio: null,
    };
  }
  if (erro.status === 403 && erro.code === 'EXCECAO_NAO_AUTORIZADA') {
    return { ...base, bloqueio: erro.message, pendencias: traduzir(pendenciasDe(erro.details)), erro: null };
  }
  if (erro.status === 400 && erro.code === 'TRANSICAO_PROIBIDA') {
    return { ...base, bloqueio: erro.message, erro: null };
  }
  if (erro.status === 400 && erro.code === 'EXIGE_MOTIVO') {
    return {
      ...base,
      motivo: base.motivo ?? contexto.motivoSeExigido ?? { tipo: 'texto' },
      erro: base.motivo ? erro.message : null,
      bloqueio: null,
    };
  }
  return null;
}

/** Nome legível de cada pendência que a API devolve (nomes de campo). */
const PENDENCIAS: Record<Operacao, Record<string, string>> = {
  TIM: {
    matriculaSappdv: 'Matrícula SAPPDV preenchida',
    sistemaTimVendas: 'Sistema TIM Vendas: Sim',
    compraChip: 'Compra de chip concluída',
    treinamento: 'Treinamento concluído',
    vendedorAtivo: 'Ao menos um vendedor ativo no PDV',
  },
  STARLINK: {
    primeiroContatoEm: 'Primeiro contato registrado',
    cnpjApto: 'CNPJ apto: Sim',
    vsm: 'VSM: Sim',
    vivensisStatus: 'Vivensis aprovado',
    treinamento: 'Treinamento: Sim',
    parceiro: 'Parceiro: Sim',
    contrato: 'Contrato: Sim',
  },
};

export const rotuloPendencia = (operacao: Operacao, campo: string): string => PENDENCIAS[operacao][campo] ?? campo;

/** Selo do cartão parado (spec 6.1). */
export function textoParado(dias: number): string {
  if (dias < 1) return 'Parado há menos de 1 dia';
  return dias === 1 ? 'Parado há 1 dia' : `Parado há ${dias} dias`;
}

const FUSO = 'America/Sao_Paulo';
const diaDe = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: FUSO });

/** "hoje", "ontem", "há N dias" (até 30) ou a data — dias de calendário em Brasília. */
export function textoUltimaInteracao(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  const dias = Math.round((Date.parse(diaDe(agora)) - Date.parse(diaDe(data))) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias <= 30) return `há ${dias} dias`;
  return data.toLocaleDateString('pt-BR', { timeZone: FUSO });
}

export type ColunaDoQuadro = Pick<EtapaEsteira, 'chave' | 'nome' | 'tipo' | 'ordem'> & { lateral: boolean };

/** Colunas do quadro: etapas ativas na ordem da estrutura; desvios e saídas são laterais. */
export function colunasDoKanban(etapas: EtapaEsteira[]): ColunaDoQuadro[] {
  return etapas
    .filter((e) => e.ativa)
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => ({ chave: e.chave, nome: e.nome, tipo: e.tipo, ordem: e.ordem, lateral: e.tipo !== 'NORMAL' }));
}
