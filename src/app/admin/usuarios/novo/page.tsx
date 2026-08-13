import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { NewUserForm } from "./new-user-form";

export default async function NovoUsuarioPage() {
  const roles = await prisma.role.findMany({ orderBy: { label: "asc" } });

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Link
        href="/admin/usuarios"
        className="flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Usuários
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">Novo usuário</h1>

      <NewUserForm roles={roles.map((role) => ({ id: role.id, label: role.label }))} />
    </div>
  );
}
