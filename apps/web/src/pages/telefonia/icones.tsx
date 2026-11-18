import type { ReactNode } from 'react';

function Icone({ children, tamanho = 16, className = '' }: { children: ReactNode; tamanho?: number; className?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

type P = { tamanho?: number; className?: string };

const CAMINHO_TELEFONE =
  'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z';

export const IconeTelefone = (p: P) => <Icone {...p}><path d={CAMINHO_TELEFONE} /></Icone>;
export const IconeAtendida = (p: P) => <Icone {...p}><circle cx="12" cy="12" r="9" strokeWidth="2.2" /><path d="m7 12 3.2 3.2L18 7.5" strokeWidth="2.2" /></Icone>;
export const IconeCamadas = (p: P) => <Icone {...p}><g strokeWidth="2.1"><path d="m12 3 9 4.5-9 4.5-9-4.5Z" /><path d="m3 12 9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" /></g></Icone>;
export const IconeCentralTelefonica = (p: P) => <Icone {...p}><g strokeWidth="2"><path d="M4 14h16v7H4zM7 14V9a5 5 0 0 1 10 0v5M9 17h6M10 19h4" /><path d="M3 8V5c5-3 13-3 18 0v3l-5-1V5M8 5v2L3 8" /></g></Icone>;
export const IconeDesligar = ({ className = '', ...p }: P) => (
  <Icone {...p} className={`rotate-[135deg] ${className}`}><path d={CAMINHO_TELEFONE} /></Icone>
);
export const IconeRecebida = (p: P) => <Icone {...p}><path d="M17 7 7 17M16 17H7V8" /></Icone>;
export const IconeFeita = (p: P) => <Icone {...p}><path d="M7 17 17 7M8 7h9v9" /></Icone>;
export const IconeMicrofone = (p: P) => (
  <Icone {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></Icone>
);
export const IconeMicrofoneMudo = (p: P) => (
  <Icone {...p}><path d="M2 2l20 20M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M19 10a7 7 0 0 1-1.1 3.8M5 10a7 7 0 0 0 10.7 6M12 17v5" /></Icone>
);
export const IconeApagar = (p: P) => (
  <Icone {...p}><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" /><path d="m18 9-6 6M12 9l6 6" /></Icone>
);
export const IconeCheck = (p: P) => <Icone {...p}><path d="M20 6 9 17l-5-5" /></Icone>;
export const IconeEnviar = (p: P) => <Icone {...p}><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></Icone>;
export const IconeChevron = (p: P) => <Icone {...p}><path d="m6 9 6 6 6-6" /></Icone>;
export const IconeTexto = (p: P) => <Icone {...p}><path d="M4 6h16M4 12h16M4 18h10" /></Icone>;
export const IconeFechar = (p: P) => <Icone {...p}><path d="M18 6 6 18M6 6l12 12" /></Icone>;
export const IconeRelogio = (p: P) => <Icone {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Icone>;
export const IconeCusto = (p: P) => (
  <Icone {...p}><circle cx="12" cy="12" r="10" /><path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2A2.5 2.5 0 0 1 9.5 15M12 6v1.5M12 16.5V18" /></Icone>
);
export const IconeInfo = (p: P) => <Icone {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></Icone>;
export const IconeWhatsapp = (p: P) => (
  <Icone {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l1.9-5.5A8.5 8.5 0 1 1 21 11.5z" />
    <path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.5-1.8-1.3-2.3-2.3l.8-1-1-2z" />
  </Icone>
);
export const IconeHistorico = (p: P) => (
  <Icone {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3" />
    <path d="m8 6-2 2c-.8.8.3 4.3 3.5 7.5S16.2 19.8 17 19l2-2-4-3-2 2a12 12 0 0 1-5-5l2-2Z" />
  </Icone>
);
export const IconeFiltro = (p: P) => <Icone {...p}><path strokeWidth="2.2" d="M4 4h16l-6.5 8v7l-3-1.5V12z" /></Icone>;
export const IconeBusca = (p: P) => <Icone {...p}><g strokeWidth="2.2"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-5-5" /></g></Icone>;
export const IconeCarregando = ({ className = '', ...p }: P) => (
  <Icone {...p} className={`animate-spin motion-reduce:animate-none ${className}`}><path d="M21 12a9 9 0 1 1-6.2-8.6" /></Icone>
);

export function IconePlay({ className = '' }: { className?: string }) {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true" className={className}>
      <path d="M1 1v8l7-4z" fill="currentColor" />
    </svg>
  );
}
