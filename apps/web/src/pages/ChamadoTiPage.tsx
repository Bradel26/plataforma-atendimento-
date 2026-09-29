import { useRef, useState } from 'react';
import { Alerta, Button, Card, Field, Select } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { ApiError, api } from '../lib/api';
import { LABEL_TIPO_TI, TIPOS_TI, type Protocolo, type TicketTipoTi } from '../lib/types';

const VAZIO = { tipo: 'ERRO' as TicketTipoTi, titulo: '', descricao: '' };

/**
 * Abertura de chamado de TI — qualquer perfil pode abrir (ver nav.ts).
 *
 * So cria o chamado e confirma: quem gerencia ve e responde pela tela
 * Protocolo, que ja existe. Duas chamadas HTTP quando ha print (criar,
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
      if (arquivo) {
        await api.upload(`/protocolos/${protocolo.id}/anexos`, arquivo);
      }
      setForm(VAZIO);
      setArquivo(null);
      if (inputArquivoRef.current) inputArquivoRef.current.value = '';
      mostrarToast('sucesso', 'Chamado aberto! Voce recebe uma resposta em ate 72h.');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir o chamado');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-5">
      <Alerta tipo="aviso">
        Use esta tela para relatar um erro do sistema ou sugerir uma melhoria. Escolha <strong>Erro/bug</strong>{' '}
        quando algo nao funciona como deveria — descreva o que voce fez antes de acontecer, e o que esperava ver
        em vez disso. Escolha <strong>Melhoria</strong> para uma ideia que facilitaria o trabalho. Um print da
        tela ajuda bastante, mas nao e obrigatorio. Voce recebe uma resposta em ate 72h.
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

          <Field label="Titulo">
            <input
              required
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Resumo curto do problema ou da ideia"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
            />
          </Field>

          <Field label="Descricao" hint="Quanto mais detalhe, mais rapido o time de TI entende o que aconteceu">
            <textarea
              required
              rows={5}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
            />
          </Field>

          <Field label="Print da tela (opcional)">
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
    </div>
  );
}
