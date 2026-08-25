import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { Contato, PoliticaRetencao, RegistroLgpd, ResumoExpurgo } from '../../lib/types';

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : 'nunca');

const CAMPOS = [
  { chave: 'diasConversas', label: 'Conversas finalizadas', hint: 'Apaga mensagens e arquivos; mantem canal, fila e datas' },
  { chave: 'diasProtocolos', label: 'Protocolos encerrados', hint: 'Apaga comentarios, anexos e a descricao' },
  { chave: 'diasPresenca', label: 'Log de presenca', hint: 'Base do relatorio de jornada' },
] as const;

/** Politica de retencao, expurgo e direitos do titular (LGPD). Somente admin. */
export function LgpdTab() {
  const [politica, setPolitica] = useState<PoliticaRetencao | null>(null);
  const [registros, setRegistros] = useState<RegistroLgpd[]>([]);
  const [resumo, setResumo] = useState<ResumoExpurgo | null>(null);
  const [busca, setBusca] = useState('');
  const [encontrados, setEncontrados] = useState<Contato[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        api.get<{ politica: PoliticaRetencao }>('/lgpd/politica'),
        api.get<{ registros: RegistroLgpd[] }>('/lgpd/registros'),
      ]);
      setPolitica(p.politica);
      setRegistros(r.registros);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a politica');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = async (acao: () => Promise<void>) => {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha na operacao');
    } finally {
      setOcupado(false);
    }
  };

  const salvar = () =>
    executar(async () => {
      if (!politica) return;
      const { politica: nova } = await api.put<{ politica: PoliticaRetencao }>('/lgpd/politica', {
        ativa: politica.ativa,
        diasConversas: politica.diasConversas,
        diasProtocolos: politica.diasProtocolos,
        diasPresenca: politica.diasPresenca,
      });
      setPolitica(nova);
      setAviso('Politica salva.');
    });

  const rodarExpurgo = (real: boolean) =>
    executar(async () => {
      const { resumo: r } = await api.post<{ resumo: ResumoExpurgo }>('/lgpd/expurgo', {
        simulacao: !real,
        ...(real ? { confirmacao: 'EXPURGAR' } : {}),
      });
      setResumo(r);
      if (real) {
        setAviso('Expurgo executado.');
        await carregar();
      }
    });

  const exportar = (c: Contato) =>
    executar(async () => {
      const { dados } = await api.get<{ dados: unknown }>(`/lgpd/titulares/${c.id}/exportar`);
      // Download local: o JSON com dado pessoal nao passa por servico externo.
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `titular-${c.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setAviso(`Dados de ${c.nome} exportados. A exportacao entrou na trilha de auditoria.`);
    });

  const anonimizar = async (c: Contato) => {
    if (!window.confirm(`Anonimizar ${c.nome}? A operacao nao tem volta.`)) return;
    await executar(async () => {
      await api.post(`/lgpd/titulares/${c.id}/anonimizar`, { confirmacao: 'ANONIMIZAR' });
      setAviso('Titular anonimizado.');
      setEncontrados([]);
      await carregar();
    });
  };

  return (
    <div className="space-y-5">
      {erro && <Alerta>{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <Card
        titulo="Politica de retencao"
        descricao="Prazo, em dias, que cada tipo de dado fica guardado depois de encerrado"
        acao={<Badge tom={politica?.ativa ? 'sucesso' : 'neutro'}>{politica?.ativa ? 'automatico' : 'manual'}</Badge>}
      >
        {politica && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {CAMPOS.map(({ chave, label, hint }) => (
                <Field key={chave} label={label} hint={hint}>
                  <Input
                    type="number"
                    min={7}
                    max={3650}
                    value={politica[chave]}
                    onChange={(e) => setPolitica({ ...politica, [chave]: Number(e.target.value) })}
                  />
                </Field>
              ))}
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={politica.ativa}
                onChange={(e) => setPolitica({ ...politica, ativa: e.target.checked })}
                className="mt-1"
              />
              <span>
                Executar o expurgo automaticamente uma vez por dia.
                <span className="block text-xs text-slate-400">
                  Ultimo expurgo: {dataHora(politica.ultimoExpurgoEm)}
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button onClick={salvar} disabled={ocupado}>Salvar politica</Button>
              <Button variante="neutro" onClick={() => void rodarExpurgo(false)} disabled={ocupado}>
                Simular expurgo
              </Button>
              <Button
                variante="neutro"
                disabled={ocupado || !resumo}
                onClick={() => {
                  if (window.confirm('Isto apaga dados de forma irreversivel. Confirmar?')) {
                    void rodarExpurgo(true);
                  }
                }}
              >
                Executar expurgo
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              O botao de executar so libera depois de uma simulacao: o numero na tela e o que sera apagado.
            </p>
          </div>
        )}
      </Card>

      {resumo && (
        <Card
          titulo={resumo.simulacao ? 'Simulacao' : 'Expurgo executado'}
          descricao={`Corte de conversas em ${dataHora(resumo.corte.conversas)}`}
        >
          <dl className="grid gap-3 sm:grid-cols-4">
            {[
              ['Conversas', resumo.conversas],
              ['Mensagens', resumo.mensagens],
              ['Protocolos', resumo.protocolos],
              ['Comentarios', resumo.comentarios],
              ['Anexos', resumo.anexos],
              ['Presenca', resumo.presenca],
              ['Titulares', resumo.titulares],
              ['Arquivos orfaos', resumo.arquivosOrfaos],
            ].map(([rotulo, valor]) => (
              <div key={String(rotulo)} className="rounded-lg border border-slate-200 px-3 py-2">
                <dt className="text-xs text-slate-500">{rotulo}</dt>
                <dd className="text-lg font-medium text-slate-800">{valor}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Card titulo="Direitos do titular" descricao="Copia dos dados (portabilidade) e eliminacao a pedido">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(async () => {
              const { contatos } = await api.get<{ contatos: Contato[] }>(
                `/contatos?busca=${encodeURIComponent(busca)}`,
              );
              setEncontrados(contatos);
              if (contatos.length === 0) setAviso('Nenhum contato encontrado.');
            });
          }}
        >
          <Input placeholder="Nome, email ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Button type="submit" disabled={ocupado || busca.trim().length < 2}>Buscar</Button>
        </form>

        {encontrados.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {encontrados.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">{c.nome}</p>
                  <p className="truncate text-xs text-slate-400">{c.email ?? c.telefone ?? 'sem contato'}</p>
                </div>
                <div className="flex gap-2">
                  <Button variante="neutro" disabled={ocupado} onClick={() => void exportar(c)}>
                    Exportar dados
                  </Button>
                  <Button variante="neutro" disabled={ocupado} onClick={() => void anonimizar(c)}>
                    Anonimizar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titulo="Trilha de auditoria" descricao="Ultimas operacoes de expurgo, anonimizacao e exportacao">
        {registros.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma operacao registrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {registros.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex items-center gap-2">
                  <Badge tom={r.acao === 'EXPURGO' ? 'alerta' : 'neutro'}>{r.acao}</Badge>
                  <span className="text-sm text-slate-700">{r.autor}</span>
                  <span className="text-xs text-slate-400">{dataHora(r.criadoEm)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{JSON.stringify(r.detalhe)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
