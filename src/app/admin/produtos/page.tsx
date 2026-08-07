import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { SelectField, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { PageHeader } from "@/components/ui/card";
import { CardList, CardListField, CardListRow, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { createProduct, toggleAvailability } from "./actions";

export default async function ProdutosPage() {
  const restaurant = await getCurrentRestaurant();
  const [products, categories, sectors] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId: restaurant.id },
      include: { category: true, defaultSector: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ where: { restaurantId: restaurant.id, active: true } }),
    prisma.productionSector.findMany({ where: { restaurantId: restaurant.id, active: true } }),
  ]);

  const hasPrerequisites = categories.length > 0 && sectors.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Produtos"
        subtitle="Preço e setor congelam no pedido no momento do lançamento."
      />

      <Table>
        <thead>
          <Tr>
            <Th>Nome</Th>
            <Th>Categoria</Th>
            <Th>Setor</Th>
            <Th>Preço</Th>
            <Th>Disponível</Th>
            <Th />
          </Tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const toggle = toggleAvailability.bind(null, product.id, !product.available);
            return (
              <Tr key={product.id}>
                <Td>{product.name}</Td>
                <Td>{product.category.name}</Td>
                <Td>{product.defaultSector.name}</Td>
                <Td className="tabular">{formatBRL(product.price)}</Td>
                <Td>
                  <form action={toggle}>
                    <button type="submit" className="font-medium text-wine underline">
                      {product.available ? "Sim" : "Não"}
                    </button>
                  </form>
                </Td>
                <Td>
                  <Link
                    href={`/admin/produtos/${product.id}/editar`}
                    className="font-medium text-wine underline"
                  >
                    Editar
                  </Link>
                </Td>
              </Tr>
            );
          })}
          {products.length === 0 && (
            <Tr>
              <Td colSpan={6} className="text-muted">
                Nenhum produto cadastrado ainda.
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>

      <CardList>
        {products.map((product) => {
          const toggle = toggleAvailability.bind(null, product.id, !product.available);
          return (
            <CardListRow key={product.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold text-ink">{product.name}</span>
                <Link
                  href={`/admin/produtos/${product.id}/editar`}
                  className="text-xs font-medium text-wine underline"
                >
                  Editar
                </Link>
              </div>
              <CardListField label="Categoria">{product.category.name}</CardListField>
              <CardListField label="Setor">{product.defaultSector.name}</CardListField>
              <CardListField label="Preço">
                <span className="tabular">{formatBRL(product.price)}</span>
              </CardListField>
              <CardListField label="Disponível">
                <form action={toggle}>
                  <button type="submit" className="font-medium text-wine underline">
                    {product.available ? "Sim" : "Não"}
                  </button>
                </form>
              </CardListField>
            </CardListRow>
          );
        })}
        {products.length === 0 && (
          <p className="text-sm text-muted">Nenhum produto cadastrado ainda.</p>
        )}
      </CardList>

      <div className="border-t border-line pt-6">
        <h2 className="mb-3 font-display text-base font-semibold text-ink">Novo produto</h2>
        {!hasPrerequisites ? (
          <p className="text-sm text-muted">
            Cadastre pelo menos uma{" "}
            <Link href="/admin/categorias" className="font-medium text-wine underline">
              categoria
            </Link>{" "}
            e um{" "}
            <Link href="/admin/setores" className="font-medium text-wine underline">
              setor
            </Link>{" "}
            antes de criar um produto.
          </p>
        ) : (
          <form action={createProduct} className="flex max-w-sm flex-col gap-4">
            <TextField label="Nome" name="name" required maxLength={120} />
            <TextAreaField label="Descrição (opcional)" name="description" maxLength={500} />
            <TextField
              label="Preço (R$)"
              name="price"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
            <SelectField label="Categoria" name="categoryId" required defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Setor de destino" name="defaultSectorId" required defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              {sectors.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.name}
                </option>
              ))}
            </SelectField>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                name="available"
                defaultChecked
                className="h-5 w-5 rounded border-line text-wine focus:ring-gold"
              />
              Disponível
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                name="active"
                defaultChecked
                className="h-5 w-5 rounded border-line text-wine focus:ring-gold"
              />
              Ativo
            </label>
            <SubmitButton>Criar produto</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
