import { MeatPoint, OrderItemStatus, OrderStatus } from "@prisma/client";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  RECEIVED: "Recebido",
  IN_PREPARATION: "Em preparo",
  READY: "Pronto",
  DELIVERED: "Entregue",
  PARTIALLY_CANCELLED: "Parcialmente cancelado",
  CANCELLED: "Cancelado",
};

export const ORDER_ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  IN_PREPARATION: "Em preparo",
  READY: "Pronto",
  DELIVERED: "Entregue",
  CANCELLATION_REQUESTED: "Cancelamento solicitado",
  CANCELLED: "Cancelado",
};

export const MEAT_POINT_LABELS: Record<MeatPoint, string> = {
  MAL_PASSADO: "Mal passado",
  AO_PONTO_PARA_MAL: "Ao ponto para mal",
  AO_PONTO: "Ao ponto",
  AO_PONTO_PARA_BEM: "Ao ponto para bem",
  BEM_PASSADO: "Bem passado",
  NAO_SE_APLICA: "Não se aplica",
};
