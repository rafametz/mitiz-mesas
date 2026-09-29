-- Ticket de reserva de assado impresso automaticamente ao criar a reserva
-- (pedido do usuário 2026-10-04). Ver prisma/schema.prisma
-- (PrintJobType.ROAST_RESERVATION, PrintJob.roastReservationId) e
-- docs/printing/architecture.md.

ALTER TYPE "PrintJobType" ADD VALUE 'ROAST_RESERVATION';

ALTER TABLE "print_jobs" ADD COLUMN "roastReservationId" TEXT;

ALTER TABLE "print_jobs"
  ADD CONSTRAINT "print_jobs_roastReservationId_fkey"
  FOREIGN KEY ("roastReservationId") REFERENCES "roast_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "print_jobs_roastReservationId_idx" ON "print_jobs"("roastReservationId");
