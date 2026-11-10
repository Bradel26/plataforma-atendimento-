import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Button, Field, Input, Select, Textarea } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { Segmentado } from '../../components/ui/Pagina';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import type { CriarVinculoInput, Operacao, RespostaLista, RespostaVinculo, VinculoDetalhe, VinculoResumo } from '../../lib/esteiraTypes';
import { useResponsaveis } from './BarraDeFiltros';
import {
  ROTULO_OPERACAO,
  corpoNovoParceiro,
  digitos,
  formatarDocumento,
  presencaNasOperacoes,
  validarDocumento,
  type FormNovoParceiro,
  type Presenca,
  type TipoDocumento,
} from './cadastroEsteira';
import { parametroDaOperacao, urlDoEstado } from './estadoEsteira';
import { UFS } from './ufs';

const TIPOS: ReadonlyArray<{ valor: TipoDocumento; rotulo: string }> = [
  { valor: 'CNPJ', rotulo: 'CNPJ' },
  { valor: 'CPF', rotulo: 'CPF' },
  { valor: 'TELEFONE', rotulo: 'Telefone' },
];
const DICA_DOCUMENTO: Record<TipoDocumento, string> = {
  CNPJ: '00.000.000/0000-00',
  CPF: '000.000.000-00',
  TELEFONE: '(62) 99999-0000',
};
/** Quantos vínculos a busca traz por operação (a Lista casa por trecho; o filtro exato vem depois). */
const TAMANHO_BUSCA = 20;

const formVazio = (tipo: TipoDocumento, documento: string): FormNovoParceiro => ({
  tipo,
  documento,
  nome: '',
  empresa: '',
  telefone: '',
  email: '',
  cidade: '',
  uf: '',
  responsavelId: '',
  observacoes: '',
  tipoCaptacao: '',
});

const resumoDaLinha = (p: Presenca): VinculoResumo => ({ ...p.vinculo, destinos: {} });

/** Link para a Lista da operação filtrada pelo documento. */
const linkDaLista = (operacao: Operacao, documento: string) =>
  `/esteira/${parametroDaOperacao(operacao)}${urlDoEstado('lista', { busca: documento })}`;

type Busca = {
  tipo: TipoDocumento;
  documento: string;
  presencas: Presenca[];
  /** Empresa já cadastrada com o CNPJ (cadastro central), quando a busca é por CNPJ. */
  empresa: { id: string; nome: string } | null;
};

/**
 * "Novo parceiro" na operação ativa (spec 6.4): procura o parceiro por CNPJ,
 * CPF ou telefone em todas as operações que o usuário vê, mostra onde ele já
 * está e cria o vínculo desta operação — reaproveitando o cadastro central
 * quando existe (a API acha a conta pelo CNPJ e o contato pelo CPF/telefone).
 */
export function NovoParceiro({
  aberto,
  operacao,
  permitidas,
  aoFechar,
  aoCriar,
  aoAbrirCartao,
}: {
  aberto: boolean;
  operacao: Operacao;
  /** Operações que o usuário vê (a busca olha todas). */
  permitidas: Operacao[];
  aoFechar: () => void;
  aoCriar: (v: VinculoDetalhe) => void;
  /** Abre a gaveta de um vínculo desta operação. */
  aoAbrirCartao: (v: VinculoResumo) => void;
}) {
  const mostrar = useToast();
  const responsaveis = useResponsaveis();
  const [tipo, setTipo] = useState<TipoDocumento>('CNPJ');
  const [documento, setDocumento] = useState('');
  const [erroDocumento, setErroDocumento] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState<Busca | null>(null);
  const [form, setForm] = useState<FormNovoParceiro>(formVazio('CNPJ', ''));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** 409: já está nesta esteira (o vínculo, se a busca achar). */
  const [jaNaEsteira, setJaNaEsteira] = useState<{ presenca: Presenca | null } | null>(null);

  // Cada abertura recomeça do zero.
  useEffect(() => {
    if (!aberto) return;
    setTipo('CNPJ');
    setDocumento('');
    setErroDocumento(null);
    setBusca(null);
    setErro(null);
    setJaNaEsteira(null);
  }, [aberto]);

  /** Vínculos com o documento em cada operação visível (falha numa operação não derruba a busca). */
  const procurar = async (t: TipoDocumento, d: string): Promise<Presenca[]> => {
    const respostas = await Promise.all(
      permitidas.map((o) =>
        api
          .get<RespostaLista>(`/esteiras/${parametroDaOperacao(o)}/lista?busca=${d}&tamanho=${TAMANHO_BUSCA}`)
          .then((r) => [o, r.linhas] as const)
          .catch(() => [o, []] as const),
      ),
    );
    return presencaNasOperacoes(t, d, Object.fromEntries(respostas));
  };

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    const invalido = validarDocumento(tipo, documento);
    setErroDocumento(invalido);
    if (invalido) return;
    const d = digitos(documento);
    setBuscando(true);
    setErro(null);
    setJaNaEsteira(null);
    try {
      const [presencas, empresa] = await Promise.all([
        procurar(tipo, d),
        tipo === 'CNPJ'
          ? api
              .get<{ contas: Array<{ id: string; nome: string; cnpj: string | null }> }>(`/contas?busca=${d}&limite=5`)
              .then((r) => r.contas.find((c) => digitos(c.cnpj) === d) ?? null)
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      setBusca({ tipo, documento: d, presencas, empresa: empresa ? { id: empresa.id, nome: empresa.nome } : null });
      // Já está em outra operação: o formulário nasce com o cadastro de lá.
      const outra = presencas[0]?.vinculo.parceiro;
      setForm({
        ...formVazio(tipo, tipo === 'TELEFONE' ? documento.trim() : d),
        nome: outra?.nome ?? '',
        empresa: empresa?.nome ?? '',
        cidade: outra?.cidade ?? '',
        uf: outra?.uf ?? '',
      });
    } finally {
      setBuscando(false);
    }
  };

  const nestaOperacao = busca?.presencas.find((p) => p.operacao === operacao) ?? null;
  const emOutras = busca?.presencas.filter((p) => p.operacao !== operacao) ?? [];
  /** Cadastro de outra operação: reaproveita contato e conta tal como estão. */
  const reaproveitado = emOutras[0]?.vinculo.parceiro ?? null;

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    if (!busca) return;
    const completo = corpoNovoParceiro(operacao, form);
    const corpo: CriarVinculoInput = reaproveitado
      ? {
          contatoId: reaproveitado.contatoId,
          ...(reaproveitado.contaId ? { contaId: reaproveitado.contaId } : {}),
          ...(completo.responsavelId ? { responsavelId: completo.responsavelId } : {}),
          ...(completo.observacoes ? { observacoes: completo.observacoes } : {}),
          ...(completo.tipoCaptacao ? { tipoCaptacao: completo.tipoCaptacao } : {}),
        }
      : completo;
    if (!reaproveitado && !corpo.nome && !corpo.empresa) {
      setErro('Informe o nome do parceiro');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const { vinculo } = await api.post<RespostaVinculo>(`/esteiras/${parametroDaOperacao(operacao)}/vinculos`, corpo);
      mostrar('sucesso', `${vinculo.parceiro.nome} entrou na esteira ${ROTULO_OPERACAO[operacao]}.`);
      aoCriar(vinculo);
    } catch (falha) {
      if (falha instanceof ApiError && falha.status === 409) {
        // A corrida (ou a carteira) escondeu o vínculo da busca: procura de novo só nesta operação.
        const achado = (await procurar(busca.tipo, busca.documento).catch(() => [])).find((p) => p.operacao === operacao) ?? null;
        setJaNaEsteira({ presenca: achado });
      } else {
        setErro(falha instanceof ApiError ? falha.message : 'Não foi possível cadastrar o parceiro');
      }
    } finally {
      setSalvando(false);
    }
  };

  const campo = <K extends keyof FormNovoParceiro>(chave: K) => ({
    value: form[chave],
    onChange: (ev: { target: { value: string } }) => setForm((f) => ({ ...f, [chave]: ev.target.value })),
  });

  const avisoJaNaEsteira = (presenca: Presenca | null) => (
    <Alerta tipo="aviso">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Este parceiro já está nesta esteira
          {presenca ? ` (${presenca.vinculo.parceiro.nome} · ${presenca.vinculo.etapa.nome})` : ''}.
        </span>
        {presenca ? (
          <Button tamanho="sm" variante="neutro" onClick={() => aoAbrirCartao(resumoDaLinha(presenca))}>
            Abrir card
          </Button>
        ) : (
          busca && (
            <Link className="text-sm font-medium underline" to={linkDaLista(operacao, busca.documento)} onClick={aoFechar}>
              Procurar na lista
            </Link>
          )
        )}
      </span>
    </Alerta>
  );

  const podeCriar = busca && !nestaOperacao && !jaNaEsteira;

  return (
    <Modal
      aberto={aberto}
      titulo={`Novo parceiro · ${ROTULO_OPERACAO[operacao]}`}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Button variante="neutro" onClick={aoFechar}>
            Cancelar
          </Button>
          {podeCriar && (
            <Button type="submit" form="form-novo-parceiro" disabled={salvando}>
              {salvando ? 'Cadastrando…' : `Adicionar à ${ROTULO_OPERACAO[operacao]}`}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <form className="flex flex-col gap-3" onSubmit={(e) => void buscar(e)}>
          <p className="text-sm text-slate-600">
            Procure primeiro pelo documento: se o parceiro já existe no cadastro ou em outra operação, ele é reaproveitado — nada
            é duplicado.
          </p>
          <Segmentado
            rotulo="Procurar por"
            tamanho="sm"
            opcoes={TIPOS}
            valor={tipo}
            aoMudar={(t) => {
              setTipo(t);
              setBusca(null);
              setErroDocumento(null);
            }}
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label={TIPOS.find((t) => t.valor === tipo)!.rotulo} erro={erroDocumento ?? undefined}>
                <Input
                  value={documento}
                  inputMode="numeric"
                  placeholder={DICA_DOCUMENTO[tipo]}
                  onChange={(e) => {
                    setDocumento(e.target.value);
                    setBusca(null);
                  }}
                  autoFocus
                />
              </Field>
            </div>
            <Button type="submit" variante="neutro" disabled={buscando || !documento.trim()}>
              {buscando ? 'Procurando…' : 'Procurar'}
            </Button>
          </div>
        </form>

        {busca && (
          <div className="flex flex-col gap-2">
            {busca.empresa && (
              <Alerta tipo="sucesso">
                Empresa já cadastrada: <strong>{busca.empresa.nome}</strong> ({formatarDocumento('CNPJ', busca.documento)}). O
                vínculo usa este cadastro.
              </Alerta>
            )}
            {busca.presencas.length === 0 && !busca.empresa && (
              <p className="text-sm text-slate-600">Nenhum parceiro com este documento nas esteiras. Preencha os dados abaixo.</p>
            )}
            {nestaOperacao && avisoJaNaEsteira(nestaOperacao)}
            {emOutras.length > 0 && (
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium text-slate-700">Já está em outra operação:</p>
                <ul className="mt-1 space-y-1">
                  {emOutras.map((p) => (
                    <li key={p.vinculo.id} className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
                      <span>
                        {ROTULO_OPERACAO[p.operacao]} · {p.vinculo.parceiro.nome} · {p.vinculo.etapa.nome}
                      </span>
                      <Link className="text-[var(--brand-primary)] hover:underline" to={linkDaLista(p.operacao, busca.documento)} onClick={aoFechar}>
                        Ver na {ROTULO_OPERACAO[p.operacao]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {jaNaEsteira && avisoJaNaEsteira(jaNaEsteira.presenca)}
        {erro && <Alerta>{erro}</Alerta>}

        {podeCriar && (
          <form id="form-novo-parceiro" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void criar(e)}>
            {reaproveitado ? (
              <p className="text-sm text-slate-600 sm:col-span-2">
                O cadastro de <strong>{reaproveitado.nome}</strong> é reaproveitado como está; a {ROTULO_OPERACAO[operacao]} ganha
                um vínculo próprio, com etapa e campos independentes.
              </p>
            ) : (
              <>
                {busca.tipo === 'CNPJ' && !busca.empresa && (
                  <Field label="Empresa (razão social ou nome fantasia)">
                    <Input {...campo('empresa')} maxLength={160} />
                  </Field>
                )}
                <Field label="Nome do contato" hint={busca.tipo === 'CNPJ' ? 'Sem nome, usa o da empresa' : undefined}>
                  <Input {...campo('nome')} maxLength={160} />
                </Field>
                {busca.tipo !== 'TELEFONE' && (
                  <Field label="Telefone">
                    <Input {...campo('telefone')} maxLength={30} inputMode="tel" />
                  </Field>
                )}
                <Field label="E-mail">
                  <Input {...campo('email')} type="email" maxLength={160} />
                </Field>
                <Field label="Cidade">
                  <Input {...campo('cidade')} maxLength={120} />
                </Field>
                <Field label="UF">
                  <Select {...campo('uf')}>
                    <option value="">—</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
            {responsaveis && (
              <Field label="Responsável" hint="Sem escolha, fica o responsável do contato">
                <Select {...campo('responsavelId')}>
                  <option value="">—</option>
                  {responsaveis.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {operacao === 'STARLINK' && (
              <Field label="Captação">
                <Select {...campo('tipoCaptacao')}>
                  <option value="">—</option>
                  <option value="LEAD_INBOUND">Lead inbound</option>
                  <option value="PROSPECCAO_ATIVA">Prospecção ativa</option>
                </Select>
              </Field>
            )}
            <div className="sm:col-span-2">
              <Field label="Observações">
                <Textarea {...campo('observacoes')} rows={2} maxLength={2000} />
              </Field>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
