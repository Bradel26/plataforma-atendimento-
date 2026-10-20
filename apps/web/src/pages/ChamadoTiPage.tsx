import { useRef, useState } from 'react';
import { Alerta, Button, Field } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { ApiError, api } from '../lib/api';
import { LABEL_TIPO_TI, TIPOS_TI, type Protocolo, type TicketTipoTi } from '../lib/types';
import { ProtocoloPage } from './protocolo/ProtocoloPage';

const VAZIO = { tipo: 'ERRO' as TicketTipoTi, titulo: '', descricao: '' };

const SOBRE_O_TIPO: Record<TicketTipoTi, string> = {
  ERRO: 'Algo não funcionou como deveria',
  MELHORIA: 'Uma ideia que facilitaria o trabalho',
};

function IconeTipo({ tipo }: { tipo: TicketTipoTi }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tipo === 'ERRO' ? (
        <>
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </>
      ) : (
        <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
      )}
    </svg>
  );
}

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
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 sm:px-6" aria-labelledby="novo-chamado-ti">
          <div>
            <h1 id="novo-chamado-ti" className="text-xl font-bold tracking-[-0.01em] text-slate-900">Abrir chamado de TI</h1>
            <p className="mt-1 text-[13px] text-slate-600">Relate um erro do sistema ou sugira uma melhoria</p>
          </div>

          {erro && <Alerta>{erro}</Alerta>}

          <form onSubmit={enviar} className="flex flex-col gap-4">
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-slate-600">O que você quer relatar?</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {TIPOS_TI.map((t) => {
                  const ativo = form.tipo === t;
                  return (
                    <label
                      key={t}
                      className={`relative flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3 transition focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/30 ${
                        ativo
                          ? 'border-2 border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]'
                          : 'border border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tipo-chamado-ti"
                        value={t}
                        checked={ativo}
                        onChange={() => setForm({ ...form, tipo: t })}
                        className="sr-only"
                      />
                      <span
                        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] ${
                          t === 'ERRO' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        <IconeTipo tipo={t} />
                      </span>
                      <span>
                        <span className="block text-sm font-bold text-slate-900">{LABEL_TIPO_TI[t]}</span>
                        <span className="text-[12.5px] text-slate-600">{SOBRE_O_TIPO[t]}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

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
                placeholder={form.tipo === 'ERRO' ? 'O que você fez antes do problema e o que esperava ver' : 'O que você gostaria que a plataforma fizesse'}
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-600">
                  Captura de tela <span className="font-normal text-slate-500">(opcional)</span>
                </span>
                <label className="relative flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-slate-300 bg-slate-50 px-3 text-[13px] text-slate-600 transition focus-within:border-[var(--brand-primary)] hover:border-slate-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <span className="min-w-0 truncate">{arquivo ? arquivo.name : 'Escolher imagem'}</span>
                  <input
                    ref={inputArquivoRef}
                    type="file"
                    accept="image/*"
                    aria-label="Captura de tela (opcional)"
                    onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                </label>
              </div>
              <Button type="submit" disabled={enviando} className="h-[52px] px-6">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m22 2-7 20-4-9-9-4z" />
                  <path d="M22 2 11 13" />
                </svg>
                {enviando ? 'Enviando...' : 'Enviar chamado'}
              </Button>
            </div>
          </form>
        </section>

        <aside className="flex flex-col gap-3.5 rounded-2xl bg-slate-900 px-5 py-5 text-white sm:px-6">
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            Resposta em até 72 horas
          </span>
          <h2 className="text-base font-bold">Como ajudar o TI a resolver rápido</h2>
          <ol className="flex flex-col gap-3 text-[13px] leading-relaxed opacity-90">
            {[
              <>Escolha <strong>Erro/bug</strong> quando algo não funcionar, ou <strong>Melhoria</strong> para uma ideia</>,
              'Diga o que você fez logo antes do problema e o que esperava ver',
              'Se puder, anexe uma captura da tela — ajuda bastante, mas não é obrigatória',
            ].map((texto, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold tabular-nums">
                  {i + 1}
                </span>
                <span>{texto}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="chamados-ti-kanban">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 id="chamados-ti-kanban" className="text-base font-bold text-slate-900">Acompanhamento dos chamados de TI</h2>
          <span className="text-[12.5px] text-slate-500">clique no cartão para ver os detalhes ou arraste para mudar o status</span>
        </div>
        <ProtocoloPage somenteTi />
      </section>
    </div>
  );
}
