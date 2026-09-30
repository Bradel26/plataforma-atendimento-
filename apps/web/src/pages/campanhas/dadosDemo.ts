import type { Campanha, CampanhaItem } from '../../lib/types';

/**
 * Dados ficticios so para conferir o layout da aba Campanhas (abra com `?demo=1`).
 * Nada daqui vai ao banco: a pagina nao chama a API enquanto o modo demo esta ligado.
 */

const dia = (deslocamentoDias: number, hora = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
};

const base = {
  fila: null,
  criadoPor: { id: 'demo-user', nome: 'Administrador' },
};

export const CAMPANHAS_DEMO: Campanha[] = [
  {
    ...base,
    id: 'demo-1',
    nome: 'Credenciamento Starlink — Pará',
    canal: 'WHATSAPP',
    mensagem: 'Olá, {{nome}}! A Bradel abriu o credenciamento Starlink no Pará. Posso te enviar os detalhes?',
    status: 'ATIVA',
    agendadaPara: null,
    iniciadaEm: dia(-1),
    concluidaEm: null,
    criadoEm: dia(-3),
    total: 48,
    contagens: { PENDENTE: 12, ENVIADO: 30, FALHOU: 2, RESPONDIDO: 0, IGNORADO: 4 },
  },
  {
    ...base,
    id: 'demo-2',
    nome: 'Reativação de parceiros — Goiás',
    canal: 'WHATSAPP',
    mensagem: '{{nome}}, sentimos sua falta! Temos novidades em ar-condicionado Philco para sua região.',
    status: 'PAUSADA',
    agendadaPara: null,
    iniciadaEm: dia(-2),
    concluidaEm: null,
    criadoEm: dia(-5),
    total: 120,
    contagens: { PENDENTE: 80, ENVIADO: 40, FALHOU: 0, RESPONDIDO: 0, IGNORADO: 0 },
  },
  {
    ...base,
    id: 'demo-3',
    nome: 'Credenciamento TIM — Tocantins',
    canal: 'WHATSAPP',
    mensagem: 'Olá, {{nome}}! Você pode se credenciar como revendedor TIM pela Bradel. Quer saber como?',
    status: 'RASCUNHO',
    agendadaPara: dia(2, 14),
    iniciadaEm: null,
    concluidaEm: null,
    criadoEm: dia(-1),
    total: 35,
    contagens: { PENDENTE: 35, ENVIADO: 0, FALHOU: 0, RESPONDIDO: 0, IGNORADO: 0 },
  },
  {
    ...base,
    id: 'demo-4',
    nome: 'Convite para treinamento Philco',
    canal: 'INSTAGRAM',
    mensagem: 'Oi, {{nome}}! Vamos ter um treinamento online sobre a linha Philco. Responda aqui para garantir sua vaga.',
    status: 'RASCUNHO',
    agendadaPara: null,
    iniciadaEm: null,
    concluidaEm: null,
    criadoEm: dia(0),
    total: 0,
    contagens: { PENDENTE: 0, ENVIADO: 0, FALHOU: 0, RESPONDIDO: 0, IGNORADO: 0 },
  },
  {
    ...base,
    id: 'demo-5',
    nome: 'Pesquisa de satisfação — 2º trimestre',
    canal: 'WHATSAPP',
    mensagem: '{{nome}}, como foi sua experiência com a Bradel neste trimestre? Sua opinião nos ajuda a melhorar.',
    status: 'CONCLUIDA',
    agendadaPara: null,
    iniciadaEm: dia(-20),
    concluidaEm: dia(-19),
    criadoEm: dia(-22),
    total: 90,
    contagens: { PENDENTE: 0, ENVIADO: 84, FALHOU: 3, RESPONDIDO: 0, IGNORADO: 3 },
  },
];

const NOMES = [
  'Ana Souza', 'Carlos Lima', 'Mariana Alves', 'Pedro Rocha', 'Juliana Melo',
  'Rafael Costa', 'Fernanda Dias', 'Lucas Martins', 'Patrícia Nunes', 'Bruno Araújo',
];

const STATUS_ITENS: CampanhaItem['status'][] = [
  'ENVIADO', 'ENVIADO', 'PENDENTE', 'ENVIADO', 'IGNORADO', 'ENVIADO', 'FALHOU', 'PENDENTE', 'ENVIADO', 'ENVIADO',
];

export const ITENS_DEMO: CampanhaItem[] = NOMES.map((nome, i) => {
  const status = STATUS_ITENS[i]!;
  return {
    id: `demo-item-${i}`,
    status,
    erro: status === 'FALHOU' ? 'Número sem WhatsApp' : null,
    enviadoEm: status === 'ENVIADO' ? dia(-1, 10) : null,
    contato: {
      id: `demo-contato-${i}`,
      nome,
      telefone: status === 'IGNORADO' ? null : `(91) 9${8000 + i * 137}-${1000 + i * 211}`,
      email: null,
    },
  };
});

export const RESULTADO_DEMO = { parceirosQueInteragiram: 9, respostasRecebidas: 14 };
