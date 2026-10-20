import type { ReactNode } from 'react';

function Icone({ children, tamanho = 16, className = '' }: { children: ReactNode; tamanho?: number; className?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
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

export const IconeBusca = (p: P) => <Icone {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icone>;
export const IconeMais = (p: P) => <Icone {...p}><path d="M12 5v14M5 12h14" /></Icone>;
export const IconeWhatsapp = (p: P) => <Icone {...p}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /></Icone>;
export const IconeRelogio = (p: P) => <Icone {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icone>;
export const IconeCopiar = (p: P) => (
  <Icone {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icone>
);
export const IconeTransferir = (p: P) => <Icone {...p}><path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16" /></Icone>;
export const IconeEncerrar = (p: P) => <Icone {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></Icone>;
export const IconeMaisAcoes = (p: P) => (
  <Icone {...p}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></Icone>
);
export const IconeCadeado = (p: P) => <Icone {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icone>;
export const IconeClipe = (p: P) => (
  <Icone {...p}><path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6A4 4 0 1 1 18 8.8l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.5-8.5" /></Icone>
);
export const IconeRaio = (p: P) => <Icone {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></Icone>;
export const IconeEnviar = (p: P) => <Icone {...p}><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></Icone>;
export const IconeChevron = (p: P) => <Icone {...p}><path d="m6 9 6 6 6-6" /></Icone>;
export const IconeCheck = (p: P) => <Icone {...p}><path d="M20 6 9 17l-5-5" /></Icone>;
export const IconeEntrada = (p: P) => <Icone {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" /></Icone>;
export const IconeVoltar = (p: P) => <Icone {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Icone>;
export const IconeFicha = (p: P) => <Icone {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></Icone>;
export const IconeBalao = (p: P) => <Icone {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icone>;
