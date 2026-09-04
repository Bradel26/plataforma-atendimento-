import { useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  CICLOS_DE_VIDA,
  LABEL_CICLO_DE_VIDA,
  type Canal,
  type CicloDeVida,
  type PapelNaConta,
} from '../../lib/types';

/**
 * Publico de campanha pelos filtros do CRM (item E.3).
 *
 * A tela tinha um botao so — "adicionar todos os contatos" —, que e a unica
 * opcao que ninguem quer: ou dispara para a base inteira, ou nao dispara.
 *
 * Tres regras governam esta tela, e as tres existem para o numero do publico nao
 * mentir:
 *
 * 1. **Previa antes de gravar.** O botao que grava so aparece depois de a previa
 *    voltar. Ninguem ativa campanha para um publico que nunca viu.
 * 2. **O total e quem RECEBE**, e nao quem casou com o filtro. Quem falta
 *    telefone e quem foi anonimizado aparecem em linhas proprias, com o motivo.
 * 3. **Sem filtro nao monta.** A API recusa, e a tela nem oferece o botao: um
 *    clique acidental com tudo desligado selecionaria a base inteira, e mensagem
 *    enviada nao volta atras.
 */

const ORIGENS: Canal[] = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ'];

const PAPEIS: PapelNaConta[] = [
  'SOCIO',
  'ADMINISTRADOR',
  'DECISOR',
  'TECNICO',
  'FINANCEIRO',
  'COMPRAS',
  'OUTRO',
];

type Previa = {
  canal: Canal;
  descricao: string;
  campoExigido: 'telefone' | 'email' | null;
  total: number;
  totalFiltrado: number;
  semEndereco: number;
  anonimizados: number;
  amostra: Array<{ id: string; nome: string }>;
  amostraSemEndereco: Array<{ id: string; nome: string }>;
};

type Filtro = {
  ciclo: CicloDeVida[];
  origem: Canal[];
  papel: PapelNaConta[];
  tags: string[];
};

const VAZIO: Filtro = { ciclo: [], origem: [], papel: [], tags: [] };

/** Alterna um valor numa lista de filtro: clicar de novo desliga. */
const alternar = <T,>(lista: T[], valor: T) =>
  lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];

export function MontarPublico({
  campanhaId,
  canal,
  aoAplicar,
}: {
  campanhaId: string;
  canal: Canal;
  aoAplicar: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>(VAZIO);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const temFiltro =
    filtro.ciclo.length > 0 || filtro.origem.length > 0 || filtro.papel.length > 0 || filtro.tags.length > 0;

  /** Qualquer mudanca invalida a previa: numero velho ao lado de filtro novo mente. */
  const mudar = (novo: Filtro) => {
    setFiltro(novo);
    setPrevia(null);
    setAviso(null);
  };

  const verPrevia = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.post<{ publico: Previa }>('/campanhas/publico/previa', { ...filtro, canal });
      setPrevia(r.publico);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao calcular o publico');
    } finally {
      setOcupado(false);
    }
  };

  const aplicar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.post<{
        resultado: { adicionados: number; jaEstavam: number; semEndereco: number };
      }>(`/campanhas/${campanhaId}/publico`, filtro);
      const { adicionados, jaEstavam } = r.resultado;
      setAviso(
        `${adicionados} contato(s) adicionado(s)` +
          (jaEstavam > 0 ? ` · ${jaEstavam} ja estavam na campanha` : ''),
      );
      setPrevia(null);
      aoAplicar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao gravar o publico');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card
      titulo="Montar publico"
      descricao="Os mesmos filtros da tela de contatos. A previa nao grava nada."
    >
      {erro && <Alerta>{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-slate-500">Ciclo de vida</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {CICLOS_DE_VIDA.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={filtro.ciclo.includes(c)}
                onClick={() => mudar({ ...filtro, ciclo: alternar(filtro.ciclo, c) })}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  filtro.ciclo.includes(c)
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {LABEL_CICLO_DE_VIDA[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Origem" hint="De onde o contato veio">
            <Select
              value=""
              onChange={(e) =>
                e.target.value && mudar({ ...filtro, origem: alternar(filtro.origem, e.target.value as Canal) })
              }
            >
              <option value="">Adicionar origem...</option>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <Field label="Papel na conta" hint="O &ldquo;cargo&rdquo;: quem decide, quem compra">
            <Select
              value=""
              onChange={(e) =>
                e.target.value &&
                mudar({ ...filtro, papel: alternar(filtro.papel, e.target.value as PapelNaConta) })
              }
            >
              <option value="">Adicionar papel...</option>
              {PAPEIS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </div>

        {(filtro.origem.length > 0 || filtro.papel.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {filtro.origem.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => mudar({ ...filtro, origem: alternar(filtro.origem, o) })}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
              >
                origem: {o} &times;
              </button>
            ))}
            {filtro.papel.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => mudar({ ...filtro, papel: alternar(filtro.papel, p) })}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
              >
                papel: {p} &times;
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variante="neutro" onClick={() => void verPrevia()} disabled={ocupado || !temFiltro}>
            {ocupado ? 'Calculando...' : 'Ver publico'}
          </Button>
          {!temFiltro && (
            // O motivo aparece antes do clique. Botao que responde 400 depois de
            // clicado ensina a nao clicar.
            <span className="text-xs text-slate-500">
              Escolha ao menos um filtro &mdash; sem filtro o publico seria a base inteira.
            </span>
          )}
        </div>
      </div>

      {previa && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-800">{previa.total}</span>
            <span className="text-sm text-slate-600">
              contato(s) que {previa.campoExigido === null ? 'poderiam receber' : 'vao receber'}
            </span>
            <Badge tom="neutro">{previa.descricao}</Badge>
          </div>

          {/* As tres contas separadas. Somar as duas de baixo no total seria
              prometer alcance que a campanha nao tem. */}
          <ul className="space-y-0.5 text-xs text-slate-600">
            <li>{previa.totalFiltrado} casaram com o filtro</li>
            {previa.semEndereco > 0 && (
              <li>
                {previa.semEndereco} sem {previa.campoExigido ?? 'canal de contato'} &mdash;{' '}
                {previa.campoExigido === null
                  ? 'este canal exige que o cliente escreva primeiro'
                  : 'ficam de fora, e o cadastro pode ser completado'}
                {previa.amostraSemEndereco.length > 0 && (
                  <span className="text-slate-400">
                    {' '}
                    ({previa.amostraSemEndereco.map((c) => c.nome).join(', ')}
                    {previa.semEndereco > previa.amostraSemEndereco.length ? ', ...' : ''})
                  </span>
                )}
              </li>
            )}
            {previa.anonimizados > 0 && (
              <li>{previa.anonimizados} anonimizado(s) por pedido de LGPD &mdash; nunca entram</li>
            )}
          </ul>

          {previa.amostra.length > 0 && (
            <p className="text-xs text-slate-500">
              Amostra: {previa.amostra.map((c) => c.nome).join(', ')}
              {previa.total > previa.amostra.length && ', ...'}
            </p>
          )}

          <Button onClick={() => void aplicar()} disabled={ocupado || previa.total === 0}>
            {ocupado ? 'Gravando...' : `Adicionar ${previa.total} a campanha`}
          </Button>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Nao ha filtro por regiao: a plataforma nao guarda endereco de contato. Um filtro que devolve
        zero sempre seria pior que a falta dele.
      </p>
    </Card>
  );
}
