import "server-only";
import {
  pickupChannel,
  restaurantPickupsChannel,
  restaurantTablesChannel,
  tableChannel,
} from "@/lib/realtime/channels";

// Canais de tempo real de uma ServiceSession — de mesa ou de retirada,
// conforme o tipo (módulo Retiradas, 2026-08-14). Centralizado aqui porque
// toda ação que muda uma ServiceSession (pagamento, desconto, taxa,
// fechamento, pedido, cancelamento...) precisa notificar os dois: a tela
// de detalhe específica e a lista geral (/mesas ou /retiradas, e as
// respectivas telas de admin) — sem duplicar esse `if` em cada arquivo.
export function sessionRealtimeChannels(session: {
  id: string;
  tableId: string | null;
  restaurantId: string;
}): string[] {
  return session.tableId
    ? [tableChannel(session.tableId), restaurantTablesChannel(session.restaurantId)]
    : [pickupChannel(session.id), restaurantPickupsChannel(session.restaurantId)];
}
