import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { EditUserForm } from "./edit-user-form";
import { ResetPasswordForm } from "./reset-password-form";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, roles] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.role.findMany({ orderBy: { label: "asc" } }),
  ]);
  if (!user) notFound();

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Link
        href="/admin/usuarios"
        className="flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Usuários
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">Editar usuário</h1>

      <EditUserForm
        user={{ id: user.id, name: user.name, email: user.email, roleId: user.roleId, active: user.active }}
        roles={roles.map((role) => ({ id: role.id, label: role.label }))}
      />

      <ResetPasswordForm userId={user.id} />
    </div>
  );
}
