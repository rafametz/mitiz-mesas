"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

// Mesmo racional de MesaBackButton (mesas/[id]/back-button.tsx) — da raiz
// da retirada volta pra lista, de qualquer sub-aba (pagamentos, pedidos)
// volta pro detalhamento dela.
export function PickupBackButton({ pickupId }: { pickupId: string }) {
  const pathname = usePathname();
  const isRootPage = pathname === `/retiradas/${pickupId}`;

  const href = isRootPage ? "/retiradas" : `/retiradas/${pickupId}`;
  const label = isRootPage ? "Voltar para retiradas" : "Voltar para a retirada";

  return <IconButton href={href} label={label} icon={ArrowLeft} className="-ml-2" />;
}
