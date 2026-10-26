import type { CamposStarlink as Campos, EstruturaEsteira, VinculoDetalhe } from '../../lib/esteiraTypes';
import { BotaoTriEstado } from './BotaoTriEstado';
import { CampoData, CampoSelecao, Secao } from './camposUi';
import { campoEditavel } from './gavetaVinculo';

type TriEstado = 'cnpjApto' | 'mei' | 'altCnae' | 'vsm' | 'treinamento' | 'parceiro' | 'contrato' | 'prontoVenda' | 'perdido';

const TRILHO: ReadonlyArray<{ campo: TriEstado; rotulo: string; dica?: string }> = [
  { campo: 'cnpjApto', rotulo: 'CNPJ apto', dica: 'Leva a Em credenciamento' },
  { campo: 'vsm', rotulo: 'VSM' },
];
const DEPOIS_DA_VIVENSIS: ReadonlyArray<{ campo: TriEstado; rotulo: string; dica?: string }> = [
  { campo: 'treinamento', rotulo: 'Treinamento', dica: 'Exige CNPJ apto, VSM e Vivensis aprovado' },
  { campo: 'parceiro', rotulo: 'Parceiro (convertido)' },
  { campo: 'contrato', rotulo: 'Contrato assinado' },
  { campo: 'prontoVenda', rotulo: 'Pronto p/ venda' },
];
const DESVIOS: ReadonlyArray<{ campo: TriEstado; rotulo: string }> = [
  { campo: 'mei', rotulo: 'Quer abrir MEI' },
  { campo: 'altCnae', rotulo: 'Alteração de CNAE' },
];

/**
 * Campos da Starlink (spec 4.6/5.2). A etapa é derivada no servidor: cada
 * gravação devolve o vínculo com a etapa nova. Tri-estado com `BotaoTriEstado`
 * (clicar no ativo volta a vazio); nada aqui converte `null` em NÃO.
 */
export function CamposStarlink({
  vinculo,
  estrutura,
  leitura,
  salvarCampos,
}: {
  vinculo: VinculoDetalhe;
  estrutura: EstruturaEsteira;
  leitura: boolean;
  salvarCampos: (campos: Partial<Campos>) => void;
}) {
  const c = vinculo.campos as Campos;
  const pode = (nome: keyof Campos) => !leitura && campoEditavel(estrutura.colunas, nome);
  const opcoes = (chave: string) => estrutura.colunas.find((col) => col.chave === chave)?.opcoes ?? [];
  const tri = (item: { campo: TriEstado; rotulo: string; dica?: string }) => (
    <BotaoTriEstado
      key={item.campo}
      rotulo={item.rotulo}
      dica={item.dica}
      valor={c[item.campo]}
      desabilitado={!pode(item.campo)}
      aoMudar={(v) => salvarCampos({ [item.campo]: v })}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <Secao titulo="Entrada">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <CampoSelecao
            rotulo="Captação"
            valor={c.tipoCaptacao}
            opcoes={opcoes('tipoCaptacao')}
            desabilitado={!pode('tipoCaptacao')}
            aoSalvar={(v) => salvarCampos({ tipoCaptacao: v as Campos['tipoCaptacao'] })}
          />
          <CampoData
            rotulo="Primeiro contato"
            valor={c.primeiroContatoEm}
            desabilitado={!pode('primeiroContatoEm')}
            dica="A primeira nota também registra o contato."
            aoSalvar={(v) => salvarCampos({ primeiroContatoEm: v })}
          />
        </div>
      </Secao>

      <Secao titulo="Credenciamento">
        <div className="divide-y divide-slate-100">{TRILHO.map(tri)}</div>
        <CampoSelecao
          rotulo="Vivensis"
          valor={c.vivensisStatus}
          opcoes={opcoes('vivensisStatus')}
          desabilitado={!pode('vivensisStatus')}
          dica="Reprovado marca o parceiro como perdido (motivo: Reprovado na Vivensis)."
          aoSalvar={(v) => salvarCampos({ vivensisStatus: v as Campos['vivensisStatus'] })}
        />
      </Secao>

      <Secao titulo="Trilho">
        <div className="divide-y divide-slate-100">{DEPOIS_DA_VIVENSIS.map(tri)}</div>
      </Secao>

      <Secao titulo="Desvios">
        <div className="divide-y divide-slate-100">{DESVIOS.map(tri)}</div>
      </Secao>

      <Secao titulo="Perda">
        {tri({ campo: 'perdido', rotulo: 'Perdido', dica: 'Sim pede o motivo; Não reabre e limpa o motivo' })}
        <CampoSelecao
          rotulo="Motivo da perda"
          valor={c.motivoPerda}
          opcoes={estrutura.motivosPerda.map((m) => ({
            valor: m.valor,
            rotulo: `${m.rotulo} (${m.classe === 'RECUPERAVEL' ? 'Nurture' : 'Descartado'})`,
          }))}
          semVazio
          desabilitado={!pode('motivoPerda') || c.perdido !== true}
          dica={c.perdido === true ? 'A classe do motivo decide entre Nurture e Descartado.' : 'Só para parceiro perdido.'}
          aoSalvar={(v) => v && salvarCampos({ motivoPerda: v as Campos['motivoPerda'] })}
        />
      </Secao>
    </div>
  );
}
