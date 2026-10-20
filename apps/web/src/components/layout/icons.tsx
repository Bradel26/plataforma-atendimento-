type IconProps = { className?: string };

/**
 * Icones inline (sem dependencia externa) — um por item do menu lateral.
 *
 * Mesma grade (24), mesmo traco e cantos arredondados em todos, para o menu
 * ler como uma familia. Cada modulo tem o seu: dois itens com o mesmo icone
 * obrigavam a ler o rotulo para saber onde clicar.
 */
const base = 'h-5 w-5';

const Svg = ({ className, children }: IconProps & { children: React.ReactNode }) => (
  <svg
    className={`shrink-0 ${className ?? base}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconDashboards = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="9" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="5" rx="2" />
    <rect x="13.5" y="11" width="7.5" height="10" rx="2" />
    <rect x="3" y="15" width="7.5" height="6" rx="2" />
  </Svg>
);

export const IconAtendimento = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5a7.5 7.5 0 0 1-11.2 6.5L4 19.5l1.5-4.3A7.5 7.5 0 1 1 20 11.5z" />
    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeWidth={2.4} />
  </Svg>
);

export const IconProtocolo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6M9 17h4" />
  </Svg>
);

export const IconTelefonia = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.6 3.5h2.6l1.6 4.2-2 1.3a10.5 10.5 0 0 0 5.2 5.2l1.3-2 4.2 1.6v2.6a2 2 0 0 1-2.2 2A16 16 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" />
    <path d="M15 3.5a5.5 5.5 0 0 1 5.5 5.5" />
  </Svg>
);

export const IconEsteira = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
    <path d="M9 3.5v17M15 3.5v17" />
    <path d="M5.5 7.5h1.5M11.25 7.5h1.5M11.25 11h1.5M17 7.5h1.5M17 11h1.5M17 14.5h1.5" />
  </Svg>
);

export const IconMonitoramento = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
    <path d="M6 11h2.5l1.5-3 2.5 6 1.5-3H18" />
    <path d="M9 21h6M12 17v4" />
  </Svg>
);

export const IconAuditoria = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6z" />
    <path d="m8.75 12 2.25 2.25 4.25-4.5" />
  </Svg>
);

export const IconGestao = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 17a8.5 8.5 0 1 1 17 0" />
    <path d="m12 17 4-5" />
    <circle cx="12" cy="17" r="1.6" />
    <path d="M6.5 13.5 5.4 12.9M12 8.5V7.3M17.5 13.5l1.1-.6" />
  </Svg>
);

export const IconCampanhas = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 10v4a1 1 0 0 0 1 1H7l7.5 4.5V4.5L7 9H4.5a1 1 0 0 0-1 1z" />
    <path d="M7 15l1 5h2.5" />
    <path d="M18 9.5a3.5 3.5 0 0 1 0 5" />
  </Svg>
);

export const IconRelatorios = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 3.5v15a2 2 0 0 0 2 2h15" />
    <path d="m7.5 15 3.5-4 3 2.5 5-6.5" />
    <path d="M15.5 7H19v3.5" />
  </Svg>
);

export const IconEscalas = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Svg>
);

export const IconCrm = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20" />
  </Svg>
);

export const IconConfiguracoes = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);

export const IconSair = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Svg>
);

export const IconChamadoTi = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.75" />
    <path d="m5.6 5.6 3.75 3.75M14.65 14.65l3.75 3.75M18.4 5.6l-3.75 3.75M9.35 14.65 5.6 18.4" />
  </Svg>
);
