import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { NewGroupForm } from "./new-group-form";

export default async function NovoGrupoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!product) notFound();

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Link
        href={`/admin/produtos/${product.id}/editar`}
        className="flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {product.name}
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">Novo grupo de adicionais</h1>
      <NewGroupForm productId={product.id} />
    </div>
  );
}
