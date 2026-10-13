import { useState, type FormEvent } from 'react';
import { Alerta, Button, Field, Input, Select, Textarea } from '../../../components/ui';
import { Modal } from '../../../components/ui/Modal';
import { ApiError, api } from '../../../lib/api';
import { useAuth } from '../../../features/auth/AuthProvider';

type CanalManual = 'TELEFONE' | 'VISITA' | 'OUTRO';

function dataHoraLocal(data: Date) {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function RegistroManual({
  contatoId,
  contatoNome,
  empresa,
  aberto,
  aoFechar,
  aoSalvar,
}: {
  contatoId: string;
  contatoNome: string;
  empresa?: string | null;
  aberto: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const { usuario } = useAuth();
  const [canal, setCanal] = useState<CanalManual>('TELEFONE');
  const [ocorridoEm, setOcorridoEm] = useState(() => dataHoraLocal(new Date()));
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [resultado, setResultado] = useState('');
  const [proximaAcao, setProximaAcao] = useState('');
  const [descricaoTarefa, setDescricaoTarefa] = useState('');
  const [prazoTarefa, setPrazoTarefa] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await api.post('/atividades/registro-manual', {
        contatoId,
        canal,
        ocorridoEm: new Date(ocorridoEm).toISOString(),
        assunto: assunto.trim(),
        descricao: descricao.trim(),
        resultado: resultado.trim(),
        proximaAcao: proximaAcao.trim(),
        descricaoTarefa: descricaoTarefa.trim() || null,
        prazoTarefa: new Date(prazoTarefa).toISOString(),
        responsavelTarefaId: usuario?.id,
      });
      aoFechar();
      aoSalvar();
      setAssunto('');
      setDescricao('');
      setResultado('');
      setProximaAcao('');
      setDescricaoTarefa('');
      setPrazoTarefa('');
      setOcorridoEm(dataHoraLocal(new Date()));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o registro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      aberto={aberto}
      titulo="Novo registro manual"
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Button type="button" variante="neutro" onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" form="registro-manual-form" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar registro e tarefa'}
          </Button>
        </>
      }
    >
      <form id="registro-manual-form" onSubmit={(e) => void enviar(e)} className="space-y-4">
        {erro && <Alerta>{erro}</Alerta>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contato">
            <Input value={contatoNome} readOnly />
          </Field>
          <Field label="Empresa">
            <Input value={empresa || 'Sem empresa vinculada'} readOnly />
          </Field>
          <Field label="Canal de atendimento">
            <Select value={canal} onChange={(e) => setCanal(e.target.value as CanalManual)}>
              <option value="TELEFONE">Ligação telefônica</option>
              <option value="VISITA">Visita presencial</option>
              <option value="OUTRO">Outro canal</option>
            </Select>
          </Field>
          <Field label="Data e hora do contato">
            <Input type="datetime-local" value={ocorridoEm} onChange={(e) => setOcorridoEm(e.target.value)} required />
          </Field>
        </div>
        <Field label="Responsável pelo atendimento">
          <Input value={usuario?.nome ?? ''} readOnly />
        </Field>
        <Field label="Assunto">
          <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={160} required />
        </Field>
        <Field label="Descrição do atendimento">
          <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={4000} required />
        </Field>
        <Field label="Resultado da interação">
          <Textarea rows={2} value={resultado} onChange={(e) => setResultado(e.target.value)} maxLength={2000} required />
        </Field>
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <p className="mb-3 text-sm font-semibold text-slate-800">Próxima tarefa obrigatória</p>
          <div className="space-y-3">
            <Field label="Próxima ação">
              <Input value={proximaAcao} onChange={(e) => setProximaAcao(e.target.value)} maxLength={160} required />
            </Field>
            <Field label="Detalhes da tarefa">
              <Textarea rows={2} value={descricaoTarefa} onChange={(e) => setDescricaoTarefa(e.target.value)} maxLength={2000} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data e hora da tarefa">
                <Input type="datetime-local" value={prazoTarefa} onChange={(e) => setPrazoTarefa(e.target.value)} required />
              </Field>
              <Field label="Responsável pela próxima ação">
                <Input value={usuario?.nome ?? ''} readOnly />
              </Field>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
