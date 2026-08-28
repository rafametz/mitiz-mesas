import "server-only";

// Cliente HTTP para a API v2 da VHSYS (https://developers.vhsys.com.br/api/).
// Fase 1 da integração (planejada 2026-08-25, análise aprovada pelo
// usuário): só cobre a leitura de produtos, usada exclusivamente pela tela
// de vínculo manual /admin/integracoes/vhsys — nunca chamada no momento da
// venda. As credenciais são lidas de variável de ambiente (mesmo padrão já
// usado para o Supabase neste projeto — CLAUDE.md §14, nunca em texto
// puro em código ou documentação) e checadas só quando a função é
// chamada, não na inicialização do processo: a integração é opcional até
// alguém configurar, e nunca pode travar o boot do app nem o restante da
// tela de administração.
const VHSYS_BASE_URL = "https://api.vhsys.com/v2";
// Identifica a aplicação nas requisições (exigido pela VHSYS) — não é
// segredo, pode ficar fixo no código.
const VHSYS_USER_AGENT = "MITIZMesas/1.0";

export class VhsysConfigError extends Error {}
export class VhsysApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function requireEnv(name: "VHSYS_ACCESS_TOKEN" | "VHSYS_SECRET_ACCESS_TOKEN"): string {
  const value = process.env[name];
  if (!value) {
    throw new VhsysConfigError(
      `Integração VHSYS não configurada: variável de ambiente ${name} ausente.`,
    );
  }
  return value;
}

function vhsysHeaders(): HeadersInit {
  return {
    "access-token": requireEnv("VHSYS_ACCESS_TOKEN"),
    "secret-access-token": requireEnv("VHSYS_SECRET_ACCESS_TOKEN"),
    "User-Agent": VHSYS_USER_AGENT,
    "Content-Type": "application/json",
  };
}

// Verdadeiro quando as duas variáveis de ambiente necessárias existem —
// usado pela tela admin pra distinguir "ainda não configurado" (estado
// esperado, orienta a próxima ação) de um erro real de rede/API.
export function isVhsysConfigured(): boolean {
  return Boolean(process.env.VHSYS_ACCESS_TOKEN && process.env.VHSYS_SECRET_ACCESS_TOKEN);
}

export type VhsysProduct = {
  idProduto: number;
  codProduto: string | null;
  descProduto: string;
  valorProduto: string | null;
  unidadeProduto: string | null;
  statusProduto: string | null;
};

type VhsysListProdutosResponse = {
  code: number;
  status: string;
  message?: string;
  paging?: { total_count?: number };
  data?: Array<Record<string, unknown>>;
};

// GET /produtos — https://developers.vhsys.com.br/api/listar-produtos-16211257e0
// Só usada pela tela de vínculo manual: o admin busca pelo nome do produto
// já cadastrado na VHSYS e copia o id_produto pra gravar no MITIZ. Nunca
// chamada automaticamente no momento de uma venda (decisão do usuário:
// vínculo sempre manual e explícito, nunca resolução por nome).
export async function listVhsysProducts(params: {
  descProduto?: string;
  offset?: number;
  limit?: number;
}): Promise<{ products: VhsysProduct[]; totalCount: number }> {
  const query = new URLSearchParams();
  if (params.descProduto) query.set("desc_produto", params.descProduto);
  query.set("limit", String(params.limit ?? 50));
  query.set("offset", String(params.offset ?? 0));
  // Só produtos não excluídos — não faz sentido vincular um produto que
  // foi apagado na VHSYS.
  query.set("lixeira", "Nao");

  let response: Response;
  try {
    response = await fetch(`${VHSYS_BASE_URL}/produtos?${query.toString()}`, {
      method: "GET",
      headers: vhsysHeaders(),
      cache: "no-store",
    });
  } catch {
    throw new VhsysApiError("Não foi possível conectar à VHSYS. Tente novamente.", 0);
  }

  const body = (await response.json().catch(() => null)) as VhsysListProdutosResponse | null;

  if (!response.ok || body?.status !== "success") {
    throw new VhsysApiError(
      body?.message ?? `Falha ao consultar produtos na VHSYS (HTTP ${response.status}).`,
      response.status,
    );
  }

  return {
    products: (body.data ?? []).map((item) => ({
      idProduto: Number(item.id_produto),
      codProduto: (item.cod_produto as string | undefined) ?? null,
      descProduto: String(item.desc_produto ?? ""),
      valorProduto: (item.valor_produto as string | undefined) ?? null,
      unidadeProduto: (item.unidade_produto as string | undefined) ?? null,
      statusProduto: (item.status_produto as string | undefined) ?? null,
    })),
    totalCount: Number(body.paging?.total_count ?? 0),
  };
}
