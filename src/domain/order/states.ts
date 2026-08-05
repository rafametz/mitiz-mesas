import { OrderItemStatus, OrderStatus } from "@prisma/client";

// Máquina de estados do item do pedido — CLAUDE.md seção 7 /
// docs/product/business-rules.md §1:
// DRAFT → SENT → IN_PREPARATION → READY → DELIVERED
// Exceção: CANCELLATION_REQUESTED → CANCELLED.
//
// SENT → CANCELLED direto (pulando CANCELLATION_REQUESTED) é permitido:
// quem solicita cancelamento é o Garçom (ORDERS_CANCEL_REQUEST), quem
// autoriza é o Admin (ORDERS_CANCEL_AUTHORIZE) — e o Admin tem as duas
// permissões, então não precisa passar pela solicitação para cancelar.
const ORDER_ITEM_TRANSITIONS: Record<OrderItemStatus, OrderItemStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["IN_PREPARATION", "CANCELLATION_REQUESTED", "CANCELLED"],
  IN_PREPARATION: ["READY", "CANCELLATION_REQUESTED"],
  READY: ["DELIVERED", "CANCELLATION_REQUESTED"],
  DELIVERED: [],
  CANCELLATION_REQUESTED: ["CANCELLED"],
  CANCELLED: [],
};

export function canTransitionOrderItem(from: OrderItemStatus, to: OrderItemStatus): boolean {
  return ORDER_ITEM_TRANSITIONS[from].includes(to);
}

export const CANCELLABLE_ORDER_ITEM_STATUSES: readonly OrderItemStatus[] = [
  "SENT",
  "IN_PREPARATION",
  "READY",
  "CANCELLATION_REQUESTED",
];

export function isOrderItemCancelled(status: OrderItemStatus): boolean {
  return status === "CANCELLED";
}

// Máquina de estados do pedido (Order) — o "rollup" dos itens. Módulo 4
// só usa SENT/CANCELLED/PARTIALLY_CANCELLED; RECEIVED → DELIVERED são
// avançados pela produção (Módulo 6).
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["RECEIVED", "PARTIALLY_CANCELLED", "CANCELLED"],
  RECEIVED: ["IN_PREPARATION", "PARTIALLY_CANCELLED"],
  IN_PREPARATION: ["READY", "PARTIALLY_CANCELLED"],
  READY: ["DELIVERED"],
  DELIVERED: [],
  PARTIALLY_CANCELLED: ["RECEIVED", "IN_PREPARATION", "READY", "DELIVERED", "CANCELLED"],
  CANCELLED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

// Dado o conjunto de status dos itens de um pedido, qual o status do
// pedido em si deveria refletir? Usado depois de cancelar item(ns) para
// manter Order.status consistente com seus OrderItem.
export function deriveOrderStatus(
  currentStatus: OrderStatus,
  itemStatuses: readonly OrderItemStatus[],
): OrderStatus {
  if (itemStatuses.length === 0) return currentStatus;
  const allCancelled = itemStatuses.every((s) => s === "CANCELLED");
  if (allCancelled) return "CANCELLED";
  const anyCancelled = itemStatuses.some((s) => s === "CANCELLED");
  if (anyCancelled && currentStatus !== "PARTIALLY_CANCELLED") return "PARTIALLY_CANCELLED";
  return currentStatus;
}

// Posição de cada status na esteira de produção — usado só para nunca
// deixar deriveOrderProgressStatus regredir o pedido (ex.: um item novo
// sendo adicionado a um pedido que já tinha itens prontos não pode "voltar"
// o pedido a RECEIVED). DRAFT/PARTIALLY_CANCELLED ficam antes de tudo;
// CANCELLED depois de tudo (não é alcançado por esta função — cancelamento
// é decidido por deriveOrderStatus, acima).
const ORDER_PROGRESS_RANK: Record<OrderStatus, number> = {
  DRAFT: -2,
  PARTIALLY_CANCELLED: -1,
  SENT: 0,
  RECEIVED: 1,
  IN_PREPARATION: 2,
  READY: 3,
  DELIVERED: 4,
  CANCELLED: 5,
};

// Deriva o novo status do pedido a partir do conjunto de status dos itens
// não cancelados, depois que a produção avança algum item (Módulo 6). O
// pedido só avança de estágio quando TODOS os itens ativos já alcançaram
// aquele estágio — reflete que um pedido só está "pronto" quando cada
// setor envolvido terminou a sua parte, não só um deles. Itens ainda em
// OrderItemStatus.SENT (nenhum não-cancelado avançou) mantêm o pedido no
// status atual — a transição SENT → RECEIVED do pedido é o que sinaliza
// "a produção começou a olhar para este pedido".
export function deriveOrderProgressStatus(
  currentStatus: OrderStatus,
  itemStatuses: readonly OrderItemStatus[],
): OrderStatus {
  const active = itemStatuses.filter((s) => s !== "CANCELLED");
  if (active.length === 0) return currentStatus;

  let computed: OrderStatus = currentStatus;
  if (active.every((s) => s === "DELIVERED")) {
    computed = "DELIVERED";
  } else if (active.every((s) => s === "READY" || s === "DELIVERED")) {
    computed = "READY";
  } else if (active.every((s) => s === "IN_PREPARATION" || s === "READY" || s === "DELIVERED")) {
    computed = "IN_PREPARATION";
  } else if (active.some((s) => s !== "SENT")) {
    computed = "RECEIVED";
  }

  return ORDER_PROGRESS_RANK[computed] > ORDER_PROGRESS_RANK[currentStatus]
    ? computed
    : currentStatus;
}
