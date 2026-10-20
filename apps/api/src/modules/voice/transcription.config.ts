import { env } from '../../env';

/** The automatic transcription provider is configured once per deployment. */
export function transcricaoDisponivel(): boolean {
  if (env.TRANSCRICAO_PROVEDOR === 'desativada') return false;
  if (env.TRANSCRICAO_PROVEDOR === 'openai') return Boolean(env.OPENAI_API_KEY);
  return true;
}
