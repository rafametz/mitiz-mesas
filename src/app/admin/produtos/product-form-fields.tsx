import { ChevronDown } from "lucide-react";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/form/field";
import { MoneyField } from "@/components/form/money-field";
import { Card } from "@/components/ui/card";

type Option = { id: string; name: string };

// Unidades de venda mais comuns (ADR 0009, seção 2 — a exportação real da
// VHSYS tinha UN/KG dominando, com CX/FD pontuais). Texto livre não é um
// risco real de inconsistência aqui porque é sempre a própria pessoa do
// MITIZ escolhendo, não uma planilha externa — por isso um select fechado
// em vez de um campo de texto.
const UNIT_OPTIONS = ["UN", "KG", "L", "CX", "FD"];

export type ProductFormDefaults = {
  name: string;
  description: string;
  sku: string;
  barcode: string;
  brand: string;
  unit: string;
  categoryId: string;
  defaultSectorId: string;
  available: boolean;
  active: boolean;
  price: string;
  costPrice: string;
  stockQuantity: string;
  stockMinimum: string;
  weight: string;
  netWeight: string;
  ncm: string;
  cest: string;
  origin: string;
  icmsRate: string;
  ipiRate: string;
  pisRate: string;
  cofinsRate: string;
  taxableUnit: string;
  fiscalBenefitCode: string;
  fiscalClassType: string;
  supplierName: string;
  supplierCode: string;
  importNotes: string;
};

// Produto novo: tudo em branco, exceto o que já tem um valor natural
// (unidade "UN", disponível/ativo marcados) — mesmo comportamento que o
// formulário de criação já tinha antes desta ampliação.
export const EMPTY_PRODUCT_DEFAULTS: ProductFormDefaults = {
  name: "",
  description: "",
  sku: "",
  barcode: "",
  brand: "",
  unit: "UN",
  categoryId: "",
  defaultSectorId: "",
  available: true,
  active: true,
  price: "",
  costPrice: "",
  stockQuantity: "",
  stockMinimum: "",
  weight: "",
  netWeight: "",
  ncm: "",
  cest: "",
  origin: "",
  icmsRate: "",
  ipiRate: "",
  pisRate: "",
  cofinsRate: "",
  taxableUnit: "",
  fiscalBenefitCode: "",
  fiscalClassType: "",
  supplierName: "",
  supplierCode: "",
  importNotes: "",
};

// <details>/<summary> nativo em vez de um Accordion com estado em React —
// não precisa de JS pra funcionar, não tem risco de hydration mismatch, e
// dá foco/teclado de graça. Sempre começa fechado, mesmo editando um
// produto que já tenha dado preenchido nela (pedido explícito do usuário,
// 2026-11-05 — versão anterior abria sozinha quando havia dado; ele
// preferiu sempre fechado ao entrar na página, sem exceção). Depois da
// carga quem controla é a própria pessoa clicando, igual qualquer
// <details> nativo.
function CollapsibleSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-card border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div>
          <span className="text-sm font-semibold text-ink">{title}</span>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-line p-4">{children}</div>
    </details>
  );
}

// Repaginação 2026-11-05 (pedido do usuário, com prints do VHSys de
// referência): antes era uma pilha vertical de 6 seções sempre abertas,
// cada uma com seu próprio <Card> — pra editar o preço era preciso rolar
// a tela inteira até o fim pra achar o botão Salvar. Agora só os campos
// que a própria pessoa descreveu como "o que eu geralmente preencho"
// (nome, código, código de barras, marca, unidade, categoria, setor,
// preço, custo) ficam sempre visíveis, num quadrante só, em grade —
// Estoque/Fiscais/Fornecedor/Observações viram seções recolhidas, sempre
// fechadas ao entrar na página (ajuste do usuário depois da primeira
// versão, que abria sozinha quando já havia dado preenchido). NCM e os
// demais campos fiscais continuam dentro de "Dados fiscais" (não
// promovidos pro quadrante principal como no VHSys) porque, nesta
// aplicação, nenhum deles é usado em fluxo nenhum ainda (mesma nota que
// já existia antes desta repaginação) — diferente do VHSys, aqui eles não
// são "o que se preenche sempre". "Formador de Preço" do VHSys não existe
// aqui (sem motor de precificação no domínio hoje), não foi reproduzido.
//
// Rótulos sem "(opcional)" (ajuste do usuário): só o obrigatório carrega
// marcação agora — asterisco vermelho, de graça via TextField/SelectField
// (ver src/components/form/field.tsx) sempre que `required` é passado.
export function ProductFormFields({
  defaults,
  categories,
  sectors,
}: {
  defaults: ProductFormDefaults;
  categories: Option[];
  sectors: Option[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <TextField label="Nome" name="name" defaultValue={defaults.name} required maxLength={120} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Código"
            name="sku"
            defaultValue={defaults.sku}
            maxLength={60}
            hint="Código interno — nunca inventado, só o que já existir"
          />
          <TextField
            label="Código de barras"
            name="barcode"
            defaultValue={defaults.barcode}
            maxLength={14}
            inputMode="numeric"
            hint="GTIN-8, 12, 13 ou 14"
          />
          <TextField label="Marca" name="brand" defaultValue={defaults.brand} maxLength={25} />
          <SelectField label="Unidade" name="unit" defaultValue={defaults.unit} required>
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Categoria" name="categoryId" defaultValue={defaults.categoryId} required>
            {!defaults.categoryId && (
              <option value="" disabled>
                Selecione
              </option>
            )}
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Setor de destino"
            name="defaultSectorId"
            defaultValue={defaults.defaultSectorId}
            required
          >
            {!defaults.defaultSectorId && (
              <option value="" disabled>
                Selecione
              </option>
            )}
            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MoneyField label="Preço de venda" name="price" defaultValue={defaults.price} />
          <MoneyField label="Custo" name="costPrice" defaultValue={defaults.costPrice} />
        </div>

        <TextAreaField
          label="Descrição"
          name="description"
          defaultValue={defaults.description}
          maxLength={500}
        />

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <CheckboxField label="Disponível" name="available" defaultChecked={defaults.available} />
          <CheckboxField label="Ativo" name="active" defaultChecked={defaults.active} />
        </div>
      </Card>

      <CollapsibleSection title="Estoque" hint="Opcional">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Estoque atual"
            name="stockQuantity"
            defaultValue={defaults.stockQuantity}
            inputMode="decimal"
            hint="Deixe em branco se não controla estoque deste produto. Aceita negativo."
          />
          <TextField
            label="Estoque mínimo"
            name="stockMinimum"
            defaultValue={defaults.stockMinimum}
            inputMode="decimal"
          />
          <TextField
            label="Peso (kg)"
            name="weight"
            defaultValue={defaults.weight}
            inputMode="decimal"
          />
          <TextField
            label="Peso líquido (kg)"
            name="netWeight"
            defaultValue={defaults.netWeight}
            inputMode="decimal"
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Dados fiscais"
        hint="Preparação para uma futura emissão de NFC-e/NF-e — nenhum destes campos é usado em nenhum fluxo do sistema hoje."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="NCM" name="ncm" defaultValue={defaults.ncm} maxLength={8} />
          <TextField label="CEST" name="cest" defaultValue={defaults.cest} maxLength={10} />
          <TextField
            label="Origem"
            name="origin"
            defaultValue={defaults.origin}
            inputMode="numeric"
            maxLength={1}
            hint="0 a 8"
          />
          <TextField
            label="Unidade tributável"
            name="taxableUnit"
            defaultValue={defaults.taxableUnit}
            maxLength={10}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="ICMS %"
            name="icmsRate"
            defaultValue={defaults.icmsRate}
            inputMode="decimal"
          />
          <TextField
            label="IPI %"
            name="ipiRate"
            defaultValue={defaults.ipiRate}
            inputMode="decimal"
          />
          <TextField
            label="PIS %"
            name="pisRate"
            defaultValue={defaults.pisRate}
            inputMode="decimal"
          />
          <TextField
            label="COFINS %"
            name="cofinsRate"
            defaultValue={defaults.cofinsRate}
            inputMode="decimal"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Código de benefício fiscal"
            name="fiscalBenefitCode"
            defaultValue={defaults.fiscalBenefitCode}
            maxLength={20}
          />
          <TextField
            label="Classificação fiscal"
            name="fiscalClassType"
            defaultValue={defaults.fiscalClassType}
            maxLength={20}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Fornecedor" hint="Opcional">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Nome do fornecedor"
            name="supplierName"
            defaultValue={defaults.supplierName}
            maxLength={120}
          />
          <TextField
            label="Código do fornecedor"
            name="supplierCode"
            defaultValue={defaults.supplierCode}
            maxLength={60}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Informações adicionais" hint="Opcional">
        <TextAreaField
          label="Observações"
          name="importNotes"
          defaultValue={defaults.importNotes}
          maxLength={500}
        />
      </CollapsibleSection>
    </div>
  );
}
