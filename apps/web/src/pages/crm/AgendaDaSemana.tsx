import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Badge, Button, Card } from '../../components/ui';
import { useAuth } from '../../features/auth/AuthProvider';
import { ApiError, api } from '../../lib/api';

/**
 * Agenda da semana (item E.5) — a agenda embutida no dashboard da demonstracao.
 *
 * Tres coisas nesta tela sao decisao, e nao acabamento:
 *
 * 1. **A faixa de atrasadas vem primeiro.** Agenda que mostra so segunda a
 *    domingo esconde o que venceu antes — e e o trabalho mais urgente que existe.
 * 2. **Tarefa sem prazo aparece contada a parte.** Ela nao cabe em dia nenhum, e
 *    joga-la em "hoje" faria a tela afirmar um compromisso que ninguem marcou. A
 *    tarefa que a etapa do funil exige (item 3.1) nasce assim.
 * 3. **O fuso e o do navegador.** O offset vai na consulta; sem ele, a tarefa de
 *    sabado as 22h apareceria no domingo, e ninguem entenderia por que ela sumiu.
 */

type ItemAgenda = {
  id: string;
  titulo: string;
  tipo: string;
  prazo: string | null;
  concluidoEm: string | null;
  obrigatoria?: boolean;
  responsavel?: { id: string; nome: string } | null;
  contato?: { id: string; nome: string } | null;
  oportunidade?: { id: string; titulo: string } | null;
};

type Resposta = {
  inicio: string;
  agenda: {
    atrasadas: ItemAgenda[];
    dias: Array<{ dia: string; itens: ItemAgenda[] }>;
    semPrazo: ItemAgenda[];
    totalNaSemana: number;
  };
};

const DIA_MS = 24 * 60 * 60 * 1000;

/** Nome do dia + data, a partir de `AAAA-MM-DD` — sem passar por fuso de novo. */
function rotuloDoDia(iso: string) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  // Meio-dia UTC para o nome do dia nao escorregar pelo fuso do navegador.
  const d = new Date(Date.UTC(ano!, mes! - 1, dia!, 12));
  const nome = d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' });
  return { nome: nome.replace('.', ''), data: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}` };
}

const hora = (iso: string | null) =>
  iso === null ? '' : new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Move `AAAA-MM-DD` em semanas, sem tocar em fuso. */
function somarSemanas(iso: string, semanas: number) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const base = Date.UTC(ano!, mes! - 1, dia!) + semanas * 7 * DIA_MS;
  return new Date(base).toISOString().slice(0, 10);
}

const hojeLocal = () => {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 10);
};

export function AgendaDaSemana() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const { temPerfil } = useAuth();
  /** `/oportunidades/:id` e subrota restrita (nav.ts) — o AGENTE ve a Agenda mas nao essa rota. */
  const podeAbrirOportunidade = temPerfil('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL');

  const carregar = useCallback(async () => {
    const params = new URLSearchParams({ offset: String(new Date().getTimezoneOffset()) });
    if (inicio) params.set('inicio', inicio);
    try {
      const r = await api.get<Resposta>(`/atividades/semana?${params}`);
      setDados(r);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a agenda');
    }
  }, [inicio]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const concluir = async (id: string) => {
    setConcluindo(id);
    try {
      await api.post(`/atividades/${id}/concluir`, {});
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao concluir a tarefa');
    } finally {
      setConcluindo(null);
    }
  };

  if (erro) return <Alerta>{erro}</Alerta>;
  if (!dados) {
    return (
      <Card titulo="Agenda da semana">
        <p className="text-sm text-slate-500">Carregando...</p>
      </Card>
    );
  }

  const { agenda } = dados;
  const hoje = hojeLocal();

  const linha = (item: ItemAgenda) => (
    <li key={item.id} className="flex items-start gap-2 py-1">
      <span className="w-10 shrink-0 pt-0.5 text-xs text-slate-500">{hora(item.prazo)}</span>
      <span className="min-w-0 grow">
        <span
          className={`block truncate text-sm ${
            item.concluidoEm ? 'text-slate-400 line-through' : 'text-slate-800'
          }`}
          title={item.titulo}
        >
          {item.titulo}
        </span>
        {/* Nome clicavel: da agenda direto para a oportunidade ou o contato,
            sem precisar procurar o registro em Contatos/Oportunidades depois.
            As duas rotas ja existem (`/oportunidades/:id`, `/contatos/:id`) —
            so faltava o link daqui pra la. */}
        {item.oportunidade && podeAbrirOportunidade ? (
          <Link
            to={`/oportunidades/${item.oportunidade.id}`}
            className="block truncate text-xs text-[var(--brand-primary)] underline-offset-2 hover:underline"
          >
            {item.oportunidade.titulo}
          </Link>
        ) : item.oportunidade ? (
          <span className="block truncate text-xs text-slate-500">{item.oportunidade.titulo}</span>
        ) : (
          item.contato && (
            <Link
              to={`/contatos/${item.contato.id}`}
              className="block truncate text-xs text-[var(--brand-primary)] underline-offset-2 hover:underline"
            >
              {item.contato.nome}
            </Link>
          )
        )}
      </span>
      {item.obrigatoria && <Badge tom="neutro">etapa</Badge>}
      {/* Concluir da propria agenda: abrir a ficha para marcar uma tarefa feita
          e o tipo de passo que faz a agenda ser abandonada. */}
      {!item.concluidoEm && (
        <button
          type="button"
          onClick={() => void concluir(item.id)}
          disabled={concluindo === item.id}
          className="shrink-0 text-xs text-slate-500 underline-offset-2 hover:underline"
        >
          concluir
        </button>
      )}
    </li>
  );

  return (
    <Card
      titulo="Agenda da semana"
      descricao={`${agenda.totalNaSemana} compromisso(s) com data nesta semana`}
      acao={
        <span className="flex items-center gap-1">
          <Button variante="neutro" onClick={() => setInicio(somarSemanas(dados.inicio, -1))}>
            &larr;
          </Button>
          <Button variante="neutro" onClick={() => setInicio(null)}>
            Hoje
          </Button>
          <Button variante="neutro" onClick={() => setInicio(somarSemanas(dados.inicio, 1))}>
            &rarr;
          </Button>
        </span>
      }
    >
      {/* Atrasadas primeiro, sempre. */}
      {agenda.atrasadas.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-800">
            {agenda.atrasadas.length} atrasada(s) de antes desta semana
          </p>
          <ul className="mt-1 divide-y divide-amber-100">{agenda.atrasadas.slice(0, 8).map(linha)}</ul>
          {agenda.atrasadas.length > 8 && (
            <p className="mt-1 text-xs text-amber-700">
              e mais {agenda.atrasadas.length - 8} atrasada(s) &mdash; o numero do cabecalho conta
              todas.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {agenda.dias.map((d) => {
          const { nome, data } = rotuloDoDia(d.dia);
          return (
            <div
              key={d.dia}
              className={`rounded-lg border px-2 py-1.5 ${
                d.dia === hoje ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5' : 'border-slate-200'
              }`}
            >
              <p className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-700">
                  {nome} {data}
                </span>
                {d.itens.length > 0 && <span className="text-slate-500">{d.itens.length}</span>}
              </p>
              {d.itens.length === 0 ? (
                // Dia vazio continua na tela: dia livre e informacao para quem vai
                // marcar visita, e some justamente quando importa.
                <p className="py-1 text-xs text-slate-500">livre</p>
              ) : (
                <ul className="divide-y divide-slate-100">{d.itens.map(linha)}</ul>
              )}
            </div>
          );
        })}
      </div>

      {agenda.semPrazo.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-xs font-medium text-slate-600">
            {agenda.semPrazo.length} pendente(s) sem data
          </p>
          <p className="text-xs text-slate-500">
            Nao cabem em nenhum dia. A tarefa que a etapa do funil exige nasce sem prazo de
            proposito &mdash; um prazo inventado viraria atraso sem ninguem ter combinado data.
          </p>
          {/* Mostra as primeiras e diz quantas faltam.
              A base de dev tem quase 200 pendentes sem data: despejar todas aqui
              empurraria os sete dias — que sao o assunto da tela — para fora do
              alcance da vista. O numero completo continua no cabecalho. */}
          <ul className="mt-1 divide-y divide-slate-100">{agenda.semPrazo.slice(0, 8).map(linha)}</ul>
          {agenda.semPrazo.length > 8 && (
            <p className="mt-1 text-xs text-slate-500">
              e mais {agenda.semPrazo.length - 8} sem data &mdash; a lista completa esta em
              Oportunidades e nas fichas.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
