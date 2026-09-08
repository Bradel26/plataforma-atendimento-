import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '../../components/ui';
import { SkeletonBloco, SkeletonTexto } from '../../components/ui/Skeleton';
import { Indicador } from '../../pages/crm/ficha/Indicadores';
import { RegistrarAtividade } from '../../pages/crm/ficha/RegistrarAtividade';
import { EditorEtiquetas } from '../../pages/crm/Etiquetas';
import { LABEL_TIPO_ATIVIDADE, type Atividade, type FichaContato as Ficha } from '../../lib/types';
import { api } from '../../lib/api';

/**
 * Quem e essa pessoa, sem sair da conversa — e o que fazer a respeito dela.
 *
 * Versao estreita da ficha completa (`pages/crm/ficha/FichaContato.tsx`): os
 * quatro numeros que cabem numa coluna de atendimento, mais as tres acoes que
 * o proprio atendimento mais usa (etiquetar, registrar/agendar, abrir a
 * empresa) — reaproveitando exatamente os mesmos componentes e rotas da ficha
 * completa, e nao uma segunda implementacao das mesmas acoes. A ficha inteira
 * (linha do tempo, vincular empresa) continua a um clique em "Ver ficha
 * completa".
 *
 * Erro de carregamento fica em silencio: a conversa continua respondivel sem
 * este painel, e um alerta aqui competiria com o que importa na tela.
 */
export function PainelContato({
  contatoId,
  aoFechar,
}: {
  contatoId: string;
  /** So existe quando o painel e um drawer (notebook/tablet) ou um passo do mobile — no desktop a coluna e fixa. */
  aoFechar?: () => void;
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [mostrarRegistro, setMostrarRegistro] = useState(false);

  const carregar = useCallback(() => {
    return api
      .get<Ficha>(`/ficha/contato/${contatoId}`)
      .then(setFicha)
      .catch(() => undefined);
  }, [contatoId]);

  useEffect(() => {
    let vivo = true;
    setFicha(null);
    setMostrarRegistro(false);
    void api
      .get<Ficha>(`/ficha/contato/${contatoId}`)
      .then((f) => {
        if (vivo) setFicha(f);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [contatoId]);

  const registrarEEsconder = (_atividade: Atividade) => {
    setMostrarRegistro(false);
    void carregar();
  };

  if (!ficha) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center gap-3">
            <SkeletonBloco className="h-11 w-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonTexto linhas={2} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBloco key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const { contato, indicadores: i, atividadesAbertas } = ficha;
  const agora = Date.now();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
          >
            {contato.nome.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{contato.nome}</p>
            {contato.conta ? (
              <Link
                to={`/clientes/${contato.conta.id}`}
                className="block truncate text-xs text-[var(--brand-primary)] hover:underline"
              >
                {contato.conta.nome}
              </Link>
            ) : (
              <p className="truncate text-xs text-slate-500">Sem empresa</p>
            )}
          </div>
          {/* So existe quando o painel e fechavel (drawer no notebook/tablet, passo no mobile). */}
          {aoFechar && (
            <Button variante="neutro" tamanho="sm" onClick={aoFechar} aria-label="Fechar ficha do contato">
              &times;
            </Button>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="min-w-0">
            <dt className="text-slate-500">Telefone</dt>
            <dd className="truncate text-slate-700">{contato.telefone ?? '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500">E-mail</dt>
            <dd className="truncate text-slate-700">{contato.email ?? '—'}</dd>
          </div>
        </dl>

        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-slate-500">Etiquetas</p>
          <EditorEtiquetas
            tags={contato.tags ?? []}
            aoSalvar={async (tags) => {
              await api.patch(`/contatos/${contatoId}`, { tags });
              await carregar();
            }}
          />
        </div>

        {/* Acao mais frequente do atendimento sobre o contato: marcar o que foi
            combinado ou agendar um retorno, sem sair da conversa. Mesmo
            componente que a ficha completa usa — so entra escondido porque o
            formulario aberto tomaria a altura toda deste painel estreito. */}
        <div className="mt-3">
          <Button
            variante="neutro"
            tamanho="sm"
            aria-expanded={mostrarRegistro}
            onClick={() => setMostrarRegistro((v) => !v)}
          >
            {mostrarRegistro ? 'Fechar registro' : 'Registrar / agendar'}
          </Button>
        </div>

        {mostrarRegistro && (
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <RegistrarAtividade contatoId={contatoId} aoRegistrar={registrarEEsconder} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4">
        <Indicador rotulo="Oportunidades" valor={String(i.oportunidadesAbertas)} detalhe="em aberto" />
        <Indicador rotulo="Ja comprou" valor={String(i.oportunidadesGanhas)} detalhe="ganha(s)" />
        <Indicador rotulo="Protocolos" valor={String(i.protocolosAbertos)} detalhe="abertos" />
        <Indicador rotulo="Tarefas" valor={String(i.atividadesAbertas)} detalhe="em aberto" />
      </div>

      {atividadesAbertas.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-2 text-xs font-medium text-slate-500">Proximas acoes</p>
          <ul className="space-y-2">
            {atividadesAbertas.map((a) => {
              const atrasada = Boolean(a.prazo && new Date(a.prazo).getTime() < agora);
              return (
                <li key={a.id} className="rounded-lg border border-slate-100 px-2.5 py-2">
                  <p className="truncate text-xs font-medium text-slate-700">{a.titulo}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge>{LABEL_TIPO_ATIVIDADE[a.tipo]}</Badge>
                    {a.prazo && (
                      <span className={`text-[11px] ${atrasada ? 'text-red-600' : 'text-slate-500'}`}>
                        {new Date(a.prazo).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="border-t border-slate-100 p-4">
        <Link
          to={`/contatos/${contatoId}`}
          className="block w-full rounded-lg border border-slate-300 py-2 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver ficha completa
        </Link>
      </div>
    </div>
  );
}
