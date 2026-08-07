import Link from "next/link";
import type { ComponentType } from "react";

// Botão de ação flutuante — a ação principal de uma tela, sempre visível,
// sem depender de rolar até um botão no topo (rules/frontend-design.md,
// "uma ação principal evidente por contexto"). Hoje só "Novo pedido" na
// mesa (docs/design/... refatoração mobile-first da tela de mesa), mas o
// componente é genérico o bastante para outra tela precisar futuramente.
//
// Posição: BottomNav é `fixed bottom-0 z-20` (~80px de altura, o layout já
// reserva isso com `pb-20`); Toast usa `bottom-20 z-50`. `bottom-24 z-30`
// deixa o FAB sempre acima da barra de navegação e abaixo de toast/diálogo,
// sem cobrir nenhum dos dois.
export function Fab({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="fixed bottom-24 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-wine pl-4 pr-5 font-semibold text-bg shadow-panel transition-colors hover:bg-wine-dark"
    >
      <Icon className="h-5 w-5" />
      {children}
    </Link>
  );
}
