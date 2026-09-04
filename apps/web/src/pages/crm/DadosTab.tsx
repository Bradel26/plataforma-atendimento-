import { useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Select } from '../../components/ui';
import { ApiError, api, baixarCsv } from '../../lib/api';

type Resultado = {
  total: number;
  criados: number;
  ignorados: number;
  erros: Array<{ linha: number; motivo: string }>;
};

const EXPORTACOES = [
  { recurso: 'leads', label: 'Leads' },
  { recurso: 'contatos', label: 'Contatos' },
  { recurso: 'contas', label: 'Contas' },
  { recurso: 'oportunidades', label: 'Oportunidades' },
  { recurso: 'protocolos', label: 'Protocolos' },
  { recurso: 'conversas', label: 'Conversas' },
] as const;

const IMPORTACOES = [
  {
    recurso: 'leads',
    label: 'Leads',
    colunas: 'nome (obrigatoria), email, telefone, conta, fase, tipo, canal_origem, responsavel_email, prazo, valor_estimado, motivo_perda, observacoes',
  },
  {
    recurso: 'contatos',
    label: 'Contatos',
    colunas: 'nome (obrigatoria), email, telefone, conta, canal_origem, observacoes',
  },
  {
    recurso: 'contas',
    label: 'Contas',
    colunas: 'nome (obrigatoria), cnpj, segmento, site, telefone, email, observacoes',
  },
  {
    recurso: 'oportunidades',
    label: 'Oportunidades',
    colunas: 'titulo (obrigatoria), conta (obrigatoria), funil, estagio, valor, responsavel_email, previsao_fechamento, canal_origem',
  },
] as const;

const hoje = () => new Date().toISOString().slice(0, 10);

/** Importacao e exportacao CSV (Fase 2). Excel pt-BR abre direto: BOM + separador ";". */
export function DadosTab() {
  const [recurso, setRecurso] = useState<(typeof IMPORTACOES)[number]['recurso']>('leads');
  const [csv, setCsv] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [importado, setImportado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const importacaoAtual = IMPORTACOES.find((i) => i.recurso === recurso)!;

  const mudarRecurso = (novo: (typeof IMPORTACOES)[number]['recurso']) => {
    setRecurso(novo);
    // Trocar de recurso sem limpar deixaria a previa de um tipo de planilha
    // exibida por cima do formulario de outro — os campos nao tem nada a ver.
    setCsv('');
    setNomeArquivo('');
    setPrevia(null);
    setImportado(null);
    setErro(null);
  };

  const lerArquivo = async (arquivo: File) => {
    setErro(null);
    setPrevia(null);
    setImportado(null);
    setNomeArquivo(arquivo.name);
    setCsv(await arquivo.text());
  };

  const enviar = async (dryRun: boolean) => {
    setErro(null);
    setOcupado(true);
    try {
      const { resultado } = await api.post<{ resultado: Resultado }>(`/dados/importar/${recurso}`, { csv, dryRun });
      if (dryRun) {
        setPrevia(resultado);
        setImportado(null);
      } else {
        setImportado(resultado);
        setPrevia(null);
        setCsv('');
        setNomeArquivo('');
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao processar o CSV');
    } finally {
      setOcupado(false);
    }
  };

  const baixar = async (caminho: string, nome: string) => {
    setErro(null);
    try {
      await baixarCsv(caminho, nome);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao baixar o arquivo');
    }
  };

  const Resumo = ({ dados, titulo }: { dados: Resultado; titulo: string }) => (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-800">{titulo}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tom="neutro">{dados.total} linha(s)</Badge>
        <Badge tom="sucesso">{dados.criados} valida(s)</Badge>
        {dados.ignorados > 0 && <Badge tom="alerta">{dados.ignorados} com erro</Badge>}
      </div>
      {dados.erros.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {dados.erros.map((e) => (
            <li key={e.linha}>
              Linha {e.linha}: {e.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card titulo="Exportar" descricao="CSV com BOM e separador ponto e virgula — abre direto no Excel">
        <div className="flex flex-wrap gap-2">
          {EXPORTACOES.map(({ recurso, label }) => (
            <Button
              key={recurso}
              variante="neutro"
              onClick={() => void baixar(`/dados/exportar/${recurso}.csv`, `${recurso}-${hoje()}.csv`)}
            >
              {label}
            </Button>
          ))}
        </div>
        {erro && <div className="mt-3"><Alerta>{erro}</Alerta></div>}
      </Card>

      <Card titulo="Importar" descricao="Somente admin e supervisor">
        <div className="space-y-3">
          <Field label="O que importar">
            <Select value={recurso} onChange={(e) => mudarRecurso(e.target.value as typeof recurso)}>
              {IMPORTACOES.map((i) => (
                <option key={i.recurso} value={i.recurso}>
                  {i.label}
                </option>
              ))}
            </Select>
          </Field>

          <Button
            variante="neutro"
            onClick={() => void baixar(`/dados/modelos/${recurso}.csv`, `modelo-${recurso}.csv`)}
          >
            Baixar modelo em branco
          </Button>

          <Field label="Arquivo CSV" hint={`Colunas: ${importacaoAtual.colunas}`}>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void lerArquivo(arquivo);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>

          {nomeArquivo && (
            <p className="text-xs text-slate-500">
              {nomeArquivo} · {csv.split('\n').filter((l) => l.trim()).length - 1} linha(s) de dados
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variante="neutro" disabled={!csv || ocupado} onClick={() => void enviar(true)}>
              Validar sem gravar
            </Button>
            <Button disabled={!csv || ocupado} onClick={() => void enviar(false)}>
              {ocupado ? 'Processando...' : 'Importar'}
            </Button>
          </div>

          {previa && <Resumo dados={previa} titulo="Previa da validacao (nada foi gravado)" />}
          {importado && <Resumo dados={importado} titulo="Importacao concluida" />}
        </div>
      </Card>
    </div>
  );
}
