-- Módulo Reservas de Assados (2026-09-29). Ver prisma/schema.prisma
-- (modelos RoastProduct, RoastProductionDay, RoastProduction,
-- RoastReservation, RoastReservationItem, enum RoastReservationStatus) e
-- docs/architecture/decisions/0008-reservas-de-assados.md para o racional
-- completo. Módulo aditivo, independente de Table/ServiceSession/Order —
-- nenhuma tabela existente é alterada aqui.

CREATE TYPE "RoastReservationStatus" AS ENUM ('PENDING', 'DELIVERED', 'CANCELLED');

-- 1. Catálogo de produtos assados (côstela, panceta, cupim, maminha...).
CREATE TABLE "roast_products" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "roast_products_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "roast_products"
  ADD CONSTRAINT "roast_products_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "roast_products_restaurantId_name_key" ON "roast_products"("restaurantId", "name");

-- 2. Dia de produção configurado pelo administrador ("AAAA-MM-DD",
--    America/Sao_Paulo).
CREATE TABLE "roast_production_days" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "roast_production_days_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "roast_production_days"
  ADD CONSTRAINT "roast_production_days_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "roast_production_days_restaurantId_date_key" ON "roast_production_days"("restaurantId", "date");

-- 3. Quantidade planejada por produto em um dia de produção; reservedQuantity
--    é cache recalculado transacionalmente (nunca fonte única de verdade).
CREATE TABLE "roast_productions" (
  "id" TEXT NOT NULL,
  "productionDayId" TEXT NOT NULL,
  "roastProductId" TEXT NOT NULL,
  "plannedQuantity" DECIMAL(10,3) NOT NULL,
  "reservedQuantity" DECIMAL(10,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "roast_productions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "roast_productions"
  ADD CONSTRAINT "roast_productions_productionDayId_fkey"
  FOREIGN KEY ("productionDayId") REFERENCES "roast_production_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roast_productions"
  ADD CONSTRAINT "roast_productions_roastProductId_fkey"
  FOREIGN KEY ("roastProductId") REFERENCES "roast_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "roast_productions_productionDayId_roastProductId_key" ON "roast_productions"("productionDayId", "roastProductId");

-- 4. Cabeçalho da reserva do cliente. Sem valor financeiro (fora de
--    escopo) e sem vínculo com mesa/comanda/pedido.
CREATE TABLE "roast_reservations" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "productionDayId" TEXT NOT NULL,
  "waiterId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT,
  "notes" TEXT,
  "status" "RoastReservationStatus" NOT NULL DEFAULT 'PENDING',
  "cancelledAt" TIMESTAMPTZ(6),
  "cancelledById" TEXT,
  "cancelReason" TEXT,
  "deliveredAt" TIMESTAMPTZ(6),
  "deliveredById" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "roast_reservations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "roast_reservations"
  ADD CONSTRAINT "roast_reservations_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roast_reservations"
  ADD CONSTRAINT "roast_reservations_productionDayId_fkey"
  FOREIGN KEY ("productionDayId") REFERENCES "roast_production_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roast_reservations"
  ADD CONSTRAINT "roast_reservations_waiterId_fkey"
  FOREIGN KEY ("waiterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roast_reservations"
  ADD CONSTRAINT "roast_reservations_deliveredById_fkey"
  FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "roast_reservations"
  ADD CONSTRAINT "roast_reservations_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "roast_reservations_restaurantId_idx" ON "roast_reservations"("restaurantId");
CREATE INDEX "roast_reservations_productionDayId_idx" ON "roast_reservations"("productionDayId");
CREATE INDEX "roast_reservations_status_idx" ON "roast_reservations"("status");

-- 5. Itens da reserva — nome e unidade congelados no momento da reserva
--    (mesmo racional de order_items.productNameAtOrder).
CREATE TABLE "roast_reservation_items" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "roastProductionId" TEXT NOT NULL,
  "productNameAtReservation" TEXT NOT NULL,
  "unitAtReservation" TEXT NOT NULL,
  "quantity" DECIMAL(10,3) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "roast_reservation_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "roast_reservation_items"
  ADD CONSTRAINT "roast_reservation_items_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "roast_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roast_reservation_items"
  ADD CONSTRAINT "roast_reservation_items_roastProductionId_fkey"
  FOREIGN KEY ("roastProductionId") REFERENCES "roast_productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "roast_reservation_items_reservationId_idx" ON "roast_reservation_items"("reservationId");
CREATE INDEX "roast_reservation_items_roastProductionId_idx" ON "roast_reservation_items"("roastProductionId");

-- 6. RLS deny-by-default para as tabelas novas, mesmo racional da migration
--    20260804194913_enable_rls_deny_by_default — exposta pela API pública
--    do Supabase por padrão (schema public), sem política = bloqueado para
--    "anon"/"authenticated"; não afeta o Prisma, que conecta como dono.
ALTER TABLE "roast_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roast_production_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roast_productions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roast_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roast_reservation_items" ENABLE ROW LEVEL SECURITY;
