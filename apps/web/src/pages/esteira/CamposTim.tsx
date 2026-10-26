import { useState } from 'react';
import { Badge, Button, Input } from '../../components/ui';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import type { CamposTim as Campos, EstruturaEsteira, RespostaVinculo, VendedorPdv, VinculoDetalhe } from '../../lib/esteiraTypes';
import { BotaoTriEstado } from './BotaoTriEstado';
import { CampoData, CampoLeitura, CampoSelecao, CampoTexto, Secao } from './camposUi';
import { campoEditavel } from './gavetaVinculo';

const SISTEMAS: ReadonlyArray<{ campo: keyof Campos; rotulo: string }> = [
  { campo: 'sistemaTimVendas', rotulo: 'TIM Vendas' },
  { campo: 'sistemaGn', rotulo: 'GN' },
  { campo: 'sistemaTimFormaMais', rotulo: 'TIM Forma Mais' },
  { campo: 'sistemaPortalFornecedor', rotulo: 'Portal do Fornecedor' },
  { campo: 'sistemaMeuTim', rotulo: 'Meu TIM' },
];
const STATUS_ITEM = [
  { valor: 'PENDENTE', rotulo: 'Pendente' },
  { valor: 'CONCLUIDO', rotulo: 'Concluído' },
];
const ROTULO_ORIGEM: Record<string, string> = { MANUAL: 'Manual', PLANILHA: 'Planilha' };
const ROTULO_PARCERIA: Record<string, string> = { ATIVO: 'Ativo', DESISTENTE: 'Desistente', DESCREDENCIADO: 'Descredenciado' };

/**
 * Campos da TIM (spec 4.5), agrupados pela etapa em que se preenchem.
 * Só os `editavel` da estrutura ficam liberados; LEITURA desabilita tudo.
 * Sistema indo a Sim sem vendedor ativo volta 409/403 — o diálogo de regras
 * (de quem chama `salvarCampos`) cuida disso.
 */
export function CamposTim({
  vinculo,
  estrutura,
  leitura,
  salvarCampos,
  base,
  aoAtualizar,
}: {
  vinculo: VinculoDetalhe;
  estrutura: EstruturaEsteira;
  leitura: boolean;
  salvarCampos: (campos: Partial<Campos>) => void;
  base: string;
  aoAtualizar: (v: VinculoDetalhe) => void;
}) {
  const c = vinculo.campos as Campos;
  const pode = (nome: keyof Campos) => !leitura && campoEditavel(estrutura.colunas, nome);
  const opcoes = (chave: string) => estrutura.colunas.find((col) => col.chave === chave)?.opcoes ?? [];
  const pronto = vinculo.prontoTim === true;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
            pronto ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          Venda liberada: {pronto ? 'Sim' : 'Não'}
        </span>
        {!pronto && <span className="text-xs text-slate-500">Exige TIM Vendas = Sim, compra de chip e treinamento concluídos.</span>}
      </div>

      <Secao titulo="Negociação">
        <CampoLeitura rotulo="Origem">{c.origem ? ROTULO_ORIGEM[c.origem] ?? c.origem : '—'}</CampoLeitura>
        <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
          <input
            type="checkbox"
            checked={c.flagTrafegoPago}
            disabled={!pode('flagTrafegoPago')}
            onChange={(e) => salvarCampos({ flagTrafegoPago: e.target.checked })}
          />
          Veio de tráfego pago
        </label>
        <CampoTexto
          rotulo="Status (aceite comercial)"
          valor={c.statusDescritivo}
          maximo={1000}
          multilinha
          desabilitado={!pode('statusDescritivo')}
          aoSalvar={(v) => salvarCampos({ statusDescritivo: v })}
        />
        <CampoSelecao rotulo="DEP (quem trava)" valor={c.dep} opcoes={opcoes('dep')} desabilitado={!pode('dep')} aoSalvar={(v) => salvarCampos({ dep: v as Campos['dep'] })} />
      </Secao>

      <Secao titulo="Credenciamento">
        <CampoData
          rotulo="Data do credenciamento"
          valor={c.dataCredenciamento}
          desabilitado={!pode('dataCredenciamento')}
          dica="Carimbada ao entrar em Credenciamento OK; pode ser corrigida."
          aoSalvar={(v) => salvarCampos({ dataCredenciamento: v })}
        />
        <CampoTexto
          rotulo="Matrícula SAPPDV"
          valor={c.matriculaSappdv}
          maximo={60}
          desabilitado={!pode('matriculaSappdv')}
          dica="Só pode ser preenchida a partir de Credenciamento OK."
          aoSalvar={(v) => salvarCampos({ matriculaSappdv: v })}
        />
        <CampoTexto
          rotulo="Promo status"
          valor={c.promoStatus}
          maximo={60}
          sugestoes={['promovido']}
          desabilitado={!pode('promoStatus')}
          aoSalvar={(v) => salvarCampos({ promoStatus: v })}
        />
      </Secao>

      <Secao titulo="PDV">
        <CampoTexto
          rotulo="Tipo de carteira"
          valor={c.tipoCarteira}
          maximo={60}
          sugestoes={['recem-entrada']}
          desabilitado={!pode('tipoCarteira')}
          aoSalvar={(v) => salvarCampos({ tipoCarteira: v })}
        />
        <div className="rounded-lg border border-slate-200 px-3 py-1">
          <p className="pt-1.5 text-xs font-medium text-slate-600">Sistemas liberados</p>
          {SISTEMAS.map((s) => (
            <BotaoTriEstado
              key={s.campo}
              rotulo={s.rotulo}
              valor={c[s.campo] as boolean | null}
              desabilitado={!pode(s.campo)}
              aoMudar={(v) => salvarCampos({ [s.campo]: v })}
            />
          ))}
          <p className="pb-1.5 text-xs text-slate-500">Marcar Sim exige ao menos um vendedor ativo (ou exceção autorizada).</p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <CampoSelecao
            rotulo="Compra de chip"
            valor={c.compraChip}
            opcoes={STATUS_ITEM}
            desabilitado={!pode('compraChip')}
            aoSalvar={(v) => salvarCampos({ compraChip: v as Campos['compraChip'] })}
          />
          <CampoSelecao
            rotulo="Treinamento"
            valor={c.treinamento}
            opcoes={STATUS_ITEM}
            desabilitado={!pode('treinamento')}
            aoSalvar={(v) => salvarCampos({ treinamento: v as Campos['treinamento'] })}
          />
        </div>
        <CampoLeitura rotulo="Status da parceria">{c.statusParceria ? ROTULO_PARCERIA[c.statusParceria] : '—'}</CampoLeitura>
      </Secao>

      <VendedoresPdv vinculo={vinculo} leitura={leitura} base={base} aoAtualizar={aoAtualizar} />
    </div>
  );
}

type Rascunho = { id?: string; nome: string; cpf: string; telefone: string };

/** Vendedores do PDV: adicionar, editar e inativar (o histórico do vendedor fica). */
function VendedoresPdv({
  vinculo,
  leitura,
  base,
  aoAtualizar,
}: {
  vinculo: VinculoDetalhe;
  leitura: boolean;
  base: string;
  aoAtualizar: (v: VinculoDetalhe) => void;
}) {
  const mostrar = useToast();
  const confirmar = useConfirm();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const vendedores = vinculo.vendedores ?? [];
  const url = `${base}/vinculos/${vinculo.id}/vendedores`;

  const gravar = async (corpo: Record<string, unknown>, sucesso: string) => {
    setOcupado(true);
    try {
      const r = await api.put<RespostaVinculo>(url, corpo);
      aoAtualizar(r.vinculo);
      mostrar('sucesso', sucesso);
      return true;
    } catch (e) {
      mostrar('erro', e instanceof ApiError ? e.message : 'Falha ao gravar o vendedor');
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const salvarRascunho = async () => {
    if (!rascunho || rascunho.nome.trim().length < 2) return;
    const ok = await gravar(
      {
        ...(rascunho.id ? { id: rascunho.id } : {}),
        nome: rascunho.nome.trim(),
        cpf: rascunho.cpf.trim() || null,
        telefone: rascunho.telefone.trim() || null,
      },
      rascunho.id ? 'Vendedor atualizado' : 'Vendedor adicionado',
    );
    if (ok) setRascunho(null);
  };

  const inativar = (v: VendedorPdv) =>
    confirmar({
      titulo: `Inativar ${v.nome}?`,
      descricao: 'O vendedor deixa de contar como ativo no PDV. O cadastro e o histórico continuam.',
      variante: 'perigo',
      rotuloConfirmar: 'Inativar',
      aoConfirmar: async () => {
        try {
          const r = await api.del<RespostaVinculo>(`${url}/${v.id}`);
          aoAtualizar(r.vinculo);
          mostrar('sucesso', 'Vendedor inativado');
        } catch (e) {
          mostrar('erro', e instanceof ApiError ? e.message : 'Falha ao inativar o vendedor');
        }
      },
    });

  return (
    <Secao
      titulo={`Vendedores do PDV (${vendedores.filter((v) => v.status === 'ATIVO').length} ativo(s))`}
      acao={
        !leitura && !rascunho ? (
          <Button variante="neutro" tamanho="sm" onClick={() => setRascunho({ nome: '', cpf: '', telefone: '' })}>
            + Adicionar
          </Button>
        ) : undefined
      }
    >
      {vendedores.length === 0 && !rascunho && <p className="text-xs text-slate-500">Nenhum vendedor cadastrado.</p>}
      <ul className="flex flex-col gap-2">
        {vendedores.map((v) =>
          rascunho?.id === v.id ? null : (
            <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-slate-800">{v.nome}</span>
                <span className="block text-xs tabular-nums text-slate-500">
                  {[v.cpf ? `CPF ${v.cpf}` : null, v.telefone].filter(Boolean).join(' · ') || 'Sem CPF e telefone'}
                </span>
              </span>
              <Badge tom={v.status === 'ATIVO' ? 'sucesso' : 'neutro'}>{v.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</Badge>
              {!leitura && (
                <span className="flex gap-1">
                  <Button
                    variante="neutro"
                    tamanho="sm"
                    disabled={ocupado}
                    onClick={() => setRascunho({ id: v.id, nome: v.nome, cpf: v.cpf ?? '', telefone: v.telefone ?? '' })}
                  >
                    Editar
                  </Button>
                  {v.status === 'ATIVO' ? (
                    <Button variante="perigo" tamanho="sm" disabled={ocupado} onClick={() => inativar(v)}>
                      Inativar
                    </Button>
                  ) : (
                    <Button
                      variante="neutro"
                      tamanho="sm"
                      disabled={ocupado}
                      onClick={() => void gravar({ id: v.id, nome: v.nome, status: 'ATIVO' }, 'Vendedor reativado')}
                    >
                      Reativar
                    </Button>
                  )}
                </span>
              )}
            </li>
          ),
        )}
      </ul>
      {rascunho && (
        <form
          className="grid gap-2 rounded-lg border border-[var(--brand-primary)]/40 p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void salvarRascunho();
          }}
        >
          <div className="sm:col-span-2">
            <Input aria-label="Nome do vendedor" placeholder="Nome" autoFocus value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
          </div>
          <Input aria-label="CPF do vendedor" placeholder="CPF" inputMode="numeric" value={rascunho.cpf} onChange={(e) => setRascunho({ ...rascunho, cpf: e.target.value })} />
          <Input aria-label="Telefone do vendedor" placeholder="Telefone" value={rascunho.telefone} onChange={(e) => setRascunho({ ...rascunho, telefone: e.target.value })} />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variante="neutro" tamanho="sm" onClick={() => setRascunho(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button type="submit" tamanho="sm" disabled={ocupado || rascunho.nome.trim().length < 2}>
              {ocupado ? 'Gravando...' : 'Salvar vendedor'}
            </Button>
          </div>
        </form>
      )}
    </Secao>
  );
}
