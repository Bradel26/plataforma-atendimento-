/**
 * Webchat desligado por padrao (2026-10-05): a equipe atende so por WhatsApp.
 * O codigo fica; religar e definir VITE_WEBCHAT_ATIVO=true no build (e
 * WEBCHAT_ATIVO=true na API) e implantar de novo.
 */
export const WEBCHAT_ATIVO = import.meta.env.VITE_WEBCHAT_ATIVO === 'true';

/** Tira o Webchat de uma lista de opcoes enquanto ele estiver desligado. */
export function semWebchat<T>(lista: T[], valor: (item: T) => string): T[] {
  return WEBCHAT_ATIVO ? lista : lista.filter((item) => valor(item) !== 'WEBCHAT');
}
