import { useEffect, useId, useState } from 'react';
import { Field, Input } from '../../components/ui';
import { api } from '../../lib/api';

type Sugestao = { id: string; nome: string; cnpj: string | null };

const formatarCnpj = (digitos: string) =>
  digitos
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');

export type EmpresaEscolhida = {
  nome: string;
  cnpj: string;
  /** Empresa que ja existe em Empresas; nulo = sera criada junto com o contato. */
  contaId: string | null;
};

type Props = {
  value: EmpresaEscolhida;
  onChange: (empresa: EmpresaEscolhida) => void;
};

/**
 * Empresa do contato, no cadastro. Digitar mostra as empresas ja cadastradas
 * (escolher vincula a existente); se nenhuma for escolhida, a empresa digitada
 * e criada na aba Empresas junto com o contato. Assim o cliente nasce ja
 * vinculado, sem passar pela aba Empresas depois.
 */
export function EmpresaInput({ value, onChange }: Props) {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const idLista = useId();

  const termo = value.nome.trim();

  // Busca com espera: uma requisicao por tecla travaria a digitacao.
  useEffect(() => {
    if (termo.length < 2 || value.contaId) {
      setSugestoes([]);
      return;
    }
    let cancelado = false;
    const t = setTimeout(() => {
      void api
        .get<{ contas: Sugestao[] }>(`/contas?busca=${encodeURIComponent(termo)}&limite=6`)
        .then((r) => {
          if (!cancelado) setSugestoes(r.contas);
        })
        .catch(() => {
          if (!cancelado) setSugestoes([]);
        });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo, value.contaId]);

  const escolher = (s: Sugestao) => {
    onChange({ nome: s.nome, cnpj: s.cnpj ?? '', contaId: s.id });
    setAberto(false);
  };

  const mostrar = aberto && sugestoes.length > 0;
  const nova = termo.length >= 2 && !value.contaId;
  const igual = sugestoes.some((s) => s.nome.toLocaleLowerCase('pt-BR') === termo.toLocaleLowerCase('pt-BR'));

  return (
    <div className="space-y-3">
      <Field
        label="Empresa"
        hint={
          value.contaId
            ? 'Vinculada a uma empresa ja cadastrada.'
            : nova
              ? igual
                ? 'Escolha a empresa na lista para vincular a ja cadastrada.'
                : 'Empresa nova: sera criada na aba Empresas junto com o contato.'
              : 'Opcional. Digite para vincular ou criar a empresa do cliente.'
        }
      >
        <div className="relative">
          <Input
            value={value.nome}
            maxLength={160}
            autoComplete="off"
            role="combobox"
            aria-expanded={mostrar}
            aria-controls={idLista}
            aria-autocomplete="list"
            onChange={(e) => {
              // Digitar de novo solta o vinculo: o texto passa a ser outra empresa.
              onChange({ nome: e.target.value, cnpj: value.contaId ? '' : value.cnpj, contaId: null });
              setAtivo(0);
              setAberto(true);
            }}
            onFocus={() => setAberto(true)}
            onBlur={() => setAberto(false)}
            onKeyDown={(e) => {
              if (!mostrar) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAtivo((i) => (i + 1) % sugestoes.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAtivo((i) => (i - 1 + sugestoes.length) % sugestoes.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                escolher(sugestoes[ativo] ?? sugestoes[0]!);
              } else if (e.key === 'Escape') {
                setAberto(false);
              }
            }}
          />
          {mostrar && (
            <ul
              id={idLista}
              role="listbox"
              className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              {sugestoes.map((s, i) => (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={i === ativo}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    escolher(s);
                  }}
                  onMouseEnter={() => setAtivo(i)}
                  className={`cursor-pointer px-3 py-1.5 text-sm text-slate-700 ${i === ativo ? 'bg-slate-100' : ''}`}
                >
                  {s.nome}
                  {s.cnpj && <span className="ml-2 text-xs text-slate-500">{formatarCnpj(s.cnpj)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>

      {nova && (
        <Field label="CNPJ da empresa" hint="Opcional. Evita empresa duplicada e permite consultar os dados da Receita.">
          <Input
            value={formatarCnpj(value.cnpj)}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            maxLength={18}
            onChange={(e) => onChange({ ...value, cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) })}
          />
        </Field>
      )}
    </div>
  );
}
