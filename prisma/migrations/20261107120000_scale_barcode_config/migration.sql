-- Configuração de leitura de código de barras gerado por balança (PDV por
-- quilo, pedido do usuário 2026-11-07, primeira etapa: só a configuração).
-- Singleton por restaurante (restaurantId único) — ver comentário completo
-- em prisma/schema.prisma, model ScaleBarcodeConfig.
--
-- RLS habilitado já nesta migration (mesma lição de combined_checkouts,
-- 2026-10-15 — nunca deixar uma tabela nova sem RLS na migration que a cria).

-- CreateEnum
CREATE TYPE "ScaleBarcodeValueType" AS ENUM ('WEIGHT', 'PRICE');

-- CreateTable
CREATE TABLE "scale_barcode_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "prefixDigit" INTEGER NOT NULL,
    "totalLength" INTEGER NOT NULL,
    "productCodeStart" INTEGER NOT NULL,
    "productCodeEnd" INTEGER NOT NULL,
    "valueStart" INTEGER NOT NULL,
    "valueEnd" INTEGER NOT NULL,
    "valueType" "ScaleBarcodeValueType" NOT NULL DEFAULT 'WEIGHT',
    "decimalPlaces" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scale_barcode_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scale_barcode_configs_restaurantId_key" ON "scale_barcode_configs"("restaurantId");

-- AddForeignKey
ALTER TABLE "scale_barcode_configs" ADD CONSTRAINT "scale_barcode_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (deny-by-default, sem política) -- acesso de verdade continua só
-- pelo Prisma (credenciais de banco da aplicação, não sujeitas a RLS).
ALTER TABLE "scale_barcode_configs" ENABLE ROW LEVEL SECURITY;
