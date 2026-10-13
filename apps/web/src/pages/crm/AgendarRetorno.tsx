import { useEffect, useState } from 'react';
import { Alerta, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { LABEL_TIPO_ATIVIDADE, type Contato, type TipoAtividade } from '../../lib/types';

/** Os tipos da agenda do credenciamento, na ordem do documento. */
const TIPOS: TipoAtividade[] = ['LIGACAO', 'WHATSAPP', 'RETORNO', 'DOCUMENTACAO', 'ACOMPANHAMENTO', 'REUNIAO', 'OUTRO'];

/**
 * Agendar retorno ou atividade direto da agenda, sem abrir a ficha do parceiro.
 * Grava pelo mesmo `POST /atividades` da ficha, entao aparece na agenda, na
 * linha do tempo e nos Acompanhamentos.
 */
export function AgendarRetorno({ aoAgendar }: { aoAgendar: () => void }) {
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Contato[]>([]);
  const [contato, setContato] = useState<Contato | null>(null);
  const [form, setForm] = useState({ tipo: 'RETORNO' as TipoAtividade, titulo: '', prazo: '' });
  const [recorrencia, setRecorrencia] = useState({ frequencia: '', fimEm: '', diasSemana: [] as number[] });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const horaAgendada = form.prazo.slice(11, 16);
  const horarioPermitido = !form.prazo || (horaAgendada >= '08:00' && horaAgendada <= '18:00');

  useEffect(() => {
    if (contato || busca.trim().length < 2) {
      setAchados([]);
      return;
    }
    const t = setTimeout(() => {
      void api
        .get<{ contatos: Contato[] }>(`/contatos?limite=8&busca=${encodeURIComponent(busca.trim())}`)
        .then((r) => setAchados(r.contatos))
        .catch(() => setAchados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busca, contato]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contato) return;
    setOcupado(true);
    setErro(null);
    try {
      await api.post('/atividades', {
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        prazo: new Date(form.prazo).toISOString(),
        contatoId: contato.id,
        ...(recorrencia.frequencia ? {
          recorrencia: {
            frequencia: recorrencia.frequencia,
            ...(recorrencia.fimEm ? { fimEm: new Date(`${recorrencia.fimEm}T23:59:00`).toISOString() } : {}),
            diasSemana: recorrencia.diasSemana,
          },
        } : {}),
      });
      setForm({ tipo: 'RETORNO', titulo: '', prazo: '' });
      setRecorrencia({ frequencia: '', fimEm: '', diasSemana: [] });
      setContato(null);
      setBusca('');
      aoAgendar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao agendar');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card titulo="Agendar retorno ou atividade">
      {erro && <Alerta>{erro}</Alerta>}
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1.2fr_160px_1.5fr_190px_auto] md:items-end">
        <Field label="Parceiro">
          <Input
            required
            value={contato ? contato.nome : busca}
            onChange={(e) => {
              setContato(null);
              setBusca(e.target.value);
            }}
            placeholder="Buscar contato"
          />
          {!contato && achados.length > 0 && (
            <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {achados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setContato(c)}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    {c.nome} <span className="text-xs text-slate-500">{c.telefone ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <Field label="Tipo">
          <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoAtividade })}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>{LABEL_TIPO_ATIVIDADE[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Assunto">
          <Input
            required
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            placeholder="Retorno sobre cadastro"
            maxLength={200}
          />
        </Field>
        <Field label="Data e hora">
          <Input
            required
            type="datetime-local"
            min="0001-01-01T08:00"
            max="9999-12-31T18:00"
            value={form.prazo}
            onChange={(e) => setForm({ ...form, prazo: e.target.value })}
          />
          {!horarioPermitido && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              Escolha um horário entre 08:00 e 18:00.
            </p>
          )}
        </Field>
        <Button type="submit" disabled={ocupado || !contato || !form.titulo.trim() || !form.prazo || !horarioPermitido}>
          {ocupado ? 'Agendando...' : 'Agendar'}
        </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Field label="Repetição">
            <Select value={recorrencia.frequencia} onChange={(e) => setRecorrencia({ ...recorrencia, frequencia: e.target.value, diasSemana: e.target.value === 'SEMANAL' ? recorrencia.diasSemana : [] })}>
              <option value="">Não repetir</option><option value="DIARIA">Diariamente</option><option value="SEMANAL">Semanalmente</option><option value="MENSAL">Mensalmente</option>
            </Select>
          </Field>
          {recorrencia.frequencia && <Field label="Encerrar em (opcional)"><Input type="date" value={recorrencia.fimEm} onChange={(e) => setRecorrencia({ ...recorrencia, fimEm: e.target.value })} /></Field>}
          {recorrencia.frequencia === 'SEMANAL' && <fieldset className="flex flex-wrap gap-2 text-xs"><legend className="mb-1 text-slate-600">Dias da semana</legend>{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label, dia) => <label key={dia} className="flex items-center gap-1"><input type="checkbox" checked={recorrencia.diasSemana.includes(dia)} onChange={(e) => setRecorrencia({ ...recorrencia, diasSemana: e.target.checked ? [...recorrencia.diasSemana, dia] : recorrencia.diasSemana.filter((x) => x !== dia) })} />{label}</label>)}</fieldset>}
          {recorrencia.frequencia && <p className="max-w-sm text-xs text-slate-500">Sem data final, a série continua ativa e o sistema cria as próximas ocorrências automaticamente. Cada ocorrência tem horário, responsável e conclusão próprios; você pode editar uma ocorrência ou as próximas da série.</p>}
        </div>
      </form>
    </Card>
  );
}
