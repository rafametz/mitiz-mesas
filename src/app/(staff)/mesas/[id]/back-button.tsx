"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

// Da tela da mesa (raiz /mesas/[id]) volta pra lista de mesas; de qualquer
// sub-aba (pagamentos, histórico, pedidos, pedidos/novo, pessoas) volta pro
// detalhamento da mesa — antes a seta ia sempre pra /mesas, então voltar de
// dentro de Pagamentos pulava o detalhamento da mesa direto pra lista
// (feedback do usuário). Client component só por causa do usePathname; o
// resto do layout continua servidor.
export function MesaBackButton({ tableId }: { tableId: string }) {
  const pathname = usePathname();
  const isRootMesaPage = pathname === `/mesas/${tableId}`;

  return (
    <IconButton
      href={isRootMesaPage ? "/mesas" : `/mesas/${tableId}`}
      label={isRootMesaPage ? "Voltar para mesas" : "Voltar para a mesa"}
      icon={ArrowLeft}
      className="-ml-2"
    />
  );
}
