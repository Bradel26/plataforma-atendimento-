import { Field, Input, Select } from '../../components/ui';
import type { TipoCampoCustomizado } from '../../lib/types';

/**
 * O minimo que o componente precisa de um campo — `CampoCustomizadoDef` (nova
 * criacao, sem valor ainda) e `ValorCampoCustomizado` (ficha, com valor)
 * satisfazem os dois de graca por estrutura.
 */
type CampoParaExibir = {
  id: string;
  nome: string;
  chave: string;
  tipo: TipoCampoCustomizado;
  opcoes: string[];
  obrigatorio: boolean;
  secao: string | null;
  ativo: boolean;
};

type Props = {
  campos: CampoParaExibir[];
  /** `{chave: valor}` — so as chaves com valor gravado/preenchido precisam aparecer. */
  valores: Record<string, unknown>;
  /** `valor` nulo apaga/limpa o campo. */
  aoMudar: (chave: string, valor: string | number | boolean | null) => void;
};

/**
 * Campos customizados (item 6.4): so os ATIVOS aparecem — um campo
 * desativado preserva o historico no banco, mas para de se oferecer em
 * formulario novo. Agrupados por `secao` quando ela muda de um campo para o
 * seguinte (a API ja devolve na ordem certa).
 */
export function CamposCustomizadosCampos({ campos, valores, aoMudar }: Props) {
  const ativos = campos.filter((c) => c.ativo);
  if (ativos.length === 0) return null;

  let secaoAnterior: string | null = null;

  return (
    <div className="space-y-3">
      {ativos.map((campo) => {
        const mudaSecao = campo.secao !== secaoAnterior;
        secaoAnterior = campo.secao;
        const valor = valores[campo.chave];

        return (
          <div key={campo.id}>
            {mudaSecao && campo.secao && (
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{campo.secao}</p>
            )}
            <Field label={campo.obrigatorio ? `${campo.nome} *` : campo.nome}>
              {campo.tipo === 'BOOLEANO' ? (
                <Select
                  aria-label={campo.nome}
                  value={valor === true ? 'true' : valor === false ? 'false' : ''}
                  onChange={(e) => aoMudar(campo.chave, e.target.value === '' ? null : e.target.value === 'true')}
                >
                  <option value="">—</option>
                  <option value="true">Sim</option>
                  <option value="false">Nao</option>
                </Select>
              ) : campo.tipo === 'SELECAO' ? (
                <Select
                  aria-label={campo.nome}
                  value={typeof valor === 'string' ? valor : ''}
                  onChange={(e) => aoMudar(campo.chave, e.target.value === '' ? null : e.target.value)}
                >
                  <option value="">Selecione</option>
                  {campo.opcoes.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              ) : campo.tipo === 'DATA' ? (
                <Input
                  // Nao-controlado, com a chave presa ao valor: a caixa so "pula" para
                  // o valor do servidor quando ELE muda (apos salvar ou trocar de
                  // registro) — nao a cada digitacao, que e o que um `value`
                  // controlado atualizado so no blur faria (cursor voltando ao fim a
                  // cada tecla).
                  key={`${campo.id}:${String(valor ?? '')}`}
                  aria-label={campo.nome}
                  type="date"
                  defaultValue={typeof valor === 'string' ? valor.slice(0, 10) : ''}
                  onBlur={(e) => aoMudar(campo.chave, e.target.value === '' ? null : e.target.value)}
                />
              ) : (
                <Input
                  key={`${campo.id}:${String(valor ?? '')}`}
                  aria-label={campo.nome}
                  type={campo.tipo === 'NUMERO' ? 'number' : 'text'}
                  defaultValue={valor === null || valor === undefined ? '' : String(valor)}
                  onBlur={(e) => {
                    const bruto = e.target.value;
                    if (bruto === '') {
                      aoMudar(campo.chave, null);
                      return;
                    }
                    aoMudar(campo.chave, campo.tipo === 'NUMERO' ? Number(bruto) : bruto);
                  }}
                />
              )}
            </Field>
          </div>
        );
      })}
    </div>
  );
}
