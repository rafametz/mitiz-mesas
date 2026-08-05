import { prisma } from "@/lib/prisma";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { formatBRL } from "@/lib/money";
import {
  createModifier,
  createModifierGroup,
  updateModifier,
  updateModifierGroup,
} from "./modifiers-actions";

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
      <h2 className="font-display text-base font-semibold text-ink">Adicionais / modificadores</h2>

      {groups.map((group) => {
        const updateGroupWithId = updateModifierGroup.bind(null, group.id);
        const createModifierInGroup = createModifier.bind(null, group.id);

        return (
          <div key={group.id} className="rounded-card border border-line bg-surface p-4">
            <form action={updateGroupWithId} className="flex flex-wrap items-end gap-3">
              <TextField
                label="Grupo"
                name="name"
                defaultValue={group.name}
                required
                maxLength={80}
              />
              <TextField
                label="Mín."
                name="minSelect"
                type="number"
                min={0}
                defaultValue={group.minSelect}
                className="w-20"
              />
              <TextField
                label="Máx."
                name="maxSelect"
                type="number"
                min={1}
                defaultValue={group.maxSelect}
                className="w-20"
              />
              <CheckboxField label="Obrigatório" name="required" defaultChecked={group.required} />
              <CheckboxField label="Ativo" name="active" defaultChecked={group.active} />
              <SubmitButton>Salvar grupo</SubmitButton>
            </form>

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
                {group.modifiers.map((modifier) => {
                  const updateModifierWithId = updateModifier.bind(null, modifier.id);
                  return (
                    <tr key={modifier.id} className="border-b border-line/60 last:border-b-0">
                      <td colSpan={3} className="py-2">
                        <form
                          action={updateModifierWithId}
                          className="flex flex-wrap items-end gap-3"
                        >
                          <TextField
                            label="Nome"
                            name="name"
                            defaultValue={modifier.name}
                            required
                            maxLength={80}
                            className="w-40"
                          />
                          <TextField
                            label="Valor (R$)"
                            name="priceDelta"
                            inputMode="decimal"
                            defaultValue={modifier.priceDelta.toString()}
                            className="w-28"
                          />
                          <CheckboxField
                            label="Ativo"
                            name="active"
                            defaultChecked={modifier.active}
                          />
                          <SubmitButton>Salvar</SubmitButton>
                          <span className="tabular text-xs text-muted">
                            atual: {formatBRL(modifier.priceDelta)}
                          </span>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {group.modifiers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-2 text-muted">
                      Nenhum adicional neste grupo ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <form action={createModifierInGroup} className="mt-4 flex flex-wrap items-end gap-3">
              <TextField
                label="Novo adicional"
                name="name"
                required
                maxLength={80}
                className="w-40"
              />
              <TextField
                label="Valor (R$)"
                name="priceDelta"
                inputMode="decimal"
                placeholder="0.00"
                required
                className="w-28"
              />
              <SubmitButton>Adicionar</SubmitButton>
            </form>
          </div>
        );
      })}

      {groups.length === 0 && (
        <p className="text-sm text-muted">Nenhum grupo de adicionais ainda.</p>
      )}

      <div>
        <h3 className="mb-3 font-display text-sm font-semibold text-ink">
          Novo grupo de adicionais
        </h3>
        <form
          action={createModifierGroup.bind(null, productId)}
          className="flex max-w-sm flex-col gap-4"
        >
          <TextField
            label="Nome do grupo"
            name="name"
            required
            maxLength={80}
            placeholder="Ex.: Ponto da carne"
          />
          <TextField
            label="Mínimo de seleções"
            name="minSelect"
            type="number"
            min={0}
            defaultValue={0}
          />
          <TextField
            label="Máximo de seleções"
            name="maxSelect"
            type="number"
            min={1}
            defaultValue={1}
          />
          <CheckboxField label="Obrigatório" name="required" />
          <CheckboxField label="Ativo" name="active" defaultChecked />
          <SubmitButton>Criar grupo</SubmitButton>
        </form>
      </div>
    </div>
  );
}
