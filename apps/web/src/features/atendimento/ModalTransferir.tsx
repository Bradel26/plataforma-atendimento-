import { useEffect, useState } from 'react';
import { Alerta, Button, Input } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import { LABEL_PERFIL, type ConversaDetalhe, type Perfil } from '../../lib/types';
import { separarDestinos, type Destinos } from './destinos';

type Escolha = { tipo: 'agente'; id: string; nome: string } | { tipo: 'fila'; id: string; nome: string };

export function ModalTransferir({ conversa, aberto, aoFechar, aoTransferir }: {
  conversa: ConversaDetalhe;
  aberto: boolean;
  aoFechar: () => void;
  aoTransferir: (detalhe: ConversaDetalhe) => void;
}) {
  const mostrar = useToast();
  const [destinos, setDestinos] = useState<Destinos | null>(null);
  const [busca, setBusca] = useState('');
  const [motivo, setMotivo] = useState('');
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setMotivo('');
    setEscolha(null);
    setErro(null);
    setDestinos(null);
    void api.get<Destinos>('/conversas/destinos-transferencia').then(setDestinos).catch(() => setErro('Não foi possível carregar usuários e equipes'));
  }, [aberto]);

  const listas = destinos ? separarDestinos(destinos, busca, conversa.agente?.id ?? null) : null;
  const total = listas ? listas.disponiveis.length + listas.indisponiveis.length + listas.equipes.length : 0;

  const transferir = async () => {
    if (!escolha) return;
    setEnviando(true);
    setErro(null);
    try {
      const corpo = {
        ...(escolha.tipo === 'agente' ? { agenteId: escolha.id } : { filaId: escolha.id }),
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      };
      const { conversa: nova } = await api.post<{ conversa: ConversaDetalhe }>(`/conversas/${conversa.id}/transferir`, corpo);
      mostrar('sucesso', `Conversa transferida para ${escolha.nome}`);
      aoTransferir(nova);
      aoFechar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao transferir');
    } finally {
      setEnviando(false);
    }
  };

  const item = (destino: Escolha, legenda: string) => (
    <li key={`${destino.tipo}-${destino.id}`}>
      <button
        type="button"
        onClick={() => setEscolha(destino)}
        aria-pressed={escolha?.tipo === destino.tipo && escolha.id === destino.id}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
          escolha?.tipo === destino.tipo && escolha.id === destino.id
            ? 'bg-[var(--brand-primary)]/10 ring-1 ring-[var(--brand-primary)]'
            : 'hover:bg-slate-50'
        }`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-600">{destino.nome.charAt(0)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-slate-800">{destino.nome}</span>
          <span className="block text-[11px] text-slate-500">{legenda}</span>
        </span>
      </button>
    </li>
  );

  return (
    <Modal
      aberto={aberto}
      titulo="Transferir conversa"
      aoFechar={aoFechar}
      rodape={<>
        <Button variante="neutro" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
        <Button onClick={() => void transferir()} disabled={!escolha || enviando}>
          {enviando ? 'Transferindo...' : 'Transferir conversa'}
        </Button>
      </>}
    >
      <label className="mb-1 block text-xs font-medium text-slate-700">Usuário ou equipe *</label>
      <Input placeholder="Buscar usuário ou equipe..." value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
      {erro && <div className="mt-2"><Alerta>{erro}</Alerta></div>}
      {!listas && !erro && <p className="mt-3 text-xs text-slate-500">Carregando...</p>}
      {listas && (
        <div className="mt-3 space-y-3">
          <p className="flex justify-between text-[11px] uppercase tracking-wide text-slate-400">
            <span>Disponíveis</span><span>{total} encontrados</span>
          </p>
          <ul className="space-y-0.5">
            {listas.disponiveis.map((u) => item({ tipo: 'agente', id: u.id, nome: u.nome }, LABEL_PERFIL[u.perfil as Perfil] ?? 'Usuário'))}
          </ul>
          {listas.equipes.length > 0 && <>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Equipes</p>
            <ul className="space-y-0.5">{listas.equipes.map((fila) => item({ tipo: 'fila', id: fila.id, nome: fila.nome }, 'Equipe'))}</ul>
          </>}
          {listas.indisponiveis.length > 0 && <>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Indisponíveis</p>
            <ul className="space-y-0.5 opacity-70">
              {listas.indisponiveis.map((u) => item({ tipo: 'agente', id: u.id, nome: u.nome }, 'Offline'))}
            </ul>
          </>}
          {total === 0 && <p className="text-xs text-slate-500">Nenhum usuário ou equipe encontrado.</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Motivo (opcional)</label>
            <Input value={motivo} maxLength={280} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente pediu o financeiro" />
          </div>
        </div>
      )}
    </Modal>
  );
}
