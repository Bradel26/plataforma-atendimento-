import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import type { Branding } from '../../lib/types';
import { FUNDO_CHAT_PADRAO, fundoChatValido } from './fundosChat';

const PADRAO: Branding = {
  id: 'default',
  appName: 'Plataforma de Atendimento Bradel',
  logoUrl: null,
  corPrimaria: '#2563eb',
  corSecundaria: '#0f172a',
  corDestaque: '#16a34a',
  fundoChat: FUNDO_CHAT_PADRAO,
};

type BrandingContextValue = {
  branding: Branding;
  salvar: (dados: Partial<Branding>) => Promise<void>;
  recarregar: () => Promise<void>;
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

/** Aplica as cores do White Label como CSS variables no documento. */
function aplicarTema(branding: Branding) {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', branding.corPrimaria);
  root.style.setProperty('--brand-secondary', branding.corSecundaria);
  root.style.setProperty('--brand-accent', branding.corDestaque);
  // O fundo das conversas e escolhido por atributo: o CSS (index.css) decide o desenho de cada modelo.
  root.dataset.fundoChat = fundoChatValido(branding.fundoChat);
  document.title = branding.appName;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(PADRAO);

  const recarregar = useCallback(async () => {
    const { branding: atual } = await api.get<{ branding: Branding }>('/branding');
    setBranding(atual);
  }, []);

  useEffect(() => {
    void recarregar().catch(() => undefined);
  }, [recarregar]);

  useEffect(() => aplicarTema(branding), [branding]);

  const salvar = useCallback(async (dados: Partial<Branding>) => {
    const { branding: atual } = await api.put<{ branding: Branding }>('/branding', dados);
    setBranding(atual);
  }, []);

  const valor = useMemo(() => ({ branding, salvar, recarregar }), [branding, salvar, recarregar]);
  return <BrandingContext.Provider value={valor}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding precisa estar dentro de <BrandingProvider>');
  return ctx;
}
