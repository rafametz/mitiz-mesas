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

// Seções conforme ADR 0009, seção 5 — compartilhado entre o formulário de
// criação e o de edição, pra não duplicar ~150 linhas de JSX entre os dois
// (mesmo racional de ReservationCard/DeliverButton reaproveitados). Cada
// `<input>` carrega seu próprio `name`; quem envolve este componente só
// precisa de um `<form action=...>` e botão de envio por fora.
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-ink">Dados gerais</h2>
        <Card className="flex flex-col gap-4">
          <TextField label="Nome" name="name" defaultValue={defaults.name} required maxLength={120} />
          <TextAreaField
            label="Descrição (opcional)"
            name="description"
            defaultValue={defaults.description}
            maxLength={500}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Código (opcional)"
              name="sku"
              defaultValue={defaults.sku}
              maxLength={60}
              hint="Código interno — nunca inventado, só o que já existir"
            />
            <TextField
              label="Código de barras (opcional)"
              name="barcode"
              defaultValue={defaults.barcode}
              maxLength={14}
              inputMode="numeric"
              hint="GTIN-8, 12, 13 ou 14"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="Marca (opcional)" name="brand" defaultValue={defaults.brand} maxLength={25} />
            <SelectField label="Unidade" name="unit" defaultValue={defaults.unit} required>
              {UNIT_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </SelectField>
          </div>
          <SelectField
            label="Categoria"
            name="categoryId"
            defaultValue={defaults.categoryId}
            required
          >
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
          <div className="flex flex-col gap-2">
            <CheckboxField label="Disponível" name="available" defaultChecked={defaults.available} />
            <CheckboxField label="Ativo" name="active" defaultChecked={defaults.active} />
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-ink">Preços</h2>
        <Card className="flex flex-col gap-4">
          <MoneyField label="Preço de venda" name="price" defaultValue={defaults.price} />
          <MoneyField label="Custo (opcional)" name="costPrice" defaultValue={defaults.costPrice} />
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-ink">Estoque</h2>
        <Card className="flex flex-col gap-4">
          <TextField
            label="Estoque atual (opcional)"
            name="stockQuantity"
            defaultValue={defaults.stockQuantity}
            inputMode="decimal"
            hint="Deixe em branco se não controla estoque deste produto. Aceita negativo."
          />
          <TextField
            label="Estoque mínimo (opcional)"
            name="stockMinimum"
            defaultValue={defaults.stockMinimum}
            inputMode="decimal"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Peso (kg, opcional)"
              name="weight"
              defaultValue={defaults.weight}
              inputMode="decimal"
            />
            <TextField
              label="Peso líquido (kg, opcional)"
              name="netWeight"
              defaultValue={defaults.netWeight}
              inputMode="decimal"
            />
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Dados fiscais</h2>
          <p className="text-xs text-muted">
            Preparação para uma futura emissão de NFC-e/NF-e — nenhum destes campos é usado em
            nenhum fluxo do sistema hoje.
          </p>
        </div>
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="NCM (opcional)" name="ncm" defaultValue={defaults.ncm} maxLength={8} />
            <TextField label="CEST (opcional)" name="cest" defaultValue={defaults.cest} maxLength={10} />
          </div>
          <TextField
            label="Origem (opcional)"
            name="origin"
            defaultValue={defaults.origin}
            inputMode="numeric"
            maxLength={1}
            hint="0 a 8 — tabela de origem da mercadoria"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="ICMS % (opcional)"
              name="icmsRate"
              defaultValue={defaults.icmsRate}
              inputMode="decimal"
            />
            <TextField
              label="IPI % (opcional)"
              name="ipiRate"
              defaultValue={defaults.ipiRate}
              inputMode="decimal"
            />
            <TextField
              label="PIS % (opcional)"
              name="pisRate"
              defaultValue={defaults.pisRate}
              inputMode="decimal"
            />
            <TextField
              label="COFINS % (opcional)"
              name="cofinsRate"
              defaultValue={defaults.cofinsRate}
              inputMode="decimal"
            />
          </div>
          <TextField
            label="Unidade tributável (opcional)"
            name="taxableUnit"
            defaultValue={defaults.taxableUnit}
            maxLength={10}
          />
          <TextField
            label="Código de benefício fiscal (opcional)"
            name="fiscalBenefitCode"
            defaultValue={defaults.fiscalBenefitCode}
            maxLength={20}
          />
          <TextField
            label="Classificação fiscal (opcional)"
            name="fiscalClassType"
            defaultValue={defaults.fiscalClassType}
            maxLength={20}
          />
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-ink">Fornecedor</h2>
        <Card className="flex flex-col gap-4">
          <TextField
            label="Nome do fornecedor (opcional)"
            name="supplierName"
            defaultValue={defaults.supplierName}
            maxLength={120}
          />
          <TextField
            label="Código do fornecedor (opcional)"
            name="supplierCode"
            defaultValue={defaults.supplierCode}
            maxLength={60}
          />
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-ink">Informações adicionais</h2>
        <Card className="flex flex-col gap-4">
          <TextAreaField
            label="Observações (opcional)"
            name="importNotes"
            defaultValue={defaults.importNotes}
            maxLength={500}
          />
        </Card>
      </div>
    </div>
  );
}
