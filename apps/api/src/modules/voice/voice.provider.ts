/**
 * Contrato do provedor de voz.
 *
 * A plataforma nao fala SIP: ela fala com um provedor por HTTP. Trocar de
 * provedor (Twilio, Zenvia, TotalVoice, um Asterisk com API na frente) e
 * escrever um arquivo que implemente esta interface — nada mais no sistema
 * precisa saber quem esta do outro lado.
 */
export type EventoChamada = {
  /** Id da chamada no provedor. Chave de idempotencia. */
  idExterno: string;
  status: 'INICIANDO' | 'CHAMANDO' | 'EM_ANDAMENTO' | 'COMPLETADA' | 'NAO_ATENDIDA' | 'OCUPADA' | 'FALHOU' | 'CANCELADA';
  direcao: 'ENTRANTE' | 'SAINTE';
  numeroOrigem: string;
  numeroDestino: string;
  /** Duracao da conversa em segundos, quando o provedor informa. */
  duracao?: number | null;
  gravacaoUrl?: string | null;
  gravacaoDuracao?: number | null;
  custo?: number | null;
  motivoFalha?: string | null;
};

export type Credenciais = {
  contaSid: string;
  authToken: string;
  numeroPadrao: string | null;
  urlWebhook: string | null;
};

export type Provedor = {
  nome: string;

  /**
   * Valida a assinatura do webhook. Sem isso, a rota publica de eventos aceita
   * qualquer um inventando chamadas e gravacoes no historico.
   */
  assinaturaValida(entrada: {
    url: string;
    parametros: Record<string, string>;
    assinatura: string | undefined;
    authToken: string;
  }): boolean;

  /** Converte o corpo do webhook no formato interno. Nunca lanca. */
  normalizarEvento(parametros: Record<string, string>): EventoChamada | null;

  /** Origina a chamada. Lanca se o provedor recusar. */
  originar(
    credenciais: Credenciais,
    chamada: { de: string; para: string },
  ): Promise<{ idExterno: string; status: EventoChamada['status'] }>;

  /** Headers necessarios para baixar a gravacao do provedor. */
  headersDeDownload(credenciais: Credenciais): Record<string, string>;
};
