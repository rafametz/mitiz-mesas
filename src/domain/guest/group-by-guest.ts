// Agrupamento por pessoa vinculada (2026-08-20, pedido do usuário):
// facilitar achar rápido o que uma pessoa específica da mesa consumiu,
// tanto na tela de seleção de pagamento quanto no painel "Itens" da tela
// de pagamentos — as duas listam a mesma forma de item (algo com
// `guestName: string | null`), então um agrupamento só, puro e
// reaproveitado nos dois lugares, garante que nunca divirjam.
//
// Ordem alfabética pelo nome da pessoa (localeCompare pt-BR); itens sem
// pessoa vinculada ("consumo geral") sempre por último, como um grupo à
// parte — nunca misturados com pessoas nomeadas nem comparados com elas
// (não têm nome pra ordenar). A ordem dos itens dentro de cada grupo é
// preservada (quem chama já manda a lista na ordem certa — normalmente
// alfabética por produto).
export type GuestGroup<T> = { guestName: string | null; items: T[] };

export function groupByGuestName<T extends { guestName: string | null }>(
  items: T[],
): GuestGroup<T>[] {
  const named = new Map<string, T[]>();
  const general: T[] = [];

  for (const item of items) {
    if (item.guestName) {
      const list = named.get(item.guestName);
      if (list) list.push(item);
      else named.set(item.guestName, [item]);
    } else {
      general.push(item);
    }
  }

  const groups: GuestGroup<T>[] = [...named.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([guestName, groupItems]) => ({ guestName, items: groupItems }));

  if (general.length > 0) groups.push({ guestName: null, items: general });

  return groups;
}
