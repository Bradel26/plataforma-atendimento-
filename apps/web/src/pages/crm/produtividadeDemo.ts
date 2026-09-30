import { LABEL_TIPO_ATIVIDADE, TIPOS_ATIVIDADE, type CelulaProdutividade, type MatrizProdutividade, type TipoAtividade } from '../../lib/types';

/**
 * Dados FICTICIOS so para ver a matriz de produtividade preenchida.
 *
 * Nao toca em banco nem em API: e montado no navegador, e so vale em
 * desenvolvimento, com `?demo=1` na URL. Nada disto existe em producao.
 */

/** Pessoas e quantas atividades agendadas/feitas cada uma tem por tipo. */
const PESSOAS: Array<{ nome: string; tipos: Partial<Record<TipoAtividade, [feitas: number, agendadas: number]>> }> = [
  { nome: '[Demo] Ana Souza', tipos: { LIGACAO: [18, 20], WHATSAPP: [25, 28], VISITA: [5, 6], REUNIAO: [3, 4], RETORNO: [9, 10], ACOMPANHAMENTO: [7, 8] } },
  { nome: '[Demo] Bruno Lima', tipos: { LIGACAO: [11, 20], WHATSAPP: [14, 24], VISITA: [2, 6], DOCUMENTACAO: [4, 6], RETORNO: [5, 9] } },
  { nome: '[Demo] Carla Mendes', tipos: { LIGACAO: [6, 18], WHATSAPP: [9, 22], REUNIAO: [1, 5], TAREFA: [2, 8], ACOMPANHAMENTO: [3, 10] } },
  { nome: '[Demo] Diego Rocha', tipos: { LIGACAO: [15, 16], WHATSAPP: [19, 20], VISITA: [4, 4], EMAIL: [8, 9], PROPOSTA: [2, 3] } },
];

const isoDoDia = (dia: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), dia)).toISOString();

function celula(nomeTipo: string, feitas: number, agendadas: number): CelulaProdutividade {
  return {
    feitas,
    agendadas,
    percentual: Math.round((feitas / agendadas) * 100),
    // A lista aberta ao clicar: mostra ate 8, o suficiente para ver como fica.
    atividades: Array.from({ length: Math.min(agendadas, 8) }, (_, i) => ({
      id: `${nomeTipo}-${i}`,
      titulo: `${nomeTipo} ${i + 1} — parceiro exemplo`,
      prazo: isoDoDia(1 + ((i * 3) % 27)),
      concluidoEm: i < feitas ? isoDoDia(1 + ((i * 3) % 27)) : null,
    })),
  };
}

export function matrizDemo(mes: string): MatrizProdutividade {
  return {
    mes: `${mes}-01`,
    linhas: PESSOAS.map((p, idx) => {
      let feitas = 0;
      let agendadas = 0;
      const porTipo = Object.fromEntries(
        TIPOS_ATIVIDADE.map((tipo) => {
          const par = p.tipos[tipo];
          if (!par) return [tipo, null];
          feitas += par[0];
          agendadas += par[1];
          return [tipo, celula(LABEL_TIPO_ATIVIDADE[tipo], par[0], par[1])];
        }),
      ) as MatrizProdutividade['linhas'][number]['porTipo'];
      return {
        usuarioId: `demo-${idx}`,
        usuarioNome: p.nome,
        porTipo,
        total: { ...celula('Total', feitas, agendadas), atividades: [] },
      };
    }),
  };
}

/** Modo demonstracao: so em desenvolvimento e com `?demo=1`. */
export const modoDemo = () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');
