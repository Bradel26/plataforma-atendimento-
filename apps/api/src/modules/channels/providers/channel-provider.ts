import type { MensagemNormalizada } from '../meta.types';

/**
 * Contrato de um provider de canal — a engine por tras de um canal (WAHA
 * hoje; WPPConnect e Meta depois).
 *
 * Nasceu junto com o `WahaProvider`, o primeiro provider real, e por isso
 * tem so o que o WAHA e o dominio usam de fato. A regra que ele protege: o
 * resto do CRM fala em sessao, destino e texto, nunca em endpoint, header ou
 * formato de payload de uma engine. So o provider conhece a API do outro lado.
 *
 * Convive com `WhatsAppProvider` (whatsapp.provider.ts), o contrato antigo
 * que as rotas e o envio ainda consomem — `legado.ts` adapta um no outro, para
 * o WAHA entrar sem reescrever quem ja funciona.
 */

/**
 * Estado interno de uma sessao, independente da engine.
 *
 * Cada provider traduz o seu vocabulario para este (o WAHA tem STARTING,
 * SCAN_QR_CODE, WORKING, STOPPED e FAILED — ver `waha.mapper.ts`).
 * `DESCONHECIDO` existe porque diagnostico que falhou nao prova desconexao:
 * a engine pode estar de pe e so a rede entre nos ter caido.
 */
export type EstadoSessao =
  | 'CONECTANDO'
  | 'AGUARDANDO_QR'
  | 'CONECTADO'
  | 'DESCONECTADO'
  | 'FALHOU'
  | 'DESCONHECIDO';

/** Estado e o que se sabe dele — o que a tela mostra e o log registra. */
export type SituacaoSessao = {
  estado: EstadoSessao;
  /** O que a engine disse, sem traducao — para diagnostico. */
  detalhe: string | null;
  /** Numero conectado (so digitos, com pais), quando a engine informa. */
  telefone: string | null;
};

/** A sessao ja resolvida pelo CRM: qual conexao usar, sem nada da engine. */
export type SessaoResolvida = {
  /** Linha (`ChannelConfig.id`) dona da sessao — so para log e correlacao. */
  canalConfigId: string | null;
  /** Nome da sessao na engine (`ChannelConfig.ponteSessao`). */
  sessaoExterna: string | null;
};

export type QrOuEstado = {
  /** QR como data URL (`data:image/png;base64,...`), quando ha um pendente. */
  qr: string | null;
  conectado: boolean;
  /** Por que nao ha QR agora (sessao subindo, engine fora, ...). */
  motivo: string | null;
};

export type ResultadoEnvio = { idExterno: string | null };

export type InputMidia = {
  buffer: Buffer;
  nome: string;
  tipo: string;
  legenda?: string;
};

export type Capacidades = {
  /** Conecta lendo QR com o celular (WhatsApp Web). */
  pareamentoPorQr: boolean;
  /** Informa entregue/lido por evento. */
  statusDeEntrega: boolean;
};

/** Status de entrega no vocabulario do CRM. */
export type StatusDeEntrega = 'PENDENTE' | 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHOU';

/**
 * O que um webhook de provider pode significar para o CRM, ja normalizado.
 *
 * Nenhuma parte do CRM alem do provider ve o payload cru: a rota de webhook
 * recebe estes eventos e os entrega ao dominio (`webhooks/eventos-de-canal.ts`).
 */
export type EventoDeCanal =
  | { tipo: 'mensagem.recebida'; sessaoExterna: string; mensagem: MensagemNormalizada }
  | { tipo: 'mensagem.status'; sessaoExterna: string; idExterno: string; status: StatusDeEntrega }
  /** Enviada pelo proprio celular conectado (nao pelo CRM). Ainda nao espelhada. */
  | { tipo: 'mensagem.propria'; sessaoExterna: string; idExterno: string }
  | { tipo: 'sessao.estado'; sessaoExterna: string; situacao: SituacaoSessao }
  | { tipo: 'ignorado'; motivo: string };

/** Pedaço da requisicao HTTP que a autenticacao do webhook precisa ver. */
export type RequisicaoDeWebhook = {
  corpoBruto: Buffer;
  header(nome: string): string | undefined;
  query: Record<string, unknown>;
};

export interface ChannelProvider {
  readonly nome: string;
  readonly capacidades: Capacidades;

  /** Infraestrutura global configurada (URL e chave da engine). Nao lanca. */
  configurado(): boolean;

  /** Lancam `AppError` quando a mensagem nao sai: nao existe "enviada" que nao chegou. */
  enviarTexto(sessao: SessaoResolvida, destino: string, texto: string): Promise<ResultadoEnvio>;
  enviarMidia(sessao: SessaoResolvida, destino: string, midia: InputMidia): Promise<ResultadoEnvio>;

  sessao: {
    /** Cria (se preciso) e sobe a sessao na engine, ja com o webhook de volta. */
    iniciar(sessao: SessaoResolvida): Promise<SituacaoSessao>;
    /** Garante a sessao de pe e devolve o QR. Nunca lanca: e a tela de conserto. */
    qr(sessao: SessaoResolvida): Promise<QrOuEstado>;
    /** Diagnostico. Nunca lanca, e nunca cria sessao (leitura sem efeito colateral). */
    estado(sessao: SessaoResolvida): Promise<SituacaoSessao>;
    /** Desfaz o pareamento (proximo QR pareia de novo). Lanca: e acao pedida. */
    desconectar(sessao: SessaoResolvida): Promise<void>;
    /** Derruba e sobe de novo a sessao, sem desparear. Lanca. */
    reiniciar(sessao: SessaoResolvida): Promise<void>;
  };

  webhook: {
    /** Confere que o evento veio mesmo da engine. Roda antes de interpretar. */
    autenticar(req: RequisicaoDeWebhook): boolean;
    /** Payload cru -> eventos do CRM. Pura: sem banco e sem rede. */
    interpretar(corpo: unknown): EventoDeCanal[];
  };
}
