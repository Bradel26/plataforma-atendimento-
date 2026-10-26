import { useEffect, useMemo, useState } from 'react';
import { Alerta, Badge, Button, Select } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import type { EstruturaEsteira, Operacao, ResultadoImportacao } from '../../lib/esteiraTypes';
import { ROTULO_OPERACAO, cabecalhosIgnorados, colunasImportaveis, linhasComProblema, textoDoResumo } from './cadastroEsteira';
import { parametroDaOperacao } from './estadoEsteira';

/** Limites da rota (`planilhas.service.ts`/`leituraPlanilha.ts`). */
const LIMITE_LINHAS = 2_000;
const LIMITE_MB = 5;
/** Quantas linhas com problema a tela lista (o resumo traz o total). */
const MAX_PROBLEMAS_VISIVEIS = 200;

type Mapa = Record<string, string | null>;

/**
 * Importação por planilha (spec 6.4), por operação: upload → prévia com o mapa
 * de colunas editável e os problemas por linha → confirmar → resumo. A prévia
 * roda a importação inteira sem gravar; a confirmação reenvia o arquivo com o
 * mapa escolhido. Só ADMIN/SUPERVISOR com EDICAO (a casca esconde o botão; a
 * API confere de novo).
 */
export function ImportarPlanilha({
  aberto,
  operacao,
  estrutura,
  aoFechar,
  aoImportar,
}: {
  aberto: boolean;
  operacao: Operacao;
  estrutura: EstruturaEsteira;
  aoFechar: () => void;
  /** Depois de gravar (a visão recarrega). */
  aoImportar: () => void;
}) {
  const mostrar = useToast();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [mapa, setMapa] = useState<Mapa | null>(null);
  /** Mapa da última prévia: mexer no mapa pede outra prévia antes de confirmar. */
  const [mapaDaPrevia, setMapaDaPrevia] = useState<Mapa | null>(null);
  const [previa, setPrevia] = useState<ResultadoImportacao | null>(null);
  const [final, setFinal] = useState<ResultadoImportacao | null>(null);
  const [enviando, setEnviando] = useState<'previa' | 'gravar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setArquivo(null);
    setMapa(null);
    setMapaDaPrevia(null);
    setPrevia(null);
    setFinal(null);
    setErro(null);
  }, [aberto]);

  const destinos = useMemo(() => colunasImportaveis(estrutura.colunas), [estrutura.colunas]);
  const rotuloDe = useMemo(() => new Map(estrutura.colunas.map((c) => [c.chave, c.rotulo])), [estrutura.colunas]);
  const mapaMudou = mapa !== null && JSON.stringify(mapa) !== JSON.stringify(mapaDaPrevia);
  const base = `/esteiras/${parametroDaOperacao(operacao)}`;

  const escolher = (f: File | null) => {
    setArquivo(f);
    setMapa(null);
    setMapaDaPrevia(null);
    setPrevia(null);
    setFinal(null);
    setErro(null);
    if (f && f.size > LIMITE_MB * 1024 * 1024) {
      setErro(`Arquivo acima do limite de ${LIMITE_MB} MB; divida em arquivos menores.`);
    }
  };

  const enviar = async (gravar: boolean) => {
    if (!arquivo) return;
    setEnviando(gravar ? 'gravar' : 'previa');
    setErro(null);
    try {
      const r = await api.upload<ResultadoImportacao>(`${base}/importar`, arquivo, 'arquivo', {
        previa: gravar ? 'false' : 'true',
        ...(mapa ? { mapa: JSON.stringify(mapa) } : {}),
      });
      if (gravar) {
        setFinal(r);
        mostrar(r.erros.length ? 'info' : 'sucesso', textoDoResumo(r, false));
        aoImportar();
      } else {
        setPrevia(r);
        setMapa(r.mapa);
        setMapaDaPrevia(r.mapa);
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível ler a planilha');
    } finally {
      setEnviando(null);
    }
  };

  const resultado = final ?? previa;
  const problemas = resultado ? linhasComProblema(resultado) : [];
  const ignorados = mapa ? cabecalhosIgnorados(mapa) : [];
  const grandeDemais = !!arquivo && arquivo.size > LIMITE_MB * 1024 * 1024;

  return (
    <Modal
      aberto={aberto}
      titulo={`Importar planilha · ${ROTULO_OPERACAO[operacao]}`}
      aoFechar={aoFechar}
      largura="max-w-4xl"
      rodape={
        final ? (
          <Button onClick={aoFechar}>Fechar</Button>
        ) : (
          <>
            <Button variante="neutro" onClick={aoFechar}>
              Cancelar
            </Button>
            {(!previa || mapaMudou) && (
              <Button disabled={!arquivo || grandeDemais || enviando !== null} onClick={() => void enviar(false)}>
                {enviando === 'previa' ? 'Lendo…' : previa ? 'Atualizar prévia' : 'Gerar prévia'}
              </Button>
            )}
            {previa && !mapaMudou && (
              <Button disabled={enviando !== null || previa.validas === 0} onClick={() => void enviar(true)}>
                {enviando === 'gravar' ? 'Importando…' : `Importar ${previa.validas} ${previa.validas === 1 ? 'linha' : 'linhas'}`}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        {!final && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
            <p className="font-medium text-slate-700">Como funciona</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>
                Arquivo <strong>.csv</strong> ou <strong>.xlsx</strong>, com cabeçalho na primeira linha; até{' '}
                {LIMITE_LINHAS.toLocaleString('pt-BR')} linhas e {LIMITE_MB} MB. Maior que isso: divida em arquivos menores.
              </li>
              <li>
                Reimportar <strong>atualiza</strong>, não duplica: o parceiro é achado pelo CNPJ (ou CPF/telefone, sem CNPJ).
              </li>
              <li>
                Célula <strong>vazia</strong> mantém o valor atual; use <strong>-</strong> (hífen) para limpar o campo.
              </li>
              <li>Colunas que são da outra operação são ignoradas, com aviso na linha.</li>
              {operacao === 'TIM' && (
                <li>Desistência e Descredenciado não entram por planilha: registre a saída pela ficha, com motivo.</li>
              )}
              <li>Nada é gravado até você conferir a prévia e confirmar.</li>
            </ul>
          </div>
        )}

        {!final && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600">Planilha</span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => escolher(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
        )}

        {erro && <Alerta>{erro}</Alerta>}

        {previa && mapa && !final && (
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold text-slate-700">Colunas da planilha</h3>
            <p className="text-slate-500">
              Confira para onde vai cada coluna. “Ignorar” deixa a coluna de fora. Mudou algo? Atualize a prévia antes de importar.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {previa.cabecalhos.map((cabecalho) => (
                <label key={cabecalho} className="flex items-center gap-2">
                  <span className="w-1/2 truncate font-medium text-slate-700" title={cabecalho}>
                    {cabecalho}
                  </span>
                  <Select
                    aria-label={`Destino da coluna ${cabecalho}`}
                    value={mapa[cabecalho] ?? ''}
                    onChange={(e) => setMapa((m) => ({ ...(m ?? {}), [cabecalho]: e.target.value || null }))}
                  >
                    <option value="">Ignorar</option>
                    {destinos.map((c) => (
                      <option key={c.chave} value={c.chave}>
                        {c.rotulo}
                      </option>
                    ))}
                    {/* Destino que não é desta operação (veio do mapa automático/servidor): mantém visível. */}
                    {mapa[cabecalho] && !destinos.some((c) => c.chave === mapa[cabecalho]) && (
                      <option value={mapa[cabecalho]!}>{rotuloDe.get(mapa[cabecalho]!) ?? mapa[cabecalho]} (outra operação)</option>
                    )}
                  </Select>
                </label>
              ))}
            </div>
            {ignorados.length > 0 && <p className="text-xs text-slate-500">Ignoradas: {ignorados.join(', ')}</p>}
          </section>
        )}

        {resultado && (
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold text-slate-700">{final ? 'Resultado' : 'Prévia'}</h3>
            {mapaMudou && !final ? (
              <Alerta tipo="aviso">O mapa de colunas mudou: atualize a prévia para conferir antes de importar.</Alerta>
            ) : (
              <Alerta tipo={resultado.erros.length ? 'aviso' : 'sucesso'}>{textoDoResumo(resultado, !final)}</Alerta>
            )}
            <div className="flex flex-wrap gap-2">
              <Badge tom="sucesso">{resultado.criadas} {final ? 'criadas' : 'a criar'}</Badge>
              <Badge tom="marca">{resultado.atualizadas} {final ? 'atualizadas' : 'a atualizar'}</Badge>
              <Badge tom={resultado.erros.length ? 'erro' : 'neutro'}>{resultado.erros.length} com erro</Badge>
              <Badge tom={resultado.avisos.length ? 'alerta' : 'neutro'}>{resultado.avisos.length} com aviso</Badge>
            </div>
            {problemas.length > 0 && (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Linha</th>
                      <th className="px-3 py-1.5 font-medium">Problema</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {problemas.slice(0, MAX_PROBLEMAS_VISIVEIS).map((p) => (
                      <tr key={p.linha} className="align-top">
                        <td className="px-3 py-1.5 tabular-nums text-slate-600">{p.linha}</td>
                        <td className="px-3 py-1.5">
                          {p.erros.map((e, i) => (
                            <p key={`e${i}`} className="text-red-700">
                              {e}
                            </p>
                          ))}
                          {p.avisos.map((a, i) => (
                            <p key={`a${i}`} className="text-amber-700">
                              {a}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {problemas.length > MAX_PROBLEMAS_VISIVEIS && (
                  <p className="px-3 py-1.5 text-xs text-slate-500">
                    Mostrando {MAX_PROBLEMAS_VISIVEIS} de {problemas.length} linhas com problema.
                  </p>
                )}
              </div>
            )}
            {!final && previa && previa.validas === 0 && <p className="text-slate-500">Nenhuma linha válida para importar.</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
