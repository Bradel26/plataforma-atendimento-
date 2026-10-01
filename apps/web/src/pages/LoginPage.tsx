import { lazy, Suspense, useState } from 'react';
import { Alerta, Button, Input } from '../components/ui';
import { useAuth } from '../features/auth/AuthProvider';
import { useBranding } from '../features/branding/BrandingProvider';
import { ApiError, api } from '../lib/api';

/**
 * Carregado sob demanda: Three.js so pesa o bundle de quem realmente vai ver
 * a cena (desktop, tela de login) — sem isto, todo mundo baixaria a lib em
 * qualquer pagina, so por ela estar importada em algum lugar do app.
 */
const CenaTerra3D = lazy(() => import('../features/login/CenaTerra3D').then((m) => ({ default: m.CenaTerra3D })));

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

export function LoginPage() {
  const { entrar } = useAuth();
  const { branding } = useBranding();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [trocaObrigatoria, setTrocaObrigatoria] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PASSWORD_CHANGE_REQUIRED') {
        setTrocaObrigatoria(true);
        setErro(null);
        return;
      }
      setErro(err instanceof ApiError ? err.message : 'Não foi possível conectar a API');
    } finally {
      setEnviando(false);
    }
  };

  const trocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (novaSenha !== confirmarSenha) {
      setErro('A confirmação da nova senha não confere.');
      return;
    }
    setEnviando(true);
    try {
      await api.post('/auth/alterar-senha-inicial', { email, senhaAtual: senha, novaSenha });
      await entrar(email, novaSenha);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível alterar a senha');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="relative flex h-full items-center overflow-hidden bg-[#050b18]">
      <style>{`
        @keyframes girar-órbita { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes cintilar { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
      `}</style>

      {/*
        Cena 3D de verdade, so a partir de lg (1024px) — abaixo disso segue o
        fundo CSS/SVG de sempre (bloco seguinte), mais leve pro mobile/tablet.
        O "vazar os limites da tela" vem de dentro da propria cena (raio
        grande + Terra deslocada na camera), nao de recortar o canvas no DOM
        — um recorte por fora acabava cortando justo o lado iluminado.
      */}
      <div className="relative hidden overflow-hidden lg:block lg:w-[68%] lg:shrink-0 lg:self-stretch" aria-hidden="true">
        <Suspense fallback={null}>
          <CenaTerra3D />
        </Suspense>
      </div>

      {/* Fundo: foto real da Terra vista do espaco + estrelas/orbitas desenhadas por cima — so abaixo de lg */}
      <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden="true">
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

      {/* marca no canto, substitui o bloco de texto de marketing removido.
          `texto-sobre-cor-fixa`, nao `text-white`: a cena e sempre escura,
          independente do tema do app — ver o comentario em IconeDecorativo. */}
      <div className="absolute left-8 top-8 z-10 flex items-center gap-3 texto-sobre-cor-fixa">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="" className="h-9 w-9 rounded object-contain" />
        ) : (
          <img src="/branding/bradel-branco-escuro.jpeg" alt="Bradel" className="h-8 w-24 object-contain mix-blend-screen" />
        )}
        <span className="font-semibold">{branding.logoUrl ? branding.appName : 'Plataforma de Atendimento'}</span>
      </div>

      {/* Cor literal pelo mesmo motivo do IconeDecorativo: cena sempre escura. */}
      <p className="absolute bottom-6 left-8 z-10 text-xs text-[#94a3b8]">Versão 0.1.0 - MVP Fase 1</p>

      {/* card flutuante — coluna direita (~32%), centralizado nela em vez de so encostado.
          `border-[rgba(255,255,255,0.1)]`/`bg-slate-950/70`, nao `border-white/10`: o cartao
          e sempre um vidro escuro, e `slate-950` fica fora da escala remapeada (so ate
          slate-900), entao ele sozinho ja e "fixo" — so o `white` precisava de ajuste. */}
      <div className="relative z-10 flex w-full flex-1 items-center justify-center px-6 lg:w-[32%] lg:flex-none">
        <div className="w-full max-w-sm rounded-2xl border border-[rgba(255,255,255,0.1)] bg-slate-950/70 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-center gap-4 border-b border-[rgba(255,255,255,0.1)] pb-5">
            <img
              src="/branding/starlink-preto-branco.jpeg"
              alt="Starlink"
              className="h-12 w-32 object-contain invert mix-blend-screen"
            />
            <span className="h-8 w-px bg-[rgba(255,255,255,0.2)]" />
            <img src="/branding/tim-branco-azul.jpeg" alt="TIM" className="h-8 w-24 rounded object-contain" />
          </div>

          <form onSubmit={trocaObrigatoria ? trocarSenha : submeter} className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold texto-sobre-cor-fixa">{trocaObrigatoria ? 'Crie uma nova senha' : 'Entrar'}</h1>
              <p className="mt-1 text-sm text-[#94a3b8]">
                {trocaObrigatoria ? 'Por segurança, troque a senha temporária para continuar.' : 'Acesse com suas credenciais corporativas.'}
              </p>
            </div>

            {erro && <Alerta>{erro}</Alerta>}

            {!trocaObrigatoria && <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-[#cbd5e1]">
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
            </div>}

            {!trocaObrigatoria ? <div>
              <label htmlFor="login-senha" className="mb-1.5 block text-xs font-medium text-[#cbd5e1]">
                Senha
              </label>
              <div className="relative">
                <Input
                  id="login-senha"
                  type={senhaVisivel ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="********"
                  className="pr-10"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
                />
                <button
                  type="button"
                  onClick={() => setSenhaVisivel((v) => !v)}
                  aria-label={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={senhaVisivel}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#94a3b8] transition hover:text-[#fff]"
                >
                  {senhaVisivel ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M3 3l18 18M10.6 10.7a2.5 2.5 0 003.5 3.5M6.7 6.9C4.3 8.5 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.7-1.2M9.9 4.2A9.9 9.9 0 0112 4c6.4 0 10 7 10 7-.6 1.1-1.5 2.4-2.7 3.6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div> : <>
              <div>
                <label htmlFor="nova-senha" className="mb-1.5 block text-xs font-medium text-[#cbd5e1]">Nova senha</label>
                <Input id="nova-senha" type="password" autoComplete="new-password" required minLength={12} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
                <p className="mt-1 text-xs text-[#94a3b8]">Use ao menos 12 caracteres.</p>
              </div>
              <div>
                <label htmlFor="confirmar-senha" className="mb-1.5 block text-xs font-medium text-[#cbd5e1]">Confirme a nova senha</label>
                <Input id="confirmar-senha" type="password" autoComplete="new-password" required minLength={12} value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
              </div>
            </>}

            <Button type="submit" disabled={enviando} className="w-full">
              {enviando ? 'Salvando...' : trocaObrigatoria ? 'Alterar senha e entrar' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
