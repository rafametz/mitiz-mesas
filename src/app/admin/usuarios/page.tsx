import Link from "next/link";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { CardList, CardListField, CardListRow, Table, Td, Th, Tr } from "@/components/ui/table";

export default async function UsuariosPage() {
  const restaurant = await getCurrentRestaurant();
  const users = await prisma.user.findMany({
    where: { restaurantId: restaurant.id },
    include: { role: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Usuários"
        subtitle="Cadastro, perfil e acesso de cada pessoa que usa o sistema."
        action={<Button href="/admin/usuarios/novo">+ Novo usuário</Button>}
      />

      {users.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum usuário cadastrado ainda." />
      ) : (
        <>
          <Table>
            <thead>
              <Tr>
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Perfil</Th>
                <Th>Status</Th>
                <Th />
              </Tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <Tr key={user.id}>
                  <Td>{user.name}</Td>
                  <Td className="text-muted">{user.email}</Td>
                  <Td>{user.role.label}</Td>
                  <Td>
                    <StatusBadge tone={user.active ? "free" : "muted"}>
                      {user.active ? "Ativo" : "Inativo"}
                    </StatusBadge>
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/usuarios/${user.id}/editar`}
                      className="font-medium text-wine underline"
                    >
                      Editar
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          <CardList>
            {users.map((user) => (
              <CardListRow key={user.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold text-ink">{user.name}</span>
                  <Link
                    href={`/admin/usuarios/${user.id}/editar`}
                    className="text-xs font-medium text-wine underline"
                  >
                    Editar
                  </Link>
                </div>
                <CardListField label="E-mail">{user.email}</CardListField>
                <CardListField label="Perfil">{user.role.label}</CardListField>
                <CardListField label="Status">
                  <StatusBadge tone={user.active ? "free" : "muted"}>
                    {user.active ? "Ativo" : "Inativo"}
                  </StatusBadge>
                </CardListField>
              </CardListRow>
            ))}
          </CardList>
        </>
      )}
    </div>
  );
}
