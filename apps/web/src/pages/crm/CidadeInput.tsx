import { useEffect, useId, useMemo, useState } from 'react';
import { Input } from '../../components/ui';

/** Municipios por UF, buscados uma vez por sessao na API publica do IBGE. */
const cache = new Map<string, Promise<string[]>>();

function municipiosDe(uf: string): Promise<string[]> {
  let promessa = cache.get(uf);
  if (!promessa) {
    promessa = fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      .then((r) => {
        if (!r.ok) throw new Error(`IBGE ${r.status}`);
        return r.json() as Promise<Array<{ nome: string }>>;
      })
      .then((lista) => lista.map((m) => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')));
    // Falha nao fica em cache: a proxima tentativa busca de novo.
    promessa.catch(() => cache.delete(uf));
    cache.set(uf, promessa);
  }
  return promessa;
}

/** Sem acento e minusculo: "goia" tem que achar "Goiânia". */
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

type Props = {
  uf: string;
  value: string;
  onChange: (cidade: string) => void;
  required?: boolean;
};

/**
 * Campo de cidade com sugestao: escolhida a UF, digitar "goia" mostra "Goiânia"
 * logo abaixo. Se o IBGE estiver fora do ar, vira um campo de texto comum — o
 * cadastro nunca depende de um servico externo.
 */
export function CidadeInput({ uf, value, onChange, required }: Props) {
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const idLista = useId();

  useEffect(() => {
    setMunicipios([]);
    if (!uf) return;
    let cancelado = false;
    municipiosDe(uf)
      .then((lista) => {
        if (!cancelado) setMunicipios(lista);
      })
      .catch(() => {
        /* segue como texto livre */
      });
    return () => {
      cancelado = true;
    };
  }, [uf]);

  const sugestoes = useMemo(() => {
    const termo = normalizar(value.trim());
    if (!termo) return [];
    const comeca: string[] = [];
    const contem: string[] = [];
    for (const nome of municipios) {
      const n = normalizar(nome);
      if (n === termo) return []; // ja digitou a cidade inteira
      if (n.startsWith(termo)) comeca.push(nome);
      else if (n.includes(termo)) contem.push(nome);
    }
    return [...comeca, ...contem].slice(0, 6);
  }, [value, municipios]);

  const escolher = (nome: string) => {
    onChange(nome);
    setAberto(false);
  };

  const mostrar = aberto && sugestoes.length > 0;

  return (
    <div className="relative">
      <Input
        required={required}
        value={value}
        disabled={!uf}
        placeholder={uf ? 'Digite a cidade' : 'Escolha a UF'}
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={idLista}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
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
          {sugestoes.map((nome, i) => (
            <li
              key={nome}
              role="option"
              aria-selected={i === ativo}
              // mouseDown, nao click: o blur do campo fecharia a lista antes do click chegar.
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(nome);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm text-slate-700 ${i === ativo ? 'bg-slate-100' : ''}`}
            >
              {nome}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
