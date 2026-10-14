import { Prisma } from "@prisma/client";
import { z } from "zod";

// Validação do formulário de produto (ADR 0009) — módulo de domínio puro,
// sem nenhum import do Next (CLAUDE.md §13: domínio separado de
// apresentação), pra poder ser testado direto, sem contexto de requisição.
// `src/app/admin/produtos/actions.ts` só chama `parseProductFormData` e
// `uniqueConstraintMessage`.

// Preço/custo/taxas como string (não number) até virarem o Decimal do
// Prisma — evita qualquer arredondamento de ponto flutuante no caminho
// (regra 20/21 do CLAUDE.md). O próprio Decimal do Prisma valida a
// precisão no banco.
const priceRegex = /^\d+(\.\d{1,2})?$/;
// Estoque/peso usam 3 casas (ADR 0009 — a planilha real da VHSYS tem
// estoque com até 3 casas decimais). stockQuantity aceita negativo de
// propósito: estoque desatualizado no sistema anterior é um dado real, não
// um erro de digitação (não "conserta" sozinho).
const decimal3Regex = /^\d+(\.\d{1,3})?$/;
const decimal3SignedRegex = /^-?\d+(\.\d{1,3})?$/;
// GTIN-8/12/13/14 — comprimentos reais de código de barras. Diferente do
// importador (ADR 0009, que aceita e só alerta formato fora do padrão para
// não perder dado da planilha), aqui é cadastro manual: vale validar
// direito, já que é a pessoa digitando agora.
const barcodeRegex = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/;

// Transforma vazio em `null`, nunca `undefined`: no `update` do Prisma, um
// campo `undefined` em `data` é tratado como "nem mencionado" e o valor
// antigo sobrevive — `null` é o único jeito de limpar de verdade um campo
// opcional que a pessoa apagou do formulário de edição.
// `.nullable()` além de `.optional()`: na prática `formData.get(name)`
// nunca devolve `null` de verdade (todo campo opcional sempre é um
// `<input>` presente, só vazio) — mas aceitar os dois é estritamente mais
// permissivo e sem custo, então não há razão pra travar numa suposição.
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));
}

function optionalDecimal(regex: RegExp, message: string) {
  return z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || regex.test(v), message);
}

export const productSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(120),
  description: optionalText(500),

  // Dados gerais (ADR 0009, seção 5) — nenhum é exclusivo de produto
  // importado, servem igual para cadastro manual.
  sku: optionalText(60),
  barcode: optionalDecimal(barcodeRegex, "Código de barras inválido — use 8, 12, 13 ou 14 dígitos"),
  brand: optionalText(25),
  unit: z.string().trim().min(1, "Selecione a unidade").max(10),
  categoryId: z.string().min(1, "Categoria é obrigatória"),
  defaultSectorId: z.string().min(1, "Setor é obrigatório"),
  available: z.boolean(),
  active: z.boolean(),

  // Preços
  price: z.string().trim().regex(priceRegex, "Preço inválido, use até 2 casas decimais"),
  costPrice: optionalDecimal(priceRegex, "Custo inválido, use até 2 casas decimais"),

  // Estoque
  stockQuantity: optionalDecimal(decimal3SignedRegex, "Estoque inválido, use até 3 casas decimais"),
  stockMinimum: optionalDecimal(decimal3Regex, "Estoque mínimo inválido, use até 3 casas decimais"),
  weight: optionalDecimal(decimal3Regex, "Peso inválido, use até 3 casas decimais"),
  netWeight: optionalDecimal(decimal3Regex, "Peso líquido inválido, use até 3 casas decimais"),

  // Dados fiscais — reservados para uma futura emissão de NFC-e/NF-e
  // (CLAUDE.md §21), não usados em nenhum fluxo hoje.
  ncm: optionalText(8),
  cest: optionalText(10),
  origin: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-8]$/.test(v), "Origem deve ser um número de 0 a 8")
    .transform((v) => (v === null ? null : Number(v))),
  icmsRate: optionalDecimal(priceRegex, "ICMS inválido, use até 2 casas decimais"),
  ipiRate: optionalDecimal(priceRegex, "IPI inválido, use até 2 casas decimais"),
  pisRate: optionalDecimal(priceRegex, "PIS inválido, use até 2 casas decimais"),
  cofinsRate: optionalDecimal(priceRegex, "COFINS inválido, use até 2 casas decimais"),
  taxableUnit: optionalText(10),
  fiscalBenefitCode: optionalText(20),
  fiscalClassType: optionalText(20),

  // Fornecedor — só informativo nesta etapa (ADR 0009, seção 9).
  supplierName: optionalText(120),
  supplierCode: optionalText(60),

  // Informações adicionais
  importNotes: optionalText(500),
});

export type ProductFormData = z.infer<typeof productSchema>;

export function parseProductFormData(formData: FormData): ProductFormData {
  return productSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    sku: formData.get("sku"),
    barcode: formData.get("barcode"),
    brand: formData.get("brand"),
    unit: formData.get("unit"),
    categoryId: formData.get("categoryId"),
    defaultSectorId: formData.get("defaultSectorId"),
    available: formData.get("available") === "on",
    active: formData.get("active") === "on",
    price: formData.get("price"),
    costPrice: formData.get("costPrice"),
    stockQuantity: formData.get("stockQuantity"),
    stockMinimum: formData.get("stockMinimum"),
    weight: formData.get("weight"),
    netWeight: formData.get("netWeight"),
    ncm: formData.get("ncm"),
    cest: formData.get("cest"),
    origin: formData.get("origin"),
    icmsRate: formData.get("icmsRate"),
    ipiRate: formData.get("ipiRate"),
    pisRate: formData.get("pisRate"),
    cofinsRate: formData.get("cofinsRate"),
    taxableUnit: formData.get("taxableUnit"),
    fiscalBenefitCode: formData.get("fiscalBenefitCode"),
    fiscalClassType: formData.get("fiscalClassType"),
    supplierName: formData.get("supplierName"),
    supplierCode: formData.get("supplierCode"),
    importNotes: formData.get("importNotes"),
  });
}

export function firstZodMessage(error: unknown): string | null {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? null;
  return null;
}

// sku/barcode são únicos por restaurante quando preenchidos (schema —
// migration 20261014120000). Mensagem específica por campo em vez do erro
// genérico do Prisma, pra quem está cadastrando saber exatamente o que
// corrigir.
export function uniqueConstraintMessage(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }
  const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
  if (target.includes("sku")) return "Já existe um produto com este código.";
  if (target.includes("barcode")) return "Já existe um produto com este código de barras.";
  return "Já existe um produto com esses dados.";
}
