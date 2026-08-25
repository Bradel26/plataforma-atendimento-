import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Tema = 'claro' | 'escuro' | 'sistema';

const CHAVE = 'plataforma:tema';

type TemaContextValue = { tema: Tema; escuro: boolean; definir: (tema: Tema) => void };
const TemaContext = createContext<TemaContextValue | null>(null);

/** Le a preferencia salva. localStorage pode lancar (janela privada, cookie bloqueado). */
function lerSalvo(): Tema {
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
}

const consultaEscuro = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

/**
 * Tema da interface.
 *
 * Tres estados, nao dois: "sistema" e o padrao, e e o que respeita quem ja
 * configurou o sistema operacional inteiro no escuro. Claro e escuro sao a
 * escolha explicita, que ganha do sistema.
 *
 * A troca acontece numa classe no <html>: index.css redefine ali as variaveis de
 * cor do Tailwind, e o app inteiro vira sem nenhum componente participar.
 */
export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(lerSalvo);
  const [sistemaEscuro, setSistemaEscuro] = useState(consultaEscuro);

  // Segue o sistema em tempo real: quem usa troca automatica por horario nao
  // deveria precisar recarregar a pagina no fim do dia.
  useEffect(() => {
    const consulta = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!consulta) return;
    const aoMudar = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  const escuro = tema === 'escuro' || (tema === 'sistema' && sistemaEscuro);

  useEffect(() => {
    document.documentElement.classList.toggle('tema-escuro', escuro);
  }, [escuro]);

  const definir = (novo: Tema) => {
    setTema(novo);
    try {
      if (novo === 'sistema') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, novo);
    } catch {
      // Preferencia so nao sobrevive ao recarregar; a troca atual funciona.
    }
  };

  const valor = useMemo(() => ({ tema, escuro, definir }), [tema, escuro]);
  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error('useTema precisa estar dentro de TemaProvider');
  return ctx;
}
