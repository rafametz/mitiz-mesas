-- Cadastro de produtos ampliado + trilha de auditoria da importação VHSYS
-- (ADR 0009, aprovada 2026-10-14 — Fase 1 do plano de implementação).
-- Ver prisma/schema.prisma (model Product, model Category, enums e models
-- novos) e docs/architecture/decisions/0009-cadastro-produtos-ampliado-e-importacao-vhsys.md
-- para o racional completo. Só esta fase (schema) foi implementada agora;
-- a tela ampliada e o importador em si vêm nas próximas fases.
--
-- Todas as colunas novas de "products" são opcionais (exceto "unit", que
-- tem default) — nenhum produto existente precisa ser preenchido
-- retroativamente, e nenhuma coluna/constraint existente foi alterada.
--
-- Gerado com `prisma migrate diff --from-url <DIRECT_URL> --to-schema-datamodel
-- prisma/schema.prisma --script` contra o banco de produção e revisado à
-- mão antes de aplicar (mesmo processo documentado em docs/database/schema.md
-- §7, já que `prisma migrate dev` não funciona neste ambiente por causa do
-- shadow database). Uma linha "DROP INDEX service_sessions_restaurantId_idx"
-- que o diff também gerou foi removida deste arquivo por não ter nenhuma
-- relação com esta mudança — é deriva pré-existente entre schema e banco em
-- outra parte do sistema (o índice veio da migration
-- 20260814120000_pickup_sessions e não está mais declarado no schema atual),
-- fora do escopo desta ADR.

-- CreateEnum
CREATE TYPE "ProductImportBatchStatus" AS ENUM ('PENDING', 'SIMULATED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductImportRowOutcome" AS ENUM ('CREATED', 'UPDATED', 'SKIPPED', 'REJECTED');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "externalCode" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "cest" TEXT,
ADD COLUMN     "cofinsRate" DECIMAL(5,2),
ADD COLUMN     "costPrice" DECIMAL(10,2),
ADD COLUMN     "fiscalBenefitCode" TEXT,
ADD COLUMN     "fiscalClassType" TEXT,
ADD COLUMN     "icmsRate" DECIMAL(5,2),
ADD COLUMN     "importNotes" TEXT,
ADD COLUMN     "ipiRate" DECIMAL(5,2),
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "netWeight" DECIMAL(10,3),
ADD COLUMN     "origin" INTEGER,
ADD COLUMN     "pisRate" DECIMAL(5,2),
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "stockMinimum" DECIMAL(10,3),
ADD COLUMN     "stockQuantity" DECIMAL(10,3),
ADD COLUMN     "supplierCode" TEXT,
ADD COLUMN     "supplierName" TEXT,
ADD COLUMN     "taxableUnit" TEXT,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'UN',
ADD COLUMN     "weight" DECIMAL(10,3);

-- CreateTable
CREATE TABLE "product_import_batches" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "status" "ProductImportBatchStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "product_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_import_rows" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sku" TEXT,
    "productName" TEXT NOT NULL,
    "outcome" "ProductImportRowOutcome" NOT NULL,
    "reason" TEXT,
    "productId" TEXT,

    CONSTRAINT "product_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_import_batches_restaurantId_idx" ON "product_import_batches"("restaurantId");

-- CreateIndex
CREATE INDEX "product_import_rows_batchId_idx" ON "product_import_rows"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_restaurantId_externalCode_key" ON "categories"("restaurantId", "externalCode");

-- CreateIndex
CREATE UNIQUE INDEX "products_restaurantId_sku_key" ON "products"("restaurantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_restaurantId_barcode_key" ON "products"("restaurantId", "barcode");

-- AddForeignKey
ALTER TABLE "product_import_batches" ADD CONSTRAINT "product_import_batches_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_import_batches" ADD CONSTRAINT "product_import_batches_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_import_rows" ADD CONSTRAINT "product_import_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "product_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_import_rows" ADD CONSTRAINT "product_import_rows_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
