import { useRef, useState } from 'react';
import { Alerta, Button, Card, Field, Select } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { ApiError, api } from '../lib/api';
import { LABEL_TIPO_TI, TIPOS_TI, type Protocolo, type TicketTipoTi } from '../lib/types';
import { ProtocoloPage } from './protocolo/ProtocoloPage';

const VAZIO = { tipo: 'ERRO' as TicketTipoTi, titulo: '', descricao: '' };

/**
 * Abertura de chamado de TI — qualquer perfil pode abrir (ver nav.ts).
 *
 * So cria o chamado e confirma: o acompanhamento e a resposta ficam no quadro
 * de Chamados de TI abaixo. Duas chamadas HTTP quando ha print (criar,
 * depois anexar) porque `POST /protocolos/:id/anexos` exige o id do
 * chamado ja criado — nao da para mandar tudo de uma vez.
 */
export function ChamadoTiPage() {
  const mostrarToast = useToast();
  const [form, setForm] = useState(VAZIO);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const { protocolo } = await api.post<{ protocolo: Protocolo }>('/protocolos', {
        titulo: form.titulo,
        descricao: form.descricao,
        categoria: 'TI_INTERNO',
        tipoTi: form.tipo,
      });

      // O chamado ja existe a partir daqui — um reenvio por causa de falha no
      // anexo criaria um segundo chamado duplicado. Por isso o formulario
      // limpa e o sucesso e confirmado mesmo que so o anexo falhe; a falha do
      // anexo vira um aviso a parte, nao um erro que convida a tentar de novo.
      setForm(VAZIO);
      setArquivo(null);
      if (inputArquivoRef.current) inputArquivoRef.current.value = '';

      if (arquivo) {
        try {
          await api.upload(`/protocolos/${protocolo.id}/anexos`, arquivo);
        } catch (erroAnexo) {
          mostrarToast(
            'erro',
            `Chamado #${protocolo.numero} aberto, mas a captura de tela não foi anexada: ${
              erroAnexo instanceof ApiError ? erroAnexo.message : 'falha ao enviar o arquivo'
            }`,
          );
          return;
        }
      }
      mostrarToast('sucesso', 'Chamado aberto! Você receberá uma resposta em até 72 horas.');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir o chamado');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-5">
      <Alerta tipo="aviso">
        Use esta tela para relatar um erro do sistema ou sugerir uma melhoria. Selecione <strong>Erro/bug</strong>{' '}
        quando algo não funcionar como deveria. Descreva o que você fez antes do problema e o que esperava ver.
        Selecione <strong>Melhoria</strong> para compartilhar uma ideia que facilitaria o trabalho. Uma captura de
        tela ajuda bastante, mas não é obrigatória. Você receberá uma resposta em até 72 horas.
      </Alerta>

      {erro && <Alerta>{erro}</Alerta>}

      <Card titulo="Novo chamado de TI">
        <form onSubmit={enviar} className="space-y-4">
          <Field label="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TicketTipoTi })}>
              {TIPOS_TI.map((t) => (
                <option key={t} value={t}>{LABEL_TIPO_TI[t]}</option>
              ))}
            </Select>
          </Field>

          <Field label="Título">
            <input
              required
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Resumo curto do problema ou da ideia"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
            />
          </Field>

          <Field label="Descrição" hint="Quanto mais detalhes, mais rápido o time de TI entenderá o que aconteceu">
            <textarea
              required
              rows={5}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
            />
          </Field>

          <Field label="Captura de tela (opcional)">
            <input
              ref={inputArquivoRef}
              type="file"
              accept="image/*"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>

          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Enviando...' : 'Enviar chamado'}
          </Button>
        </form>
      </Card>

      <section className="space-y-3" aria-labelledby="chamados-ti-kanban">
        <h2 id="chamados-ti-kanban" className="text-sm font-semibold text-slate-700">Acompanhamento dos chamados de TI</h2>
        <ProtocoloPage somenteTi />
      </section>
    </div>
  );
}
