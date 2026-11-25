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
export const IconeTelefone = (p: P) => (
  <Icone {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></Icone>
);
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
export const IconeSorriso = (p: P) => (
  <Icone {...p}><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01" /></Icone>
);
export const IconeDocumento = (p: P) => (
  <Icone {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Icone>
);

export const IconeMicrofone = (p: P) => (
  <Icone {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></Icone>
);
export const IconeCamera = (p: P) => (
  <Icone {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></Icone>
);
export const IconeImagem = (p: P) => (
  <Icone {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Icone>
);
export const IconeFones = (p: P) => (
  <Icone {...p}><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></Icone>
);
export const IconeLixeira = (p: P) => (
  <Icone {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></Icone>
);
