import { useEffect, useState } from 'react';
import { Alerta, Button, Card, Field, Input } from '../../components/ui';
import { useBranding } from '../../features/branding/BrandingProvider';
import { FUNDOS_CHAT, fundoChatValido } from '../../features/branding/fundosChat';
import { ApiError } from '../../lib/api';

const CAMPOS_COR = [
  { chave: 'corPrimaria', label: 'Cor primária', hint: 'Botões e item ativo do menu' },
  { chave: 'corSecundaria', label: 'Cor secundária', hint: 'Fundo do menu lateral' },
  { chave: 'corDestaque', label: 'Cor de destaque', hint: 'Indicadores positivos' },
] as const;

/** Edicao do tema White Label — as cores sao aplicadas na hora via CSS variables. */
export function WhiteLabelTab() {
  const { branding, salvar } = useBranding();
  const [form, setForm] = useState(branding);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => setForm(branding), [branding]);

  const fundoSelecionado = fundoChatValido(form.fundoChat);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOk(false);
    setEnviando(true);
    try {
      await salvar({
        appName: form.appName,
        logoUrl: form.logoUrl?.trim() ? form.logoUrl.trim() : null,
        corPrimaria: form.corPrimaria,
        corSecundaria: form.corSecundaria,
        corDestaque: form.corDestaque,
        fundoChat: fundoSelecionado,
      });
      setOk(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao salvar tema');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card titulo="White Label" descricao="Identidade visual da instância">
        <form onSubmit={submeter} className="space-y-4">
          {erro && <Alerta>{erro}</Alerta>}
          {ok && <Alerta tipo="sucesso">Tema atualizado.</Alerta>}

          <Field label="Nome da aplicação">
            <Input required value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })} />
          </Field>

          <Field label="URL do logo" hint="Opcional - deixe vazio para usar a inicial do nome">
            <Input
              type="url"
              value={form.logoUrl ?? ''}
              placeholder="https://..."
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            {CAMPOS_COR.map(({ chave, label, hint }) => (
              <Field key={chave} label={label} hint={hint}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form[chave]}
                    onChange={(e) => setForm({ ...form, [chave]: e.target.value })}
                    className="h-9 w-10 cursor-pointer rounded border border-slate-300"
                  />
                  <Input value={form[chave]} onChange={(e) => setForm({ ...form, [chave]: e.target.value })} />
                </div>
              </Field>
            ))}
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Fundo das conversas</legend>
            <p className="mb-3 mt-0.5 text-xs text-slate-500">
              Aparece nas telas de conversa (Atendimento e Auditoria) para todos os usuários da instância.
            </p>
            <div role="radiogroup" aria-label="Fundo das conversas" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FUNDOS_CHAT.map((fundo) => {
                const selecionado = fundoSelecionado === fundo.id;
                return (
                  <button
                    key={fundo.id}
                    type="button"
                    role="radio"
                    aria-checked={selecionado}
                    onClick={() => setForm({ ...form, fundoChat: fundo.id })}
                    className={`group overflow-hidden rounded-xl border bg-white text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)] ${
                      selecionado
                        ? 'border-[var(--brand-primary)] ring-2 ring-[color-mix(in_srgb,var(--brand-primary)_30%,transparent)]'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className={`fundo-chat--${fundo.id} flex h-24 flex-col justify-center gap-1.5 p-2.5`} aria-hidden="true">
                      <span className="w-3/5 rounded-lg rounded-bl-sm bg-white px-2 py-1 text-[10px] text-slate-700 shadow-sm">Boa tarde!</span>
                      <span className="ml-auto w-3/5 rounded-lg rounded-br-sm bg-[var(--bolha-enviada)] px-2 py-1 text-[10px] text-slate-800 shadow-sm">Bom dia!</span>
                    </span>
                    <span className="block border-t border-slate-100 px-2.5 py-2">
                      <span className="flex items-center justify-between gap-1 text-[13px] font-semibold text-slate-800">
                        {fundo.nome}
                        {selecionado && <span className="text-[11px] font-semibold text-[var(--brand-primary)]">Selecionado</span>}
                      </span>
                      <span className="block text-[11px] text-slate-500">{fundo.descricao}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Button type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar tema'}
          </Button>
        </form>
      </Card>

      <Card titulo="Prévia">
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="flex">
            <div className="w-16 space-y-1.5 p-2" style={{ backgroundColor: form.corSecundaria }}>
              <div className="h-4 rounded" style={{ backgroundColor: form.corPrimaria }} />
              <div className="h-4 rounded bg-white/10" />
              <div className="h-4 rounded bg-white/10" />
            </div>
            <div className="flex-1 space-y-2 bg-slate-50 p-3">
              <div className="h-3 w-2/3 rounded bg-slate-200" />
              <div className="h-8 w-24 rounded" style={{ backgroundColor: form.corPrimaria }} />
              <div className="h-2 w-1/2 rounded" style={{ backgroundColor: form.corDestaque }} />
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          As cores são salvas no banco e aplicadas para todos os usuários da instância.
        </p>
      </Card>
    </div>
  );
}
