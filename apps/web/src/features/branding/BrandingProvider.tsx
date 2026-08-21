import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import type { Branding } from '../../lib/types';

const PADRAO: Branding = {
  id: 'default',
  appName: 'Plataforma de Atendimento',
  logoUrl: null,
  corPrimaria: '#2563eb',
  corSecundaria: '#0f172a',
  corDestaque: '#16a34a',
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
