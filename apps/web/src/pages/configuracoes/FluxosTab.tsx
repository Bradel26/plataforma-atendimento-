import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ApiError, api } from '../../lib/api';

type CanalFluxo = { id: string; nome: string | null; ponteSessao: string | null; dono: { nome: string } | null };
type Fluxo = { id: string; nome: string; ativo: boolean; versao: number; canalConfigId: string | null; canalConfigRascunhoId: string | null; canalConfig: CanalFluxo | null; canalConfigRascunho: CanalFluxo | null; atualizadoEm: string };
type Recurso = { id: string; nome: string | null; ponteSessao: string | null; dono: { nome: string } | null };

function nomeCanal(canal: CanalFluxo | null) {
  if (!canal) return 'Número não selecionado';
  return canal.dono?.nome ? `${canal.dono.nome} · ${canal.nome ?? canal.ponteSessao ?? 'WhatsApp'}` : canal.nome ?? canal.ponteSessao ?? 'WhatsApp compartilhado';
}

export function FluxosTab() {
  const navigate = useNavigate();
  const confirmar = useConfirm();
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [canais, setCanais] = useState<Recurso[]>([]);
  const [nome, setNome] = useState('Novo fluxo de WhatsApp');
  const [canalConfigId, setCanalConfigId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const [lista, recursos] = await Promise.all([
        api.get<{ fluxos: Fluxo[] }>('/fluxos'),
        api.get<{ canais: Recurso[] }>('/fluxos/recursos'),
      ]);
      setFluxos(lista.fluxos);
      setCanais(recursos.canais);
      setCanalConfigId((atual) => atual || recursos.canais[0]?.id || '');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar os fluxos');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const criar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro(null);
    setCriando(true);
    try {
      const resultado = await api.post<{ fluxo: Fluxo }>('/fluxos/novo', { nome, canalConfigId: canalConfigId || null });
      navigate(`/configuracoes/fluxos/${resultado.fluxo.id}`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível criar o fluxo');
    } finally {
      setCriando(false);
    }
  };

  const desativar = async (id: string) => {
    setErro(null);
    try {
      await api.post(`/fluxos/${id}/desativar`, {});
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível desativar o fluxo');
    }
  };

  const excluir = (fluxo: Fluxo) => {
    confirmar({
      titulo: `Excluir o fluxo "${fluxo.nome}"?`,
      descricao: 'Novas conversas deixam de usar este fluxo. Atendimentos em andamento mantêm a versão salva.',
      variante: 'perigo',
      rotuloConfirmar: 'Excluir fluxo',
      aoConfirmar: async () => {
        setErro(null);
        try {
          await api.del(`/fluxos/${fluxo.id}`);
          await carregar();
        } catch (e) {
          setErro(e instanceof ApiError ? e.message : 'Não foi possível excluir o fluxo');
        }
      },
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <Card titulo="Roteamentos de WhatsApp" descricao={`${fluxos.length} fluxo(s) cadastrado(s)`}>
        {erro && <Alerta>{erro}</Alerta>}
        {carregando ? (
          <p className="py-8 text-sm text-slate-500">Carregando fluxos...</p>
        ) : fluxos.length === 0 ? (
          <EmptyState titulo="Nenhum fluxo criado" descricao="Crie um fluxo para organizar boas-vindas, menus e encaminhamento para as equipes." />
        ) : (
          <div className="divide-y divide-slate-100">
            {fluxos.map((fluxo) => (
              <div key={fluxo.id} className="flex flex-wrap items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{fluxo.nome}</p>
                  <p className="mt-1 text-xs text-slate-500">{nomeCanal(fluxo.canalConfig ?? fluxo.canalConfigRascunho)} · Versão {fluxo.versao}</p>
                </div>
                <Badge tom={fluxo.ativo ? 'sucesso' : 'neutro'}>{fluxo.ativo ? 'Publicado' : 'Rascunho'}</Badge>
                <div className="flex items-center gap-2">
                  <Button variante="neutro" onClick={() => navigate(`/configuracoes/fluxos/${fluxo.id}`)}>Editar</Button>
                  {fluxo.ativo && <Button variante="neutro" onClick={() => void desativar(fluxo.id)}>Desativar</Button>}
                  <Button variante="perigo" onClick={() => excluir(fluxo)}>Excluir</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card titulo="Novo roteamento" descricao="Um fluxo publicado vale para mensagens recebidas no número selecionado.">
        <form onSubmit={criar} className="space-y-4">
          <Field label="Descrição">
            <Input required minLength={2} maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </Field>
          <Field label="Número WhatsApp Web">
            <Select required value={canalConfigId} onChange={(e) => setCanalConfigId(e.target.value)}>
              <option value="">Selecione um número</option>
              {canais.map((canal) => (
                <option key={canal.id} value={canal.id}>{nomeCanal(canal)}</option>
              ))}
            </Select>
          </Field>
          {canais.length === 0 && <Alerta>Nenhum número WhatsApp Web ativo. Configure um em Configurações → Canais.</Alerta>}
          <Button type="submit" disabled={criando || canais.length === 0}>{criando ? 'Criando...' : 'Criar fluxo'}</Button>
        </form>
      </Card>
    </div>
  );
}
