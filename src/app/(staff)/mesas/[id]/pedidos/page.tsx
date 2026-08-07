import { redirect } from "next/navigation";

// Pedidos foi absorvido pela tela principal da mesa (refatoração
// mobile-first — ver src/app/(staff)/mesas/[id]/page.tsx). Rota mantida só
// como redirecionamento, pra qualquer link salvo/compartilhado continuar
// funcionando em vez de virar 404.
export default async function PedidosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/mesas/${id}`);
}
