import { useState } from 'react';
import { Alerta, Button, Field, Input } from '../components/ui';
import { useAuth } from '../features/auth/AuthProvider';
import { useBranding } from '../features/branding/BrandingProvider';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const { entrar } = useAuth();
  const { branding } = useBranding();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Nao foi possivel conectar a API');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex h-full">
      <div
        className="hidden flex-1 flex-col justify-between p-12 text-white lg:flex"
        style={{ backgroundColor: 'var(--brand-secondary)' }}
      >
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-9 w-9 rounded object-contain" />
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg font-bold"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {branding.appName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="font-semibold">{branding.appName}</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Atendimento multicanal, call center e CRM em uma unica plataforma.
          </h2>
          <p className="mt-4 text-sm text-slate-400">
            Webchat, WhatsApp, filas, protocolos e indicadores em tempo real.
          </p>
        </div>
        <p className="text-xs text-slate-500">Versao 0.1.0 - MVP Fase 0</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <form onSubmit={submeter} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Entrar</h1>
            <p className="mt-1 text-sm text-slate-500">Acesse com suas credenciais corporativas.</p>
          </div>

          {erro && <Alerta>{erro}</Alerta>}

          <Field label="E-mail">
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
            />
          </Field>

          <Field label="Senha">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="********"
            />
          </Field>

          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
