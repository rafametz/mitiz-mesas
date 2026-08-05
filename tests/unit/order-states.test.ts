import { describe, expect, it } from "vitest";
import {
  canTransitionOrder,
  canTransitionOrderItem,
  deriveOrderProgressStatus,
  deriveOrderStatus,
  isOrderItemCancelled,
} from "@/domain/order/states";

describe("canTransitionOrderItem", () => {
  it("permite o caminho linear do diagrama (business-rules.md §1)", () => {
    expect(canTransitionOrderItem("SENT", "IN_PREPARATION")).toBe(true);
    expect(canTransitionOrderItem("IN_PREPARATION", "READY")).toBe(true);
    expect(canTransitionOrderItem("READY", "DELIVERED")).toBe(true);
  });

  it("permite solicitar e autorizar cancelamento", () => {
    expect(canTransitionOrderItem("SENT", "CANCELLATION_REQUESTED")).toBe(true);
    expect(canTransitionOrderItem("CANCELLATION_REQUESTED", "CANCELLED")).toBe(true);
  });

  it("permite admin cancelar direto, pulando a solicitação", () => {
    expect(canTransitionOrderItem("SENT", "CANCELLED")).toBe(true);
    expect(canTransitionOrderItem("IN_PREPARATION", "CANCELLED")).toBe(false); // precisa solicitar antes
  });

  it("rejeita transições inválidas", () => {
    expect(canTransitionOrderItem("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransitionOrderItem("CANCELLED", "SENT")).toBe(false);
    expect(canTransitionOrderItem("SENT", "DELIVERED")).toBe(false);
  });
});

describe("isOrderItemCancelled", () => {
  it("só CANCELLED conta como cancelado (não CANCELLATION_REQUESTED)", () => {
    expect(isOrderItemCancelled("CANCELLED")).toBe(true);
    expect(isOrderItemCancelled("CANCELLATION_REQUESTED")).toBe(false);
    expect(isOrderItemCancelled("SENT")).toBe(false);
  });
});

describe("canTransitionOrder", () => {
  it("segue o mesmo caminho linear do item", () => {
    expect(canTransitionOrder("SENT", "RECEIVED")).toBe(true);
    expect(canTransitionOrder("READY", "DELIVERED")).toBe(true);
  });

  it("rejeita pular etapas", () => {
    expect(canTransitionOrder("SENT", "DELIVERED")).toBe(false);
    expect(canTransitionOrder("DELIVERED", "CANCELLED")).toBe(false);
  });
});

describe("deriveOrderStatus", () => {
  it("mantém o status atual se nenhum item foi cancelado", () => {
    expect(deriveOrderStatus("SENT", ["SENT", "SENT"])).toBe("SENT");
  });

  it("vira PARTIALLY_CANCELLED se algum item (não todos) foi cancelado", () => {
    expect(deriveOrderStatus("SENT", ["SENT", "CANCELLED"])).toBe("PARTIALLY_CANCELLED");
  });

  it("vira CANCELLED se todos os itens foram cancelados", () => {
    expect(deriveOrderStatus("SENT", ["CANCELLED", "CANCELLED"])).toBe("CANCELLED");
  });

  it("não retrocede de PARTIALLY_CANCELLED indevidamente", () => {
    expect(deriveOrderStatus("PARTIALLY_CANCELLED", ["SENT", "CANCELLED"])).toBe(
      "PARTIALLY_CANCELLED",
    );
  });
});

describe("deriveOrderProgressStatus (Módulo 6 — produção)", () => {
  it("mantém SENT enquanto nenhum item saiu de SENT", () => {
    expect(deriveOrderProgressStatus("SENT", ["SENT", "SENT"])).toBe("SENT");
  });

  it("vira RECEIVED assim que o primeiro item começa (marcar como recebido é implícito)", () => {
    expect(deriveOrderProgressStatus("SENT", ["SENT", "IN_PREPARATION"])).toBe("RECEIVED");
  });

  it("só vira IN_PREPARATION quando TODOS os itens ativos já saíram de SENT", () => {
    expect(deriveOrderProgressStatus("RECEIVED", ["IN_PREPARATION", "READY"])).toBe(
      "IN_PREPARATION",
    );
    // ainda tem um em SENT -> não avança para IN_PREPARATION
    expect(deriveOrderProgressStatus("RECEIVED", ["IN_PREPARATION", "SENT"])).toBe("RECEIVED");
  });

  it("só vira READY quando todos os itens ativos estão prontos ou entregues", () => {
    expect(deriveOrderProgressStatus("IN_PREPARATION", ["READY", "DELIVERED"])).toBe("READY");
  });

  it("só vira DELIVERED quando todos os itens ativos foram entregues", () => {
    expect(deriveOrderProgressStatus("READY", ["DELIVERED", "DELIVERED"])).toBe("DELIVERED");
    expect(deriveOrderProgressStatus("READY", ["DELIVERED", "READY"])).toBe("READY");
  });

  it("ignora itens cancelados no cálculo (um pedido com 1 item ativo e 1 cancelado pode ficar DELIVERED)", () => {
    expect(deriveOrderProgressStatus("READY", ["DELIVERED", "CANCELLED"])).toBe("DELIVERED");
  });

  it("nunca regride: um item novo (SENT) não desfaz o progresso de um pedido mais avançado", () => {
    expect(deriveOrderProgressStatus("READY", ["READY", "SENT"])).toBe("READY");
  });

  it("mantém o status atual se todos os itens ativos foram cancelados", () => {
    expect(deriveOrderProgressStatus("IN_PREPARATION", ["CANCELLED", "CANCELLED"])).toBe(
      "IN_PREPARATION",
    );
  });
});
