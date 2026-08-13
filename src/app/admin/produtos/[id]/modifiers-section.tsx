import { Layers } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateModifierForm } from "./create-modifier-form";
import { UpdateGroupForm } from "./update-group-form";
import { UpdateModifierForm } from "./update-modifier-form";

// Seção de adicionais/modificadores, dentro da edição do produto — não é
// tela própria porque só faz sentido no contexto de um produto (CLAUDE.md
// seção 4: "Cadastro de adicionais e modificadores").
export async function ModifiersSection({ productId }: { productId: string }) {
  const groups = await prisma.productModifierGroup.findMany({
    where: { productId },
    include: { modifiers: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6 border-t border-line pt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-base font-semibold text-ink">
          Adicionais / modificadores
        </h2>
        <Button href={`/admin/produtos/${productId}/grupos/novo`} size="sm">
          + Novo grupo
        </Button>
      </div>

      {groups.map((group) => (
        <Card key={group.id}>
          <UpdateGroupForm groupId={group.id} group={group} />

          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Adicional
                </th>
                <th className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Valor
                </th>
                <th className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Ativo
                </th>
              </tr>
            </thead>
            <tbody>
              {group.modifiers.map((modifier) => (
                <tr key={modifier.id} className="border-b border-line/60 last:border-b-0">
                  <td colSpan={3} className="py-2">
                    <UpdateModifierForm
                      modifierId={modifier.id}
                      modifier={{
                        name: modifier.name,
                        priceDelta: modifier.priceDelta.toString(),
                        active: modifier.active,
                      }}
                    />
                  </td>
                </tr>
              ))}
              {group.modifiers.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-2 text-muted">
                    Nenhum adicional neste grupo ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <CreateModifierForm groupId={group.id} />
        </Card>
      ))}

      {groups.length === 0 && (
        <EmptyState
          icon={Layers}
          title="Nenhum grupo de adicionais ainda."
          action={<Button href={`/admin/produtos/${productId}/grupos/novo`}>Criar o primeiro</Button>}
        />
      )}
    </div>
  );
}
