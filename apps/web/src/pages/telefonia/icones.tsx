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
