import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta, Button } from '../../components/ui';
import { ApiError, api } from '../../lib/api';

type ConfigSignup = { disponivel: boolean; appId: string | null; configId: string | null; apiVersion: string | null };
type SessaoMeta = { wabaId: string; phoneNumberId?: string };
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
      const resposta = await api.post<{ aviso: string | null }>('/canais/whatsapp/pessoal/meta/conectar', {
        codigo: codeRef.current, ...sessaoRef.current, pin,
      });
      setAviso(resposta.aviso ?? 'Número oficial conectado.');
      onConnected();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível conectar esse número à plataforma.');
    } finally {
      setOcupado(false); codeRef.current = null; sessaoRef.current = null; finalizandoRef.current = false;
      setPin('');
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
      if (mensagem.event === 'FINISH') {
        const d = mensagem.data ?? {};
        const wabaId = String(d.waba_id ?? d.wabaId ?? '');
        const phoneNumberId = String(d.phone_number_id ?? d.phoneNumberId ?? '');
        if (wabaId) { sessaoRef.current = { wabaId, ...(phoneNumberId ? { phoneNumberId } : {}) }; void concluir(); }
      } else if (mensagem.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
        setOcupado(false);
        codeRef.current = null;
        setErro('A Meta abriu o fluxo de coexistência. Cancele e use o cadastro API exclusivo para habilitar chamadas no painel.');
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
    if (!window.FB || !config?.configId || !/^\d{6}$/.test(pin)) return;
    if (!window.confirm('Este cadastro migrará o número para uso exclusivo pela API na plataforma. O WhatsApp Business deixará de funcionar nesse número no celular. As mensagens e as chamadas serão atendidas pelo painel. Deseja continuar?')) return;
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

  if (config && (!config.disponivel || !config.configId)) return <p className="text-xs text-slate-500">A conexão oficial exclusiva ainda aguarda a configuração padrão do Embedded Signup no app Meta.</p>;
  return <div className={className}>
    <label className="mt-2 block text-left text-xs text-slate-600" htmlFor="whatsapp-api-pin">
      PIN de segurança do WhatsApp (6 dígitos)
    </label>
    <input
      id="whatsapp-api-pin"
      type="password"
      inputMode="numeric"
      autoComplete="new-password"
      maxLength={6}
      value={pin}
      onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="Defina um PIN de 6 dígitos"
      className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
      aria-describedby="whatsapp-api-pin-help"
    />
    <p id="whatsapp-api-pin-help" className="mt-1 text-left text-[10px] text-slate-500">
      Use o PIN da verificação em duas etapas desse número ou defina um novo para o cadastro na API.
    </p>
    <Button type="button" onClick={conectar} disabled={!sdkPronto || ocupado || pin.length !== 6} className="mt-2 w-full">
      {ocupado ? 'Conectando com a Meta…' : sdkPronto ? 'Conectar WhatsApp para mensagens e chamadas' : 'Carregando conexão Meta…'}
    </Button>
    {erro && <div className="mt-2"><Alerta>{erro}</Alerta></div>}
    {aviso && <div className="mt-2"><Alerta tipo="sucesso">{aviso}</Alerta></div>}
    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">A conexão é feita pela API oficial. O WhatsApp no celular será desconectado desse número. Gravações e transcrições ficam no histórico da plataforma. O token fica cifrado no servidor.</p>
  </div>;
}
