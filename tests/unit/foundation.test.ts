import { describe, expect, it } from "vitest";

// Teste de fundação: só confirma que o pipeline de testes (Vitest + ts-node
// via esbuild) está corretamente configurado. Testes de regra de negócio
// começam no Módulo 3 do backlog (docs/backlog.md), junto com o primeiro
// código de domínio.
describe("fundação do projeto", () => {
  it("executa o pipeline de testes", () => {
    expect(1 + 1).toBe(2);
  });
});
