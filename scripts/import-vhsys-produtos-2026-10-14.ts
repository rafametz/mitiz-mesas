/**
 * Importação única do cadastro de produtos do VHSYS (ADR 0009, Fase 3 —
 * "importação assistida por mim" em vez de tela de importador, pedido do
 * usuário 2026-10-14: "a gente gastar desenvolvimento para criar uma tela
 * [...] ao invés disso você mesmo analisar o arquivo e fazer a criação dos
 * produtos").
 *
 * Arquivo de origem: TABAELA DE PRODUTOS.xlsx (417 produtos, 30 colunas),
 * SHA-256 9d39f90daf2898410853d1056a12da5610dac72cdfde0798d66e2ade876c68c0.
 * Lido via scripts/_tmp-* (apagados após uso) que extraíram o XML interno
 * do .xlsx para C:\...\scratchpad\tabela-produtos.json — este script lê
 * esse JSON já parseado, não a planilha diretamente.
 *
 * Este é um script histórico de uma execução específica, não uma
 * ferramenta reutilizável — mantido no repositório como registro do que
 * foi feito (mesmo racional de uma migration: não roda de novo sozinho,
 * mas documenta uma mudança real de dados). Rodar de novo sem alterar
 * nada é seguro (idempotente: produtos combinam por sku real, categoria e
 * setor "Loja" são upsert), mas não há motivo pra rodar de novo com os
 * mesmos dados.
 *
 * Decisões do usuário (2026-10-14, continuação da ADR 0009):
 * 1. Produto já existente no MITIZ (correspondência por nome): nunca
 *    mexe em nome, preço, categoria, setor, unidade, disponível ou ativo.
 *    Só preenche os campos novos (sku, código de barras, marca, custo,
 *    estoque, fiscais, fornecedor, observações) quando estão vazios hoje.
 * 2. Produto novo (sem correspondência): categoria única "Loja", setor
 *    único "Loja" (sem impressão), `available: false` — a tela de novo
 *    pedido do garçom lista todo produto com available=true sem filtrar
 *    por setor, então um produto novo apareceria lá por engano se
 *    entrasse disponível. Preço vem direto da planilha (não há preço
 *    atual pra conflitar).
 * 3. "FANTA LARANJA LATA 350ml" está duplicada na planilha (FL0001 R$4,50
 *    e FLL0001 R$5,00) — usuário confirmou que o valor certo é R$5,00
 *    (FLL0001); FL0001 é ignorado nesta importação.
 * 4. Linha "TAXA DE SERVIÇO" (código vazio) não é produto — ignorada.
 * 5. COCA-COLA ZERO 1L (planilha) NÃO é o mesmo produto que "Coca Cola
 *    Zero 2L" (MITIZ) — usuário confirmou, entra como produto novo.
 * 6. Três pares de nome "parecido" confirmados pelo usuário como sendo o
 *    mesmo produto, vinculados manualmente aqui (nunca por heurística
 *    automática): "CONSERVAS BOM POTE" = "Conserva Bom Pote",
 *    "PORÇÃO LINGUIÇA DEFUMADA" = "Porção de Linguiça Defumada",
 *    "PORÇÃO PANCETA DEFUMADA" = "Porção de Panceta Defumada".
 *
 * Resultado fica registrado em ProductImportBatch/ProductImportRow
 * (schema da Fase 1), atribuído ao usuário admin real (Rafael), não à
 * conta de teste E2E.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { Prisma } from "@prisma/client";

const SHEET_JSON =
  "C:/Users/Dell/AppData/Local/Temp/claude/D--Usuario-Desktop-MITIZ-mitiz-mesas/840fa3a7-1858-4096-9dab-48fb99ae9a45/scratchpad/tabela-produtos.json";
const SHEET_FILE_NAME = "TABAELA DE PRODUTOS.xlsx";
const SHEET_FILE_HASH = "9d39f90daf2898410853d1056a12da5610dac72cdfde0798d66e2ade876c68c0";
const IMPORTED_BY_USER_ID = "cmsnea8h70001tuf4g766r9i3"; // Rafael (admin real)

const LOJA_CATEGORY_NAME = "Loja";
const LOJA_SECTOR_NAME = "Loja";

type SheetRow = (string | null)[];

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function trimmedOrNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function decimalOrNull(v: string | null | undefined, decimals: number): string | null {
  const t = trimmedOrNull(v);
  if (t === null) return null;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return n.toFixed(decimals);
}

function originOrNull(v: string | null | undefined): number | null {
  const t = trimmedOrNull(v);
  if (t === null || !/^[0-8]$/.test(t)) return null;
  return Number(t);
}

function supplierCodeOrNull(v: string | null | undefined): string | null {
  const t = trimmedOrNull(v);
  if (t === null || t === "0") return null;
  return t;
}

function unitOrDefault(v: string | null | undefined): string {
  const t = trimmedOrNull(v);
  if (t === null) return "UN";
  const upper = t.toUpperCase();
  if (upper === "UN" || upper === "KG") return upper;
  return t; // CX, FD, ou anomalia como "1" -- preservado como veio, nunca inventado
}

// Vínculos confirmados manualmente pelo usuário (decisão 6 acima) -- nome
// normalizado da planilha -> nome EXATO do produto no MITIZ (usado só
// para localizar o produto; o nome do produto nunca é alterado).
const CONFIRMED_LINKS: Record<string, string> = {
  [normalizeName("CONSERVAS BOM POTE")]: "Conserva Bom Pote",
  [normalizeName("PORÇÃO LINGUIÇA DEFUMADA")]: "Porção de Linguiça Defumada",
  [normalizeName("PORÇÃO PANCETA DEFUMADA")]: "Porção de Panceta Defumada",
};

type RowResult = {
  rowNumber: number;
  sku: string | null;
  productName: string;
  outcome: "CREATED" | "UPDATED" | "SKIPPED" | "REJECTED";
  reason: string | null;
  productId: string | null;
};

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  if (DRY_RUN) console.log("*** DRY_RUN=1 -- nenhuma escrita será feita ***\n");
  const { header, rows }: { header: string[]; rows: SheetRow[] } = JSON.parse(
    readFileSync(SHEET_JSON, "utf8"),
  );
  const col = (name: string) => header.indexOf(name);
  const idx = {
    codigo: col("Código do Produto (60)"),
    nome: col("Nome do Produto (120)"),
    fornecedor: col("Fornecedor"),
    idFornecedor: col("ID Fornecedor"),
    marca: col("Marca (25)"),
    estoqueMinimo: col("Estoque Mínimo"),
    estoqueAtual: col("Estoque Atual"),
    unidade: col("Unidade (06)"),
    valorVenda: col("Valor Venda (Tabela Padrão)"),
    valorCusto: col("Valor Custo"),
    peso: col("Peso"),
    pesoLiq: col("Peso Liq."),
    icms: col("ICMS"),
    ipi: col("IPI"),
    pis: col("PIS"),
    cofins: col("COFINS"),
    unidadeTributavel: col("Unidade tributável"),
    codigoBeneficioFiscal: col("Código Benefício Fiscal"),
    cest: col("Código CEST"),
    ncm: col("NCM (8)"),
    origem: col("Origem (0 a 8)"),
    codigoBarras: col("Código de Barras (GTIN-8,12,13,14)"),
    tipoClassFiscal: col("Tipo Class. (Fiscal)"),
    observacoes: col("Observações"),
    situacao: col("Situação (Ativo/Inativo)"),
  };

  const restaurant = await prisma.restaurant.findFirstOrThrow();

  const lojaCategory = DRY_RUN
    ? ((await prisma.category.findUnique({
        where: { restaurantId_name: { restaurantId: restaurant.id, name: LOJA_CATEGORY_NAME } },
      })) ?? { id: "(dry-run, ainda não existe)" })
    : await prisma.category.upsert({
        where: { restaurantId_name: { restaurantId: restaurant.id, name: LOJA_CATEGORY_NAME } },
        update: {},
        create: { restaurantId: restaurant.id, name: LOJA_CATEGORY_NAME, sortOrder: 999 },
      });
  const lojaSector = DRY_RUN
    ? ((await prisma.productionSector.findUnique({
        where: { restaurantId_name: { restaurantId: restaurant.id, name: LOJA_SECTOR_NAME } },
      })) ?? { id: "(dry-run, ainda não existe)" })
    : await prisma.productionSector.upsert({
        where: { restaurantId_name: { restaurantId: restaurant.id, name: LOJA_SECTOR_NAME } },
        update: {},
        create: {
          restaurantId: restaurant.id,
          name: LOJA_SECTOR_NAME,
          hasPrinting: false,
          sortOrder: 999,
        },
      });
  console.log(`Categoria "Loja": ${lojaCategory.id} | Setor "Loja": ${lojaSector.id}`);

  const existingProducts = await prisma.product.findMany({
    where: { restaurantId: restaurant.id },
  });
  const byNormName = new Map(existingProducts.map((p) => [normalizeName(p.name), p]));
  const byExactName = new Map(existingProducts.map((p) => [p.name, p]));

  const results: RowResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let rejected = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // linha 1 é o cabeçalho
    if (!row) continue;
    const codigo = trimmedOrNull(row[idx.codigo]);
    const nomeRaw = trimmedOrNull(row[idx.nome]);

    if (!codigo || !nomeRaw) {
      results.push({
        rowNumber,
        sku: codigo,
        productName: nomeRaw ?? "(sem nome)",
        outcome: "SKIPPED",
        reason:
          'Sem código de produto -- linha "TAXA DE SERVIÇO" do VHSYS, não é produto (ADR 0009).',
        productId: null,
      });
      skipped++;
      continue;
    }

    if (codigo === "FL0001") {
      results.push({
        rowNumber,
        sku: codigo,
        productName: nomeRaw,
        outcome: "SKIPPED",
        reason:
          'Duplicata de "FANTA LARANJA LATA 350ml" com preço desatualizado (R$4,50) -- usuário confirmou manter apenas FLL0001 (R$5,00).',
        productId: null,
      });
      skipped++;
      continue;
    }

    const normalized = normalizeName(nomeRaw);
    let existing = byNormName.get(normalized) ?? null;
    if (!existing && CONFIRMED_LINKS[normalized]) {
      existing = byExactName.get(CONFIRMED_LINKS[normalized]) ?? null;
    }

    // Campos novos opcionais, iguais para produto novo ou já existente.
    const newFields = {
      sku: codigo,
      barcode: trimmedOrNull(row[idx.codigoBarras]),
      brand: trimmedOrNull(row[idx.marca]),
      costPrice: decimalOrNull(row[idx.valorCusto], 2),
      stockQuantity: decimalOrNull(row[idx.estoqueAtual], 3),
      stockMinimum: decimalOrNull(row[idx.estoqueMinimo], 3),
      weight: decimalOrNull(row[idx.peso], 3),
      netWeight: decimalOrNull(row[idx.pesoLiq], 3),
      ncm: trimmedOrNull(row[idx.ncm]),
      cest: trimmedOrNull(row[idx.cest]),
      origin: originOrNull(row[idx.origem]),
      icmsRate: decimalOrNull(row[idx.icms], 2),
      ipiRate: decimalOrNull(row[idx.ipi], 2),
      pisRate: decimalOrNull(row[idx.pis], 2),
      cofinsRate: decimalOrNull(row[idx.cofins], 2),
      taxableUnit: trimmedOrNull(row[idx.unidadeTributavel]),
      fiscalBenefitCode: trimmedOrNull(row[idx.codigoBeneficioFiscal]),
      fiscalClassType: trimmedOrNull(row[idx.tipoClassFiscal]),
      supplierName: trimmedOrNull(row[idx.fornecedor]),
      supplierCode: supplierCodeOrNull(row[idx.idFornecedor]),
      importNotes: trimmedOrNull(row[idx.observacoes]),
    };

    try {
      if (existing) {
        // Produto já existente: nunca mexe em name/price/categoryId/
        // defaultSectorId/unit/available/active -- só preenche o que
        // estiver vazio hoje (decisão 1).
        const data: Prisma.ProductUpdateInput = {
          sku: existing.sku ?? newFields.sku,
          barcode: existing.barcode ?? newFields.barcode,
          brand: existing.brand ?? newFields.brand,
          costPrice: existing.costPrice ?? newFields.costPrice,
          stockQuantity: existing.stockQuantity ?? newFields.stockQuantity,
          stockMinimum: existing.stockMinimum ?? newFields.stockMinimum,
          weight: existing.weight ?? newFields.weight,
          netWeight: existing.netWeight ?? newFields.netWeight,
          ncm: existing.ncm ?? newFields.ncm,
          cest: existing.cest ?? newFields.cest,
          origin: existing.origin ?? newFields.origin,
          icmsRate: existing.icmsRate ?? newFields.icmsRate,
          ipiRate: existing.ipiRate ?? newFields.ipiRate,
          pisRate: existing.pisRate ?? newFields.pisRate,
          cofinsRate: existing.cofinsRate ?? newFields.cofinsRate,
          taxableUnit: existing.taxableUnit ?? newFields.taxableUnit,
          fiscalBenefitCode: existing.fiscalBenefitCode ?? newFields.fiscalBenefitCode,
          fiscalClassType: existing.fiscalClassType ?? newFields.fiscalClassType,
          supplierName: existing.supplierName ?? newFields.supplierName,
          supplierCode: existing.supplierCode ?? newFields.supplierCode,
          importNotes: existing.importNotes ?? newFields.importNotes,
        };
        const updatedProduct = DRY_RUN
          ? existing
          : await prisma.product.update({ where: { id: existing.id }, data });
        results.push({
          rowNumber,
          sku: codigo,
          productName: existing.name,
          outcome: "UPDATED",
          reason: `Correspondido com produto existente "${existing.name}" (nome, preço, categoria e setor preservados).`,
          productId: updatedProduct.id,
        });
        updated++;
      } else {
        const price = decimalOrNull(row[idx.valorVenda], 2);
        if (price === null) {
          results.push({
            rowNumber,
            sku: codigo,
            productName: nomeRaw,
            outcome: "REJECTED",
            reason: "Sem preço de venda válido na planilha.",
            productId: null,
          });
          rejected++;
          continue;
        }
        const situacao = trimmedOrNull(row[idx.situacao]);
        const created_ = DRY_RUN
          ? { id: "(dry-run)" }
          : await prisma.product.create({
              data: {
                restaurantId: restaurant.id,
                categoryId: lojaCategory.id,
                defaultSectorId: lojaSector.id,
                name: nomeRaw,
                price,
                unit: unitOrDefault(row[idx.unidade]),
                available: false,
                active: situacao !== "Inativo",
                ...newFields,
              },
            });
        results.push({
          rowNumber,
          sku: codigo,
          productName: nomeRaw,
          outcome: "CREATED",
          reason: null,
          productId: created_.id,
        });
        created++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        rowNumber,
        sku: codigo,
        productName: nomeRaw,
        outcome: "REJECTED",
        reason: message.slice(0, 500),
        productId: null,
      });
      rejected++;
    }
  }

  const batch = DRY_RUN
    ? { id: "(dry-run)" }
    : await prisma.productImportBatch.create({
        data: {
          restaurantId: restaurant.id,
          fileName: SHEET_FILE_NAME,
          fileHash: SHEET_FILE_HASH,
          importedById: IMPORTED_BY_USER_ID,
          status: "COMPLETED",
          totalRows: rows.length,
          createdCount: created,
          updatedCount: updated,
          skippedCount: skipped,
          rejectedCount: rejected,
          confirmedAt: new Date(),
          finishedAt: new Date(),
        },
      });
  if (!DRY_RUN) {
    await prisma.productImportRow.createMany({
      data: results.map((r) => ({
        batchId: batch.id,
        rowNumber: r.rowNumber,
        sku: r.sku,
        productName: r.productName,
        outcome: r.outcome,
        reason: r.reason,
        productId: r.productId,
      })),
    });
  }

  console.log(`\nLote: ${batch.id}`);
  console.log(
    `Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped} | Rejeitados: ${rejected}`,
  );
  console.log(
    `Total processado: ${created + updated + skipped + rejected} (planilha tinha ${rows.length} linhas)`,
  );

  const rejectedRows = results.filter((r) => r.outcome === "REJECTED");
  if (rejectedRows.length > 0) {
    console.log("\n=== Rejeitados ===");
    for (const r of rejectedRows)
      console.log(`linha ${r.rowNumber} | ${r.productName} | ${r.reason}`);
  }
  console.log("\n=== Atualizados (correspondidos) ===");
  for (const r of results.filter((r) => r.outcome === "UPDATED")) {
    console.log(`linha ${r.rowNumber} | ${r.sku} | ${r.productName}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().then(() => process.exit()));
