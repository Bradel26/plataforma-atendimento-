import type { Mensagem } from '../../lib/types';

const NOME_DE_ARQUIVO = /^[^\\/\n]{1,120}\.(jpe?g|png|webp|gif|heic|heif|bmp|mp4|mov|3gp|webm|mkv|m4a|mp3|ogg|opus|wav|aac|amr)$/i;
const MARCADOR = /^\[[^\]\n]{1,60}\]$/;

/**
 * Midia no padrao do WhatsApp: a bolha mostra so a foto, o video ou o player de audio.
 * O `conteudo` guardado e o nome do arquivo (envio sem legenda) ou um marcador ("[Imagem recebida]");
 * com o arquivo carregado isso so polui a bolha. Legenda de verdade continua aparecendo.
 * Sem o arquivo (`anexoUrl` ausente) o texto fica, para o aviso nao se perder.
 */
export function escondeTextoDaMidia(m: Pick<Mensagem, 'tipoAnexo' | 'anexoUrl' | 'conteudo'>): boolean {
  if (!m.anexoUrl) return false;
  if (m.tipoAnexo === 'AUDIO') return true;
  if (m.tipoAnexo !== 'IMAGEM' && m.tipoAnexo !== 'VIDEO') return false;
  const texto = (m.conteudo ?? '').trim();
  return texto === '' || MARCADOR.test(texto) || NOME_DE_ARQUIVO.test(texto);
}
