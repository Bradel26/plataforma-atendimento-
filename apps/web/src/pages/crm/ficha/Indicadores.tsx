import { moeda, type IndicadoresFicha } from '../../../lib/types';

/**
 * Os numeros do topo da ficha, do contato ou da conta.
 *
 * Sem grafico: sao seis valores de grandezas diferentes — contagem, dinheiro —
 * e nao uma serie. Barra ou pizza aqui compararia coisas que nao se comparam.
 */
export function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-800">{valor}</p>
      {detalhe && <p className="text-xs text-slate-400">{detalhe}</p>}
    </div>
  );
}

/**
 * A linha de seis. `escopo` muda dois rotulos: na ficha do contato, conversas e
 * ligacoes sao dele; na ficha da conta, a plataforma nao conta atendimento por
 * empresa — conversa pertence a pessoa — e mostrar zero ali seria mentira, entao
 * esses dois cartoes saem.
 */
export function Indicadores({ dados, escopo }: { dados: IndicadoresFicha; escopo: 'CONTATO' | 'CONTA' }) {
  const doContato = escopo === 'CONTATO';

  return (
    <div className={`grid gap-2 sm:grid-cols-3 ${doContato ? 'lg:grid-cols-6' : 'lg:grid-cols-4'}`}>
      {doContato && <Indicador rotulo="Conversas" valor={String(dados.conversas)} />}
      {doContato && <Indicador rotulo="Ligacoes" valor={String(dados.chamadas)} />}
      {/* Rotulo curto e a qualificacao no detalhe: "Protocolos abertos" em duas
          linhas desalinha a altura dos cartoes. */}
      <Indicador rotulo="Protocolos" valor={String(dados.protocolosAbertos)} detalhe="abertos" />
      <Indicador rotulo="Oportunidades" valor={String(dados.oportunidadesAbertas)} detalhe="em aberto" />
      <Indicador
        rotulo="Ja comprou"
        valor={moeda(dados.valorGanho)}
        detalhe={`${dados.oportunidadesGanhas} ganha(s)`}
      />
      <Indicador rotulo="Tarefas" valor={String(dados.atividadesAbertas)} detalhe="em aberto" />
    </div>
  );
}
