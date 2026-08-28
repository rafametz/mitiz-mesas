// Integração VHSYS (planejada 2026-08-25) — validação pura do valor
// digitado na tela de vínculo /admin/integracoes/vhsys. Vazio desvincula
// (volta pra null); qualquer outra coisa precisa ser um inteiro positivo,
// já que id_produto na VHSYS é sempre numérico.
export class InvalidVhsysProductIdError extends Error {}

export function parseVhsysProductId(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (!/^\d+$/.test(trimmed)) {
    throw new InvalidVhsysProductIdError("ID de produto VHSYS deve ser um número inteiro positivo.");
  }

  const value = Number(trimmed);
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidVhsysProductIdError("ID de produto VHSYS deve ser um número inteiro positivo.");
  }

  return value;
}
