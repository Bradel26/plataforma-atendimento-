import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta, Button, Field, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';

type ConfigSignup = { disponivel: boolean; appId: string | null; configId: string | null; apiVersion: string | null };
type SessaoMeta = { wabaId: string; phoneNumberId: string };
type MetaLoginResult = { authResponse?: { code?: string }; status?: string };
type MetaSdk = {
  init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (callback: (result: MetaLoginResult) => void, options: Record<string, unknown>) => void;
};

declare global { interface Window { FB?: MetaSdk } }

/** OAuth fica no navegador; o code é trocado e o token é guardado somente no servidor. */
export function ConectarWhatsAppCloud({ onConnected, className = '' }: { onConnected: () => void; className?: string }) {
  const [config, setConfig] = useState<ConfigSignup | null>(null);
  const [sdkPronto, setSdkPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pin, setPin] = useState('');
  const codeRef = useRef<string | null>(null);
  const sessaoRef = useRef<SessaoMeta | null>(null);
  const finalizandoRef = useRef(false);

  useEffect(() => {
    let ativo = true;
    void api.get<ConfigSignup>('/canais/whatsapp/meta/embedded-signup')
      .then((valor) => { if (ativo) setConfig(valor); })
      .catch(() => { if (ativo) setConfig({ disponivel: false, appId: null, configId: null, apiVersion: null }); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!config?.disponivel || !config.appId || !config.apiVersion) return;
    let cancelado = false;
    const iniciar = () => {
      if (cancelado || !window.FB) return;
      window.FB.init({ appId: config.appId!, autoLogAppEvents: true, xfbml: false, version: config.apiVersion! });
      setSdkPronto(true);
    };
    if (window.FB) { iniciar(); return () => { cancelado = true; }; }
    const existente = document.getElementById('facebook-jssdk');
    if (existente) {
      existente.addEventListener('load', iniciar, { once: true });
      return () => { cancelado = true; existente.removeEventListener('load', iniciar); };
    }
    const script = document.createElement('script');
    script.id = 'facebook-jssdk'; script.async = true; script.defer = true; script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js'; script.addEventListener('load', iniciar, { once: true });
    document.head.appendChild(script);
    return () => { cancelado = true; script.removeEventListener('load', iniciar); };
  }, [config]);

  const concluir = useCallback(async () => {
    if (!codeRef.current || !sessaoRef.current || finalizandoRef.current) return;
    finalizandoRef.current = true; setOcupado(true); setErro(null); setAviso(null);
    try {
      const resposta = await api.post<{ callingAtivo: boolean; aviso: string | null }>('/canais/whatsapp/pessoal/meta/conectar', {
        codigo: codeRef.current, wabaId: sessaoRef.current.wabaId, phoneNumberId: sessaoRef.current.phoneNumberId, pin,
      });
      setAviso(resposta.aviso ?? 'Número oficial conectado.');
      onConnected();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível conectar esse número à plataforma.');
    } finally {
      setOcupado(false); codeRef.current = null; sessaoRef.current = null; finalizandoRef.current = false;
    }
  }, [onConnected, pin]);

  useEffect(() => {
    const receber = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      let data: unknown = event.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
      if (!data || typeof data !== 'object') return;
      const mensagem = data as { type?: string; event?: string; data?: Record<string, unknown> };
      if (mensagem.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (mensagem.event === 'FINISH' || mensagem.event === 'FINISH_ONLY_WABA') {
        const d = mensagem.data ?? {};
        const wabaId = String(d.waba_id ?? d.wabaId ?? '');
        const phoneNumberId = String(d.phone_number_id ?? d.phoneNumberId ?? '');
        if (wabaId && phoneNumberId) { sessaoRef.current = { wabaId, phoneNumberId }; void concluir(); }
      } else if (mensagem.event === 'CANCEL') {
        setOcupado(false);
        codeRef.current = null;
        setErro('A conexão foi cancelada na janela da Meta.');
      }
    };
    window.addEventListener('message', receber);
    return () => window.removeEventListener('message', receber);
  }, [concluir]);

  const conectar = () => {
    if (!window.FB || !config?.configId) return;
    if (!/^\d{6}$/.test(pin)) { setErro('Defina um PIN de segurança com 6 dígitos antes de continuar.'); return; }
    if (!window.confirm('A conexão oficial substitui o pareamento por QR deste número. O PIN de segurança deve ser guardado pela pessoa dona da linha. Deseja continuar?')) return;
    codeRef.current = null; sessaoRef.current = null; finalizandoRef.current = false;
    setErro(null); setAviso(null); setOcupado(true);
    window.FB.login((result) => {
      const code = result.authResponse?.code;
      if (!code) { setOcupado(false); if (result.status !== 'unknown') setErro('A Meta não retornou autorização. Verifique o acesso à conta empresarial.'); return; }
      codeRef.current = code;
      // Alguns fluxos enviam a mensagem de conclusão antes do callback OAuth.
      void concluir();
    }, {
      config_id: config.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {} },
    });
  };

  if (config && !config.disponivel) return <p className="text-xs text-slate-500">A conexão oficial ainda aguarda a configuração do app Meta pelo administrador.</p>;
  return <div className={className}>
    <Field label="PIN de segurança da linha" hint="Crie um PIN de 6 dígitos e guarde-o. Ele não será salvo pela plataforma.">
      <Input inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 dígitos" className="!py-2 !text-xs" />
    </Field>
    <Button type="button" variante="neutro" onClick={conectar} disabled={!sdkPronto || ocupado || pin.length !== 6} className="mt-2 w-full">
      {ocupado ? 'Conectando com a Meta…' : sdkPronto ? 'Conectar número pela Meta' : 'Carregando conexão Meta…'}
    </Button>
    {erro && <div className="mt-2"><Alerta>{erro}</Alerta></div>}
    {aviso && <div className="mt-2"><Alerta tipo="sucesso">{aviso}</Alerta></div>}
    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Cada usuário autoriza somente os ativos WhatsApp da própria conta Meta. O token é armazenado cifrado no servidor.</p>
    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Para receber chamadas, o administrador da plataforma precisa habilitar o campo <code>calls</code> no webhook do app Meta e a Calling API para cada número.</p>
  </div>;
}
