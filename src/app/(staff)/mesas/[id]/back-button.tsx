"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

// Da tela da mesa (raiz /mesas/[id]) volta pra lista de mesas; de qualquer
// sub-aba (pagamentos, histórico, pedidos, pedidos/novo, pessoas) volta pro
// detalhamento da mesa — antes a seta ia sempre pra /mesas, então voltar de
// dentro de Pagamentos pulava o detalhamento da mesa direto pra lista
// (feedback do usuário). Detalhe de um atendimento específico do histórico
// (/historico/[sessionId]) é um nível mais fundo ainda — volta pra lista de
// histórico, não pro detalhamento da mesa, senão perde o contexto de "eu
// estava vendo os atendimentos antigos" (CLAUDE.md seção 11, "preservar o
// contexto ao voltar"). Client component só por causa do usePathname; o
// resto do layout continua servidor.
export function MesaBackButton({ tableId }: { tableId: string }) {
  const pathname = usePathname();
  const isRootMesaPage = pathname === `/mesas/${tableId}`;
  const isHistoricoDetail = pathname.startsWith(`/mesas/${tableId}/historico/`);

  const href = isRootMesaPage
    ? "/mesas"
    : isHistoricoDetail
      ? `/mesas/${tableId}/historico`
      : `/mesas/${tableId}`;
  const label = isRootMesaPage
    ? "Voltar para mesas"
    : isHistoricoDetail
      ? "Voltar para o histórico"
      : "Voltar para a mesa";

  return <IconButton href={href} label={label} icon={ArrowLeft} className="-ml-2" />;
}
