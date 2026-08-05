import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishChange } from "@/lib/realtime/publish";

// Unitário, sem rede de verdade — mocka `fetch` global para verificar que
// publishChange chama a API REST de Broadcast do Supabase Realtime com o(s)
// canal(is) e evento certos, e que uma falha de rede nunca sobe como
// exceção (regra do próprio arquivo: tempo real não pode derrubar uma
// mutação que já foi persistida).
describe("publishChange", () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("publica no endpoint de broadcast, um item por canal, com o evento certo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    await publishChange(["table:mesa-1", "restaurant:rest-1:tables"], "order.created");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://exemplo.supabase.co/realtime/v1/api/broadcast");
    expect(init.headers.apikey).toBe("chave-de-teste");

    const body = JSON.parse(init.body);
    expect(body.messages).toHaveLength(2);
    expect(body.messages.map((m: { topic: string }) => m.topic)).toEqual([
      "table:mesa-1",
      "restaurant:rest-1:tables",
    ]);
    expect(body.messages[0].event).toBe("change");
    expect(body.messages[0].payload).toEqual({ type: "order.created" });
  });

  it("não faz nada (nem chama fetch) quando a lista de canais está vazia", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await publishChange([], "order.created");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nunca lança quando o fetch falha — tempo real é reforço de UX, não a fonte da verdade", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("rede fora")) as unknown as typeof fetch;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(publishChange(["table:mesa-1"], "order.created")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("não chama fetch quando faltam as variáveis de ambiente do Supabase", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await publishChange(["table:mesa-1"], "order.created");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
