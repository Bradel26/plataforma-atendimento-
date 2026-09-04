import { useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { Filial } from '../../lib/types';

const FORM_VAZIO = { nome: '', cidade: '', uf: '' };

export function FiliaisTab() {
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => {
    const { filiais: lista } = await api.get<{ filiais: Filial[] }>('/filiais');
    setFiliais(lista);
  };

  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar filiais'));
  }, []);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post('/filiais', {
        nome: form.nome,
        ...(form.cidade.trim() ? { cidade: form.cidade.trim() } : {}),
        ...(form.uf.trim() ? { uf: form.uf.trim() } : {}),
      });
      setForm(FORM_VAZIO);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar filial');
    } finally {
      setEnviando(false);
    }
  };

  const alternarAtiva = async (filial: Filial) => {
    setErro(null);
    try {
      await api.patch(`/filiais/${filial.id}`, { ativa: !filial.ativa });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao atualizar filial');
    }
  };

  const remover = async (filial: Filial) => {
    if (!window.confirm(`Remover a filial "${filial.nome}"? Contas e usuarios ficam sem filial.`)) return;
    setErro(null);
    try {
      await api.del(`/filiais/${filial.id}`);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao remover filial');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card
        titulo="Filiais"
        descricao={`${filiais.length} unidade(s) — so classificacao, nao muda quem ve o que`}
      >
        {erro && <div className="mb-4"><Alerta>{erro}</Alerta></div>}
        {filiais.length === 0 ? (
          <EmptyState
            titulo="Nenhuma filial"
            descricao="Cadastre a primeira unidade para classificar contas e pessoas por local."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filiais.map((filial) => (
              <li key={filial.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{filial.nome}</p>
                  <p className="text-xs text-slate-500">
                    {filial.cidade ? `${filial.cidade}${filial.uf ? `/${filial.uf}` : ''}` : 'Sem cidade informada'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {filial.ativa ? <Badge tom="sucesso">Ativa</Badge> : <Badge>Inativa</Badge>}
                  <Button variante="neutro" onClick={() => void alternarAtiva(filial)}>
                    {filial.ativa ? 'Desativar' : 'Reativar'}
                  </Button>
                  <Button variante="perigo" onClick={() => void remover(filial)}>
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titulo="Nova filial">
        <form onSubmit={criar} className="space-y-4">
          <Field label="Nome">
            <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Cidade">
            <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
          </Field>
          <Field label="UF" hint="2 letras">
            <Input
              maxLength={2}
              value={form.uf}
              onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
            />
          </Field>
          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Salvando...' : 'Criar filial'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
