// Seed de dados de referência — NÃO é dado de negócio/fictício de produção
// (CLAUDE.md seção 17 proíbe isso). O que este script cria:
//
// 1. O único `Restaurant` (preparação multi-unidade, ADR 0001 item 6);
// 2. Os 4 perfis fixos (`Role`) da seção 5 do CLAUDE.md;
// 3. O catálogo de `Permission` e o vínculo `RolePermission`, espelhando
//    src/domain/auth/permissions.ts (fonte única da regra);
// 4. Um usuário de TESTE (Supabase Auth + `User`), só para permitir testar
//    o login (unitário/E2E) sem depender da conta real do administrador.
//    Credenciais impressas no final — remova este usuário antes de operar
//    com dados reais.
//
// Idempotente: pode rodar mais de uma vez sem duplicar nada.

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "../src/domain/auth/permissions";

const prisma = new PrismaClient();

const supabaseAdmin = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const TEST_USER_EMAIL = "dev-admin@mitiz-mesas.test";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não definida.`);
  return value;
}

function generatePassword(): string {
  // 24 caracteres em base64url — forte o suficiente para um usuário de
  // teste, sem caracteres problemáticos em URL/terminal.
  return randomBytes(18).toString("base64url");
}

async function seedRestaurant() {
  const existing = await prisma.restaurant.findFirst();
  if (existing) return existing;
  return prisma.restaurant.create({
    data: { name: "MITIZ Boutique de Carnes" },
  });
}

async function seedRolesAndPermissions() {
  const permissionCodes = Object.values(PERMISSIONS);
  const permissionsByCode = new Map<string, { id: string }>();

  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
    permissionsByCode.set(code, permission);
  }

  const rolesByCode = new Map<string, { id: string }>();
  for (const [roleCode, label] of Object.entries(ROLE_LABELS)) {
    const role = await prisma.role.upsert({
      where: { name: roleCode },
      update: { label },
      create: { name: roleCode, label },
    });
    rolesByCode.set(roleCode, role);

    const grantedCodes = ROLE_PERMISSIONS[roleCode as keyof typeof ROLE_PERMISSIONS];
    for (const code of grantedCodes) {
      const permission = permissionsByCode.get(code);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  return rolesByCode;
}

async function findOrCreateAuthUser(): Promise<{ id: string; password: string | null }> {
  const { data: existingList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) throw listError;

  const existing = existingList.users.find((u) => u.email === TEST_USER_EMAIL);
  if (existing) {
    return { id: existing.id, password: null };
  }

  const password = generatePassword();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data.user) throw new Error("Supabase não retornou o usuário criado.");

  return { id: data.user.id, password };
}

async function seedTestUser(restaurantId: string, adminRoleId: string) {
  const { id: authUserId, password } = await findOrCreateAuthUser();

  await prisma.user.upsert({
    where: { authUserId },
    update: { active: true },
    create: {
      authUserId,
      restaurantId,
      roleId: adminRoleId,
      name: "Usuário de Teste (seed)",
      email: TEST_USER_EMAIL,
    },
  });

  return { email: TEST_USER_EMAIL, password };
}

async function main() {
  const restaurant = await seedRestaurant();
  const roles = await seedRolesAndPermissions();

  const adminRole = roles.get("ADMIN");
  if (!adminRole) throw new Error("Role ADMIN não foi criada.");

  const testUser = await seedTestUser(restaurant.id, adminRole.id);

  console.log("\nSeed concluído.");
  console.log(`Restaurant: ${restaurant.name} (${restaurant.id})`);
  console.log(`Roles: ${Array.from(roles.keys()).join(", ")}`);
  if (testUser.password) {
    console.log("\nUsuário de teste criado:");
    console.log(`  E-mail: ${testUser.email}`);
    console.log(`  Senha:  ${testUser.password}`);
    console.log("  (perfil ADMIN — só para teste/E2E, remover antes de dados reais)");
  } else {
    console.log(`\nUsuário de teste já existia (${testUser.email}), senha não foi alterada.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
