// Vincula um usuário já criado no Supabase Auth (Authentication → Users →
// Add user, no painel) a uma linha `User` da aplicação com perfil
// Administrador. Não pede nem vê a senha — só o e-mail, usado para achar o
// id em auth.users via service role.
//
// Uso:
//   npm run auth:link-admin -- --email=voce@exemplo.com --name="Seu Nome"

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não definida.`);
  return value;
}

function parseArgs() {
  const args = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    // Os dois grupos sempre existem quando o regex casa — non-null seguro.
    if (match) args.set(match[1]!, match[2]!);
  }
  const email = args.get("email");
  if (!email) {
    throw new Error('Uso: npm run auth:link-admin -- --email=voce@exemplo.com --name="Seu Nome"');
  }
  const name = args.get("name") ?? email.split("@")[0] ?? "Administrador";
  return { email, name };
}

async function main() {
  const { email, name } = parseArgs();

  const supabaseAdmin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;

  const authUser = data.users.find((u) => u.email === email);
  if (!authUser) {
    throw new Error(
      `Nenhum usuário com e-mail "${email}" encontrado em auth.users. Crie primeiro em ` +
        "Supabase → Authentication → Users → Add user.",
    );
  }

  const restaurant = await prisma.restaurant.findFirst();
  if (!restaurant) {
    throw new Error("Nenhum Restaurant encontrado — rode `npm run prisma:seed` primeiro.");
  }

  const adminRole = await prisma.role.findUnique({ where: { name: "ADMIN" } });
  if (!adminRole) {
    throw new Error("Role ADMIN não encontrada — rode `npm run prisma:seed` primeiro.");
  }

  const user = await prisma.user.upsert({
    where: { authUserId: authUser.id },
    update: { active: true, roleId: adminRole.id, restaurantId: restaurant.id, name, email },
    create: {
      authUserId: authUser.id,
      restaurantId: restaurant.id,
      roleId: adminRole.id,
      name,
      email,
    },
  });

  console.log(`Usuário "${user.name}" (${user.email}) vinculado como Administrador.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
