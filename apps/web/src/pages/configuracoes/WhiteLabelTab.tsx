import { useEffect, useState } from 'react';
import { Alerta, Button, Card, Field, Input } from '../../components/ui';
import { useBranding } from '../../features/branding/BrandingProvider';
import { ApiError } from '../../lib/api';

const CAMPOS_COR = [
  { chave: 'corPrimaria', label: 'Cor primaria', hint: 'Botoes e item ativo do menu' },
  { chave: 'corSecundaria', label: 'Cor secundaria', hint: 'Fundo do menu lateral' },
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
      <Card titulo="White Label" descricao="Identidade visual da instancia">
        <form onSubmit={submeter} className="space-y-4">
          {erro && <Alerta>{erro}</Alerta>}
          {ok && <Alerta tipo="sucesso">Tema atualizado.</Alerta>}

          <Field label="Nome da aplicacao">
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

          <Button type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar tema'}
          </Button>
        </form>
      </Card>

      <Card titulo="Previa">
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
          As cores sao salvas no banco e aplicadas para todos os usuarios da instancia.
        </p>
      </Card>
    </div>
  );
}
