import { redirect } from "next/navigation";

// Pessoas foi absorvido pela tela principal da mesa, num bloco compacto
// expansível (refatoração mobile-first — ver
// src/app/(staff)/mesas/[id]/page.tsx). Rota mantida só como
// redirecionamento, pra qualquer link salvo/compartilhado continuar
// funcionando em vez de virar 404.
export default async function PessoasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/mesas/${id}`);
}
