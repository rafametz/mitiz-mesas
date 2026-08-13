import { describe, expect, it } from "vitest";
import { wouldLeaveNoActiveAdmin } from "@/domain/auth/user-guard";

describe("wouldLeaveNoActiveAdmin", () => {
  it("não bloqueia quem não é admin, não importa o que mude", () => {
    expect(
      wouldLeaveNoActiveAdmin({
        isCurrentlyAdmin: false,
        willBeAdmin: false,
        willBeActive: false,
        otherActiveAdminCount: 0,
      }),
    ).toBe(false);
  });

  it("não bloqueia se continua admin ativo", () => {
    expect(
      wouldLeaveNoActiveAdmin({
        isCurrentlyAdmin: true,
        willBeAdmin: true,
        willBeActive: true,
        otherActiveAdminCount: 0,
      }),
    ).toBe(false);
  });

  it("bloqueia desativar o único admin ativo", () => {
    expect(
      wouldLeaveNoActiveAdmin({
        isCurrentlyAdmin: true,
        willBeAdmin: true,
        willBeActive: false,
        otherActiveAdminCount: 0,
      }),
    ).toBe(true);
  });

  it("bloqueia trocar o perfil do único admin ativo pra outro perfil", () => {
    expect(
      wouldLeaveNoActiveAdmin({
        isCurrentlyAdmin: true,
        willBeAdmin: false,
        willBeActive: true,
        otherActiveAdminCount: 0,
      }),
    ).toBe(true);
  });

  it("permite desativar um admin se sobra outro admin ativo", () => {
    expect(
      wouldLeaveNoActiveAdmin({
        isCurrentlyAdmin: true,
        willBeAdmin: true,
        willBeActive: false,
        otherActiveAdminCount: 1,
      }),
    ).toBe(false);
  });
});
