import { useEffect, useState } from 'react';
import { Alerta, Button, Input, Select } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import { telefoneLegivel } from '../../lib/telefone';
import type { Contato } from '../../lib/types';

type Linha = { id: string; nome: string; modo: string | null; minha: boolean };

export function ModalIniciarConversa({ aberto, aoFechar, aoIniciar }: {
  aberto: boolean;
  aoFechar: () => void;
  aoIniciar: (conversaId: string) => void;
}) {
  const mostrar = useToast();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [linhaId, setLinhaId] = useState('');
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Contato[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [contato, setContato] = useState<Contato | null>(null);
  const [novo, setNovo] = useState<{ nome: string; telefone: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setContato(null);
    setNovo(null);
    setErro(null);
    void api.get<{ linhas: Linha[] }>('/conversas/linhas-de-saida').then(({ linhas: l }) => {
      setLinhas(l);
      setLinhaId(l.find((linha) => linha.minha)?.id ?? l[0]?.id ?? '');
    }).catch(() => setErro('Não foi possível carregar as linhas de saída'));
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const termo = busca.trim();
    setBuscando(true);
    const timeout = window.setTimeout(() => {
      const q = termo ? `busca=${encodeURIComponent(termo)}&` : '';
      void api.get<{ contatos: Contato[] }>(`/contatos?${q}limite=8`)
        .then(({ contatos: lista }) => setResultados(lista))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [busca, aberto]);

  const iniciar = async () => {
    if (!linhaId) { setErro('Escolha o canal de saída'); return; }
    setEnviando(true);
    setErro(null);
    try {
      let alvo = contato;
      if (!alvo && novo) {
        if (!novo.nome.trim() || novo.telefone.replace(/\D/g, '').length < 10) {
          setErro('Informe nome e telefone com DDD');
          return;
        }
        alvo = (await api.post<{ contato: Contato }>('/contatos/por-telefone', {
          nome: novo.nome.trim(), telefone: novo.telefone,
        })).contato;
      }
      if (!alvo) { setErro('Escolha um contato'); return; }
      const { conversa } = await api.post<{ conversa: { id: string } }>('/conversas', { contatoId: alvo.id, canalConfigId: linhaId });
      mostrar('sucesso', 'Conversa iniciada com sucesso');
      aoIniciar(conversa.id);
      aoFechar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível iniciar a conversa');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal aberto={aberto} titulo="Iniciar nova conversa" aoFechar={aoFechar} rodape={<>
      <Button variante="neutro" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
      <Button onClick={() => void iniciar()} disabled={enviando || (!contato && !novo)}>
        {enviando ? 'Iniciando...' : 'Iniciar conversa'}
      </Button>
    </>}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Canal de saída *</label>
          <Select value={linhaId} onChange={(e) => setLinhaId(e.target.value)}>
            {linhas.length === 0 && <option value="">Nenhuma linha disponível</option>}
            {linhas.map((linha) => <option key={linha.id} value={linha.id}>{linha.nome}{linha.minha ? ' (meu número)' : ''}</option>)}
          </Select>
        </div>
        {!novo ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Contato *</label>
            <Input placeholder="Buscar contato..." value={busca} onChange={(e) => { setBusca(e.target.value); setContato(null); }} />
            <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
              <li><button type="button" onClick={() => setNovo({ nome: busca.trim(), telefone: '' })} className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">+ Criar novo contato</button></li>
              {buscando && resultados === null && <li className="space-y-2 p-3"><SkeletonBloco className="h-4 w-full" /><SkeletonBloco className="h-4 w-4/5" /></li>}
              {resultados?.length === 0 && !buscando && <li className="px-3 py-3 text-center text-xs text-slate-500">Nenhum contato encontrado</li>}
              {resultados?.map((item) => <li key={item.id}>
                <button type="button" onClick={() => setContato(item)} aria-pressed={contato?.id === item.id} className={`w-full px-3 py-2 text-left text-sm ${contato?.id === item.id ? 'bg-[var(--brand-primary)]/10' : 'hover:bg-slate-50'}`}>
                  <span className="block text-slate-800">{item.nome}</span>
                  <span className="block text-[11px] text-slate-500">{item.telefone ? telefoneLegivel(item.telefone.replace(/\D/g, '')) : 'Sem telefone'}</span>
                </button>
              </li>)}
            </ul>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-700">Novo contato</p>
            <Input placeholder="Nome (ex.: Bradel - Mateus)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <Input placeholder="Telefone com DDD" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
            <button type="button" onClick={() => setNovo(null)} className="text-xs text-slate-500 underline">Voltar para a busca</button>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Telefone *</label>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {contato?.telefone ? `${telefoneLegivel(contato.telefone.replace(/\D/g, ''))} · principal` : novo?.telefone || 'Selecione um contato primeiro'}
          </p>
        </div>
        {erro && <Alerta>{erro}</Alerta>}
      </div>
    </Modal>
  );
}
