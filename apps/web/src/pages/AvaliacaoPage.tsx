import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useBranding } from '../features/branding/BrandingProvider';

type Pesquisa = {
  tipo: 'CSAT' | 'NPS';
  faixa: { min: number; max: number };
  respondida: boolean;
  nota: number | null;
  comentario: string | null;
  cliente: string;
  atendente: string | null;
  canal: string;
};

/**
 * Pagina publica de avaliacao pos-atendimento. O cliente chega por link com
 * token — nao tem conta na plataforma, entao nada aqui usa o cliente HTTP
 * autenticado.
 */
export function AvaliacaoPage() {
  const { token = '' } = useParams();
  const { branding } = useBranding();
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch(`/api/avaliacao/${token}`)
      .then(async (res) => {
        const dados = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(dados?.error?.message ?? 'Pesquisa nao encontrada');
        setPesquisa(dados.pesquisa);
        if (dados.pesquisa.respondida) setEnviado(true);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar'));
  }, [token]);

  const enviar = async () => {
    if (nota === null) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/avaliacao/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota, ...(comentario.trim() ? { comentario: comentario.trim() } : {}) }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dados?.error?.message ?? 'Falha ao enviar');
      setEnviado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar');
    } finally {
      setEnviando(false);
    }
  };

  const notas = pesquisa
    ? Array.from({ length: pesquisa.faixa.max - pesquisa.faixa.min + 1 }, (_, i) => pesquisa.faixa.min + i)
    : [];

  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
          {branding.appName}
        </p>

        {erro && !pesquisa ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
        ) : enviado ? (
          <div className="mt-4">
            <h1 className="text-xl font-semibold text-slate-900">Obrigado pela sua avaliacao!</h1>
            <p className="mt-2 text-sm text-slate-600">
              Sua resposta foi registrada e ajuda a melhorar nosso atendimento.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">Como foi seu atendimento?</h1>
            <p className="mt-1 text-sm text-slate-600">
              {pesquisa?.atendente
                ? `Voce foi atendido por ${pesquisa.atendente}.`
                : 'Conte como foi sua experiencia.'}{' '}
              {pesquisa?.tipo === 'NPS'
                ? 'De 0 a 10, quanto recomendaria nosso atendimento?'
                : 'De 1 a 5, qual sua satisfacao?'}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {notas.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNota(n)}
                  className={`h-11 w-11 rounded-lg border text-sm font-semibold transition ${
                    nota === n ? 'border-transparent text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                  style={nota === n ? { backgroundColor: 'var(--brand-primary)' } : undefined}
                >
                  {n}
                </button>
              ))}
            </div>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Quer contar mais? (opcional)
              </span>
              <textarea
                rows={3}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
              />
            </label>

            {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

            <button
              type="button"
              onClick={() => void enviar()}
              disabled={nota === null || enviando}
              className="mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {enviando ? 'Enviando...' : 'Enviar avaliacao'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
