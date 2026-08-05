import { z } from "zod";

// Validação mínima das variáveis de ambiente na inicialização do processo.
// Mantido enxuto de propósito nesta etapa — cresce conforme os módulos
// seguintes (autenticação, tempo real, impressão) forem implementados.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL é obrigatório (Prisma Migrate)"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_TIMEZONE: z.string().default("America/Sao_Paulo"),
  APP_URL: z.string().url().default("http://localhost:3000"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  APP_TIMEZONE: process.env.APP_TIMEZONE,
  APP_URL: process.env.APP_URL,
});
