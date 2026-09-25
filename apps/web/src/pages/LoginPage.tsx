import { useState } from 'react';
import { Alerta, Button, Input } from '../components/ui';
import { useAuth } from '../features/auth/AuthProvider';
import { useBranding } from '../features/branding/BrandingProvider';
import { ApiError } from '../lib/api';

/** Textarra de estrelas via radial-gradient repetido — mais leve que um SVG com centenas de pontos. */
const ESTRELAS_BG = `
  radial-gradient(1px 1px at 15% 20%, rgba(255,255,255,0.9), transparent),
  radial-gradient(1px 1px at 35% 65%, rgba(255,255,255,0.7), transparent),
  radial-gradient(1.5px 1.5px at 55% 15%, rgba(255,255,255,0.8), transparent),
  radial-gradient(1px 1px at 70% 45%, rgba(255,255,255,0.6), transparent),
  radial-gradient(1px 1px at 85% 75%, rgba(255,255,255,0.9), transparent),
  radial-gradient(1.5px 1.5px at 10% 80%, rgba(255,255,255,0.7), transparent),
  radial-gradient(1px 1px at 45% 90%, rgba(255,255,255,0.5), transparent),
  radial-gradient(1px 1px at 95% 30%, rgba(255,255,255,0.7), transparent),
  radial-gradient(1.5px 1.5px at 25% 40%, rgba(255,255,255,0.6), transparent),
  radial-gradient(1px 1px at 60% 60%, rgba(255,255,255,0.8), transparent)
`;

function IconeDecorativo({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/30 hover:bg-white/10 hover:text-white">
      {children}
    </span>
  );
}

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
    <div className="relative flex h-full items-center overflow-hidden bg-[#050b18]">
      <style>{`
        @keyframes girar-orbita { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes cintilar { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
      `}</style>

      {/* Fundo: foto real da Terra vista do espaco + estrelas/orbitas desenhadas por cima */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/login-fundo-espaco.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'left bottom',
            filter: 'brightness(1.65) saturate(1.4) contrast(1.08)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(100deg, rgba(3,7,18,0.25) 0%, rgba(3,7,18,0.05) 40%, transparent 65%), linear-gradient(0deg, rgba(3,7,18,0.25), transparent 45%)',
          }}
        />
        {/* luz simulando sol batendo na esfera — reforca a curvatura/volume 3D da foto */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(55% 55% at 68% 15%, rgba(255,255,255,0.4), transparent 60%)',
            mixBlendMode: 'overlay',
          }}
        />
        {/* sombra no lado oposto a luz, como o terminador de um planeta */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(75% 75% at 15% 90%, rgba(0,0,15,0.6), transparent 55%)',
            mixBlendMode: 'multiply',
          }}
        />
        <div className="absolute inset-0 opacity-70" style={{ backgroundImage: ESTRELAS_BG, animation: 'cintilar 4s ease-in-out infinite' }} />

        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1600 900">
          <defs>
            <linearGradient id="painel-esq" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1e3a8a" />
              <stop offset="0.5" stopColor="#3b82f6" />
              <stop offset="1" stopColor="#93c5fd" />
            </linearGradient>
            <linearGradient id="painel-dir" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#93c5fd" />
              <stop offset="0.5" stopColor="#3b82f6" />
              <stop offset="1" stopColor="#1e3a8a" />
            </linearGradient>
            <radialGradient id="corpo-satelite" cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#94a3b8" />
            </radialGradient>
            <filter id="sombra-satelite" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#000814" floodOpacity="0.55" />
            </filter>

            {/* icone de satelite reutilizavel: corpo com sombreado esferico, paineis com gradiente
                (simulando reflexo) e leve inclinacao — reforca a leitura 3D do desenho plano */}
            <symbol id="satelite-icone" viewBox="-22 -12 44 24">
              <g filter="url(#sombra-satelite)">
                <line x1="0" y1="-5" x2="0" y2="-11" stroke="#cbd5e1" strokeWidth="1" />
                <circle cx="0" cy="-11" r="1.6" fill="#e2e8f0" />
                <rect x="-6" y="-4" width="12" height="8" rx="1.5" fill="url(#corpo-satelite)" stroke="#64748b" strokeWidth="0.5" />
                <g stroke="#1e3a8a" strokeWidth="0.5" transform="skewY(-8)">
                  <rect x="-20" y="-4" width="12" height="9" rx="0.8" fill="url(#painel-esq)" />
                  <line x1="-17" y1="-4" x2="-17" y2="5" />
                  <line x1="-14" y1="-4" x2="-14" y2="5" />
                  <line x1="-11" y1="-4" x2="-11" y2="5" />
                </g>
                <g stroke="#1e3a8a" strokeWidth="0.5" transform="skewY(8)">
                  <rect x="8" y="-5" width="12" height="9" rx="0.8" fill="url(#painel-dir)" />
                  <line x1="11" y1="-5" x2="11" y2="4" />
                  <line x1="14" y1="-5" x2="14" y2="4" />
                  <line x1="17" y1="-5" x2="17" y2="4" />
                </g>
              </g>
            </symbol>

            {/* rotacao ja embutida nas coordenadas (x-axis-rotation do arco) — assim a linha visivel
                (<use>) e o caminho de movimento (<mpath>) usam exatamente os mesmos pontos.
                <mpath> ignora o atributo transform do path referenciado, entao uma rotacao aplicada
                so por fora (transform="rotate(...)") desalinhava o satelite da linha desenhada. */}
            <path id="orbita-1" d="M -106.4,548.9 A 620,230 -12 1,0 1106.4,291.1 A 620,230 -12 1,0 -106.4,548.9" />
            <path id="orbita-2" d="M 205,227.6 A 520,170 8 1,0 1235,372.4 A 520,170 8 1,0 205,227.6" />
          </defs>

          <use href="#orbita-1" fill="none" stroke="rgba(226,232,240,0.45)" strokeWidth="1" />
          <use href="#orbita-2" fill="none" stroke="rgba(226,232,240,0.32)" strokeWidth="1" />

          {/* satelites seguindo exatamente a curva da orbita desenhada */}
          <g transform="scale(1.3)">
            <use href="#satelite-icone" width="44" height="24" x="-22" y="-12" />
            <animateMotion dur="46s" repeatCount="indefinite" rotate="0">
              <mpath href="#orbita-1" />
            </animateMotion>
          </g>
          <g transform="scale(1.3)">
            <use href="#satelite-icone" width="44" height="24" x="-22" y="-12" />
            <animateMotion dur="64s" repeatCount="indefinite" rotate="0" keyPoints="1;0" keyTimes="0;1">
              <mpath href="#orbita-2" />
            </animateMotion>
          </g>

          {/* pontos de cobertura sobre o Brasil, sem linhas — so o brilho da rede */}
          <g fill="#38bdf8">
            <circle cx="420" cy="560" r="4" style={{ animation: 'cintilar 2.4s ease-in-out infinite' }} />
            <circle cx="470" cy="600" r="3" style={{ animation: 'cintilar 2.4s ease-in-out infinite 0.4s' }} />
            <circle cx="380" cy="620" r="3" style={{ animation: 'cintilar 2.4s ease-in-out infinite 0.8s' }} />
            <circle cx="440" cy="660" r="3" style={{ animation: 'cintilar 2.4s ease-in-out infinite 1.2s' }} />
          </g>
        </svg>

        {/* horizonte do planeta */}
        <div
          className="absolute inset-x-0 bottom-0 h-40"
          style={{
            background: 'linear-gradient(180deg, transparent, rgba(37,99,235,0.2) 60%, rgba(6,20,45,0.55))',
          }}
        />
      </div>

      {/* marca no canto, substitui o bloco de texto de marketing removido */}
      <div className="absolute left-8 top-8 z-10 flex items-center gap-3 text-white">
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

      <p className="absolute bottom-6 left-8 z-10 text-xs text-slate-400">Versao 0.1.0 - MVP Fase 0</p>

      {/* card flutuante */}
      <div className="relative z-10 flex w-full justify-center px-6 lg:justify-end lg:pr-20">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950/70 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-center gap-4 border-b border-white/10 pb-5">
            <span className="flex items-center gap-1 text-lg font-semibold italic tracking-wide text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 12c4-6 14-6 18 0" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
                <path d="M6 16c3-4 9-4 12 0" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
              </svg>
              STARLINK
            </span>
            <span className="h-8 w-px bg-white/20" />
            <span className="flex items-center gap-1.5 text-lg font-bold text-white">
              <span className="grid grid-cols-2 gap-0.5">
                <span className="h-2 w-2 rounded-[1px] bg-red-600" />
                <span className="h-2 w-2 rounded-[1px] bg-red-600" />
                <span className="h-2 w-2 rounded-[1px] bg-red-600" />
                <span className="h-2 w-2 rounded-[1px] bg-red-600" />
              </span>
              TIM
            </span>
          </div>

          <form onSubmit={submeter} className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-white">Entrar</h1>
              <p className="mt-1 text-sm text-slate-400">Acesse com suas credenciais corporativas.</p>
            </div>

            {erro && <Alerta>{erro}</Alerta>}

            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-slate-300">
                E-mail
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>

            <div>
              <label htmlFor="login-senha" className="mb-1.5 block text-xs font-medium text-slate-300">
                Senha
              </label>
              <Input
                id="login-senha"
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="********"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>

            <Button type="submit" disabled={enviando} className="w-full">
              {enviando ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-4 border-t border-white/10 pt-5">
            <IconeDecorativo>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 20l6-6M14 4l6 6-9 9-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconeDecorativo>
            <IconeDecorativo>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 13a8 8 0 0116 0v4a2 2 0 01-2 2h-1v-6h3M4 13v6h1a2 2 0 002-2v-4H4z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </IconeDecorativo>
            <IconeDecorativo>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </IconeDecorativo>
          </div>
        </div>
      </div>
    </div>
  );
}
