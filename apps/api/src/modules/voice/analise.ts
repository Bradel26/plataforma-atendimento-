import type { SentimentoDaLigacao } from '@prisma/client';

/**
 * Assistente da ligacao (item E.2): as regras que a analise nao pode errar.
 *
 * A plataforma nao transcreve nem interpreta nada — quem faz isso e um motor
 * externo que posta o resultado pela ponte de integracao. O que mora aqui e o
 * que a plataforma **decide** sobre o que recebe, e todas as decisoes giram em
 * volta da mesma armadilha: a analise que nao existe se parecer com uma analise
 * neutra.
 */

export type AcaoSugerida = {
  id: string;
  texto: string;
  ordem: number;
  atividadeId: string | null;
  descartadoEm: Date | null;
};

export type EstadoDaAcao = 'PENDENTE' | 'VIROU_TAREFA' | 'DESCARTADA';

/**
 * Normaliza as proximas acoes que o motor mandou.
 *
 * Um motor generativo repete: pede "ligar de volta na terca" duas vezes com
 * espaco diferente, manda item vazio quando nao tem nada a dizer, e as vezes
 * despeja vinte sugestoes. Cada uma dessas coisas, guardada crua, produz uma
 * lista que o vendedor deixa de ler — e lista que ninguem le e o mesmo que
 * sugestao nenhuma.
 *
 * A comparacao de repetido ignora caixa e espaco, mas **nao ignora acento**:
 * "ligar" e "ligar" com acento sao a mesma frase em portugues, mas juntar por
 * acento apagaria par de palavras que se distinguem so por ele. O corte fica na
 * duvida menor.
 *
 * O teto e 10. Nao e um numero descoberto em dado nenhum — e um limite de
 * leitura, e esta escrito aqui para ser discutido, nao para parecer medido.
 */
export const TETO_DE_ACOES = 10;

export function normalizarAcoes(entrada: unknown): string[] {
  if (!Array.isArray(entrada)) return [];

  const vistas = new Set<string>();
  const saida: string[] = [];

  for (const bruta of entrada) {
    if (typeof bruta !== 'string') continue;
    const texto = bruta.trim().replace(/\s+/g, ' ');
    if (texto === '') continue;

    const chave = texto.toLocaleLowerCase('pt-BR');
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    saida.push(texto);
    if (saida.length === TETO_DE_ACOES) break;
  }

  return saida;
}

/**
 * O que aconteceu com uma sugestao.
 *
 * Tres estados e nao dois: "pendente" e "resolvida" perderiam a diferenca entre
 * *virou tarefa na agenda de alguem* e *foi recusada*. As duas resolvem a
 * sugestao, e sao respostas opostas a pergunta "o motor acertou?".
 */
export function estadoDaAcao(acao: Pick<AcaoSugerida, 'atividadeId' | 'descartadoEm'>): EstadoDaAcao {
  if (acao.atividadeId) return 'VIROU_TAREFA';
  if (acao.descartadoEm) return 'DESCARTADA';
  return 'PENDENTE';
}

/**
 * Por que esta sugestao nao pode virar tarefa agora, se for o caso.
 *
 * Devolve a frase que o usuario le, e nao um codigo: a tela mostra o motivo no
 * lugar do botao, e um botao que falha depois do clique ensina a nao clicar.
 *
 * `temVinculo` diz se a chamada tem contato ou conversa a que pendurar a
 * atividade. Toda atividade exige ao menos um vinculo (regra do servico de CRM),
 * e chamada de numero desconhecido nao tem nenhum — a sugestao continua legivel,
 * so nao vira agenda.
 */
export function impedimentoDaTarefa(
  acao: Pick<AcaoSugerida, 'atividadeId' | 'descartadoEm'>,
  temVinculo: boolean,
): string | null {
  const estado = estadoDaAcao(acao);
  if (estado === 'VIROU_TAREFA') return 'Esta sugestao ja virou tarefa';
  if (estado === 'DESCARTADA') return 'Esta sugestao foi descartada';
  if (!temVinculo) {
    return 'A chamada nao esta ligada a nenhum contato — vincule o contato para criar a tarefa';
  }
  return null;
}

export type ResumoDeSentimento = {
  /** Contagem por sentimento, so das chamadas ANALISADAS. */
  positivo: number;
  neutro: number;
  negativo: number;
  /** Quantas chamadas foram analisadas. E a base de qualquer percentual. */
  analisadas: number;
  /**
   * Quantas NAO foram analisadas.
   *
   * O numero mais importante do resumo. Sem ele, "70% neutro" pode ser 7 de 10
   * chamadas ou 7 de 700 — e as duas frases exigem decisoes opostas.
   */
  semAnalise: number;
  /**
   * Fracao de negativas entre as analisadas, ou nulo quando nada foi analisado.
   *
   * Nulo e nao zero: zero afirmaria que nenhuma ligacao correu mal, quando o que
   * se sabe e que ninguem ouviu nenhuma.
   */
  fracaoNegativa: number | null;
};

/**
 * Resume o sentimento de um conjunto de chamadas.
 *
 * A regra que este resumo existe para nao quebrar: **nulo nao e NEUTRO**. Uma
 * chamada sem analise nao entra em nenhum dos tres degraus — ela entra em
 * `semAnalise`. Dobra-la em "neutra" faria a gestao ver um mar de neutralidade
 * que e, na verdade, ausencia de transcricao, e concluir que o atendimento e
 * morno quando o que existe e uma fila que ninguem ouviu.
 */
export function resumirSentimento(
  chamadas: Array<{ sentimento: SentimentoDaLigacao | null }>,
): ResumoDeSentimento {
  let positivo = 0;
  let neutro = 0;
  let negativo = 0;
  let semAnalise = 0;

  for (const c of chamadas) {
    if (c.sentimento === 'POSITIVO') positivo += 1;
    else if (c.sentimento === 'NEUTRO') neutro += 1;
    else if (c.sentimento === 'NEGATIVO') negativo += 1;
    else semAnalise += 1;
  }

  const analisadas = positivo + neutro + negativo;

  return {
    positivo,
    neutro,
    negativo,
    analisadas,
    semAnalise,
    fracaoNegativa: analisadas === 0 ? null : negativo / analisadas,
  };
}

/**
 * A analise chegou depois do fim da ligacao?
 *
 * Motor que posta analise antes de a chamada encerrar analisou audio parcial, e
 * um resumo de metade da conversa e pior que nenhum: ele parece completo. A rota
 * recusa, e a mensagem diz o que aconteceu.
 *
 * Chamada sem `encerradoEm` nao passa — nao ha como saber se o audio acabou.
 */
export function analisePrematura(encerradoEm: Date | null, analisadoEm: Date): boolean {
  if (encerradoEm === null) return true;
  return analisadoEm.getTime() < encerradoEm.getTime();
}

/**
 * O que a chamada tem de analise, para a tela nao inventar estado.
 *
 * `nada` distingue "nenhum motor analisou esta ligacao" de "analisou e nao achou
 * proxima acao nenhuma" — que e resultado legitimo e nao deve parecer falha.
 */
export function estadoDaAnalise(chamada: {
  transcricao: string | null;
  resumo: string | null;
  sentimento: SentimentoDaLigacao | null;
  analisadoEm: Date | null;
}): 'SEM_ANALISE' | 'ANALISADA' {
  const algo =
    chamada.analisadoEm !== null ||
    chamada.transcricao !== null ||
    chamada.resumo !== null ||
    chamada.sentimento !== null;
  return algo ? 'ANALISADA' : 'SEM_ANALISE';
}
