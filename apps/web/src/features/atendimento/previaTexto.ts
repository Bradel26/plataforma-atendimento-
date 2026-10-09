import type { Mensagem } from '../../lib/types';

const ICONE: Record<Mensagem['tipoAnexo'], string> = { TEXTO: '', IMAGEM: '📷', AUDIO: '🎤', VIDEO: '🎥', ARQUIVO: '📄' };
const SEM_LEGENDA: Record<Mensagem['tipoAnexo'], string> = {
  TEXTO: '', IMAGEM: 'Foto', AUDIO: 'Áudio', VIDEO: 'Vídeo', ARQUIVO: 'Arquivo',
};
const RESUMO_DE_MIDIA = /^\[(imagem|audio|video|arquivo) (recebid[oa]|enviad[oa])\]$/i;

type MensagemDaPrevia = Pick<Mensagem, 'conteudo' | 'tipoAnexo' | 'interno'> & { autor: Mensagem['autor'] | 'BOT' };

export function textoDaPrevia(m: MensagemDaPrevia | null): string {
  if (!m) return 'Sem mensagens';
  if (m.autor === 'SISTEMA') return m.conteudo;
  const corpo = m.tipoAnexo === 'TEXTO'
    ? m.conteudo
    : `${ICONE[m.tipoAnexo]} ${RESUMO_DE_MIDIA.test(m.conteudo.trim()) ? SEM_LEGENDA[m.tipoAnexo] : m.conteudo}`;
  if (m.interno) return `nota: ${corpo}`;
  return `${m.autor === 'CLIENTE' ? 'cliente' : 'enviada'}: ${corpo}`;
}
