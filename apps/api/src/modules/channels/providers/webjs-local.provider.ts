import { AppError } from '../../../lib/errors';
import type { ConfigDaPonte, QrDaPonte } from '../whatsapp.ponte';
import type { EstadoDaPonte } from '../whatsapp.modo';
import type { WhatsAppProvider } from '../whatsapp.provider';

const BASE = () => (process.env.WEBJS_LOCAL_URL?.trim() || `http://127.0.0.1:${process.env.WEBJS_LOCAL_PORT?.trim() || '4174'}/api/platform`).replace(/\/+$/, '');
const TOKEN = () => process.env.WEBJS_LOCAL_TOKEN?.trim() || process.env.WPP_CONNECT_WEBHOOK_SECRET?.trim() || '';
const TEMPO_LIMITE = 20_000;

async function request(caminho: string, init: RequestInit = {}) {
  const token = TOKEN();
  if (!token) throw new AppError(503, 'WEBJS_LOCAL_SEM_TOKEN', 'Configure WEBJS_LOCAL_TOKEN para o conector local.');
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE()}${caminho}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TEMPO_LIMITE),
    });
  } catch (erro) {
    throw new AppError(502, 'WEBJS_LOCAL_INDISPONIVEL', `O conector local não respondeu: ${erro instanceof Error ? erro.message : 'falha de rede'}`);
  }
  const dados = await resposta.json().catch(() => ({})) as Record<string, unknown>;
  if (!resposta.ok) throw new AppError(502, 'WEBJS_LOCAL_RECUSOU', String(dados.error ?? dados.erro ?? `Resposta ${resposta.status} do conector local`));
  return dados;
}

function sessao(config: ConfigDaPonte) {
  const valor = config.ponteSessao?.trim();
  if (!valor) throw new AppError(503, 'SESSAO_WHATSAPP_AUSENTE', 'A linha WhatsApp não tem uma sessão configurada.');
  return valor;
}

function qs(config: ConfigDaPonte) { return `?session=${encodeURIComponent(sessao(config))}`; }

export class WebJsLocalProvider implements WhatsAppProvider {
  readonly credenciaisPorLinha = false;

  infraestruturaGlobalPronta = () => Boolean(TOKEN());

  async getQRCode(config: ConfigDaPonte): Promise<QrDaPonte> {
    try {
      const d = await request(`/qr${qs(config)}`);
      return { qr: typeof d.qr === 'string' && d.qr.startsWith('data:image/') ? d.qr : null, conectado: d.connected === true, motivo: typeof d.motivo === 'string' ? d.motivo : null };
    } catch (erro) {
      return { qr: null, conectado: false, motivo: erro instanceof Error ? erro.message : 'Conector local indisponível' };
    }
  }

  async getStatus(config: ConfigDaPonte): Promise<EstadoDaPonte> {
    try {
      const d = await request(`/status${qs(config)}`);
      const conectado = d.connected === true;
      const detalhe = typeof d.error === 'string' ? d.error : typeof d.status === 'string' ? d.status : null;
      return { situacao: conectado ? 'CONECTADO' : d.status === 'aguardando QR' ? 'AGUARDANDO_QR' : 'DESCONECTADO', detalhe, telefone: typeof d.telefone === 'string' ? d.telefone : null };
    } catch (erro) {
      return { situacao: 'DESCONHECIDO', detalhe: erro instanceof Error ? erro.message : 'Conector local indisponível' };
    }
  }

  async sendText(config: ConfigDaPonte, destino: string, texto: string) {
    const d = await request('/mensagens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sessao(config), numero: destino, texto }) });
    return { idExterno: typeof d.idExterno === 'string' ? d.idExterno : null };
  }

  async sendMedia(config: ConfigDaPonte, destino: string, arquivo: { buffer: Buffer; nome: string; tipo: string; legenda?: string }) {
    const d = await request('/arquivos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sessao(config), numero: destino, nome: arquivo.nome, tipo: arquivo.tipo, legenda: arquivo.legenda, base64: arquivo.buffer.toString('base64') }) });
    return { idExterno: typeof d.idExterno === 'string' ? d.idExterno : null };
  }

  async disconnect(config: ConfigDaPonte) {
    await request('/desconectar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sessao(config) }) });
  }
}
