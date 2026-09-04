import { useEffect, useState } from 'react';
import { Alerta, Button, Field, Input, Select } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import type { Canal, Oportunidade, Usuario } from '../../../lib/types';
import { LABEL_CANAL_ORIGEM } from '../temperatura';

/**
 * Edicao dos campos da oportunidade.
 *
 * Faltava, e a falta apareceu de dois lados ao mesmo tempo:
 *
 * - a **proposta impressa** (item 2.2) precisa de condicao de pagamento e prazo
 *   de entrega, e nao havia onde escrever nenhum dos dois;
 * - a **trilha de auditoria** (item 3.2) grava edicao de campo, e o unico PATCH
 *   que a tela fazia era o arraste de etapa. A trilha nasceria sem nada para
 *   registrar, e o recurso pareceria vazio.
 *
 * Titulo, valor, responsavel e previsao ja existiam na API desde a Fase 2 e so
 * podiam ser mudados por quem chamasse a rota direto.
 */

/** Data para o `input[type=date]`, que so aceita AAAA-MM-DD. */
const paraCampoData = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

type Props = {
  oportunidade: Oportunidade;
  aoSalvar: () => void;
  aoCancelar: () => void;
};

export function EditorDaOportunidade({ oportunidade: o, aoSalvar, aoCancelar }: Props) {
  const [form, setForm] = useState({
    titulo: o.titulo,
    valor: o.valorInformado === null || o.valorInformado === undefined ? '' : String(o.valorInformado),
    responsavelId: o.responsavel?.id ?? '',
    previsaoFechamento: paraCampoData(o.previsaoFechamento),
    mesesRecorrencia: String(o.mesesRecorrencia ?? 12),
    condicaoPagamento: o.condicaoPagamento ?? '',
    prazoEntrega: o.prazoEntrega ?? '',
    /*
     * Vazio representa NULO nos dois, e nao um degrau.
     *
     * O campo em branco e o que permite desmarcar: quem marcou "quente" por
     * engano precisa poder retirar a leitura, e nenhum dos tres degraus
     * significa "retiro o que eu disse".
     */
    temperatura: o.temperatura ?? '',
    canalOrigem: o.canalOrigem ?? '',
  });
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ usuarios: Usuario[] }>('/usuarios')
      .then((u) => setUsuarios(u.usuarios.filter((x) => x.ativo)))
      .catch(() => undefined);
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      /*
       * Manda **so o que mudou**.
       *
       * Nao e economia de bytes: a API grava uma linha de auditoria por campo que
       * chega diferente, e reenviar o formulario inteiro criaria linhas de
       * "Titulo: X para X" a cada salvamento. Campo ausente no PATCH significa
       * "nao mandei", e e assim que a trilha continua legivel.
       */
      const mudou: Record<string, unknown> = {};
      if (form.titulo.trim() !== o.titulo) mudou.titulo = form.titulo.trim();

      const valorAtual = o.valorInformado ?? null;
      const valorNovo = form.valor.trim() === '' ? null : Number(form.valor);
      if (valorNovo !== null && valorNovo !== valorAtual) mudou.valor = valorNovo;

      const respAtual = o.responsavel?.id ?? '';
      if (form.responsavelId !== respAtual) mudou.responsavelId = form.responsavelId || null;

      const prevAtual = paraCampoData(o.previsaoFechamento);
      if (form.previsaoFechamento !== prevAtual) {
        mudou.previsaoFechamento = form.previsaoFechamento || null;
      }

      const meses = Number(form.mesesRecorrencia);
      if (meses !== (o.mesesRecorrencia ?? 12)) mudou.mesesRecorrencia = meses;

      if (form.condicaoPagamento.trim() !== (o.condicaoPagamento ?? '')) {
        mudou.condicaoPagamento = form.condicaoPagamento.trim() || null;
      }
      if (form.prazoEntrega.trim() !== (o.prazoEntrega ?? '')) {
        mudou.prazoEntrega = form.prazoEntrega.trim() || null;
      }
      if (form.temperatura !== (o.temperatura ?? '')) {
        mudou.temperatura = form.temperatura || null;
      }
      if (form.canalOrigem !== (o.canalOrigem ?? '')) {
        mudou.canalOrigem = form.canalOrigem || null;
      }

      // Nada mudou: sai sem chamar a API. Um PATCH vazio seria recusado pelo
      // proprio schema ("Informe ao menos um campo"), e o erro nao diria nada
      // util a quem so abriu e fechou o formulario.
      if (Object.keys(mudou).length === 0) {
        aoCancelar();
        return;
      }

      await api.patch(`/oportunidades/${o.id}`, mudou);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar a oportunidade');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      {erro && <Alerta>{erro}</Alerta>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titulo">
          <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
        </Field>
        <Field label="Responsavel">
          <Select
            value={form.responsavelId}
            onChange={(e) => setForm({ ...form, responsavelId: e.target.value })}
          >
            <option value="">Sem responsavel</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Valor informado"
          hint="So vale quando a proposta nao tem itens — havendo item, o item manda"
        >
          <Input
            type="number"
            value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })}
          />
        </Field>
        <Field label="Previsao de fechamento">
          <Input
            type="date"
            value={form.previsaoFechamento}
            onChange={(e) => setForm({ ...form, previsaoFechamento: e.target.value })}
          />
        </Field>
        <Field label="Meses de recorrencia" hint="Horizonte que o valor total considera">
          <Input
            type="number"
            value={form.mesesRecorrencia}
            onChange={(e) => setForm({ ...form, mesesRecorrencia: e.target.value })}
          />
        </Field>
        <Field
          label="Temperatura"
          hint="Sua leitura da negociacao. Em branco = sem leitura; nao e a probabilidade da etapa"
        >
          <Select
            value={form.temperatura}
            onChange={(e) => setForm({ ...form, temperatura: e.target.value as typeof form.temperatura })}
          >
            <option value="">Sem leitura</option>
            <option value="FRIA">Fria</option>
            <option value="MORNA">Morna</option>
            <option value="QUENTE">Quente</option>
          </Select>
        </Field>
        <Field label="Origem" hint="Por onde o negocio chegou. Em branco = nao registrada">
          <Select
            value={form.canalOrigem}
            onChange={(e) => setForm({ ...form, canalOrigem: e.target.value as typeof form.canalOrigem })}
          >
            <option value="">Nao registrada</option>
            {(Object.keys(LABEL_CANAL_ORIGEM) as Canal[]).map((c) => (
              <option key={c} value={c}>{LABEL_CANAL_ORIGEM[c]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Prazo de entrega" hint="Como sai na proposta impressa">
          <Input
            value={form.prazoEntrega}
            placeholder="15 dias uteis apos aprovacao"
            onChange={(e) => setForm({ ...form, prazoEntrega: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Condicao de pagamento" hint="Texto livre: e a frase que o cliente vai ler">
        <Input
          value={form.condicaoPagamento}
          placeholder="30/60/90 dias"
          onChange={(e) => setForm({ ...form, condicaoPagamento: e.target.value })}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void salvar()} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button variante="neutro" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
