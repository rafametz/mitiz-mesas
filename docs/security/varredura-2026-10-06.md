# Relatório de Varredura de Segurança — MITIZ Mesas

- **Data:** 2026-10-06
- **Commit analisado:** `13711d2` (branch `main`)
- **Stack real:** Next.js 15 (App Router), React 19, TypeScript, Prisma 6 sobre Postgres do Supabase, Supabase Auth, Supabase Realtime, agente local de impressão em Node.
- **Método:** leitura arquivo por arquivo das rotas, Server Actions, middleware, camada de aplicação, configuração e dependências, com `grep` para padrões perigosos e `npm audit` para dependências.

**Adaptação ao escopo:** o modelo de relatório pedia PHP (PDO, mysqli, `unserialize`, `include` dinâmico). Nada disso existe neste projeto. Cada seção foi mapeada para o equivalente real da stack (Prisma no lugar de PDO, Server Actions no lugar de formulários PHP, JSON no lugar de `unserialize`).

---

## Resumo executivo

**Nível de segurança: ALTO. Score: 62/100.**

A base do código é sólida: não há SQL bruto, não há HTML injetado, permissões são checadas no servidor em todas as Server Actions e o token do agente de impressão fica só como hash. Os problemas que pesam são:

1. **Dependência com RCE não autenticada (Next.js 15.5.22).** É o único item crítico.
2. **Controle de acesso de leitura incompleto:** o perfil Produção consegue abrir páginas com totais financeiros de mesas e históricos.
3. **Ausência total de headers de segurança** (só HSTS): sem CSP e sem proteção contra clickjacking nas telas de pagamento.
4. **Cookies de sessão legíveis por JavaScript** (padrão do `@supabase/ssr`), o que agrava qualquer XSS futuro.

---

## Status das correções

| Item | Status | Como foi resolvido |
|---|---|---|
| 1. Next.js com RCE crítica | ✔ Corrigido (crítica zerada) | `next` fixado em `15.5.27` (exato). Build, typecheck, lint e testes passaram. Resta um alerta moderado no próprio Next, a confirmar na próxima varredura. |
| 2. Produção lê dados financeiros | ✔ Corrigido | Nova permissão `tables.view`, concedida a ADMIN, CASHIER e WAITER (migration `20261006130000_tables_view_permission`). Guardas em `/mesas`, `/mesas/[id]/*` (layout e páginas), histórico, retiradas e item "Mesas" da barra inferior. |
| 3. Headers de segurança | ✖ Pendente | — |
| 4. Cookie sem `httpOnly` | ✖ Pendente (decisão de arquitetura) | — |
| 5. Limite de login | ✖ Pendente (painel do Supabase) | — |
| 6. Dependências altas | ⚠ Parcial | Next corrigido; `prisma` CLI e demais ainda em aberto. |
| 7 a 11 | ✖ Pendente | Baixa prioridade. |

---

## Vulnerabilidades encontradas

### 1. Next.js 15.5.22 com RCE não autenticada — CRÍTICO

- **Tipo:** Componente vulnerável (A06:2021 — Vulnerable and Outdated Components).
- **Gravidade:** CRÍTICO.
- **Arquivo:** `package-lock.json`, linha 6058 (`node_modules/next` = `15.5.22`); `package.json` declara `"next": "^15.1.0"`.
- **Código vulnerável:** versão instalada dentro da faixa afetada.
- **Advisories (npm audit):**
  - `GHSA-p293-qw3h-jr36` — RCE não autenticada em servidores hospedados em Windows (CWE-22). Faixa afetada: `>=13.4.0 <15.5.24`.
  - `GHSA-2xp9-vwfh-vxw4` — RCE não autenticada na API de otimização de imagem quando há arquivos AVIF (CWE-1395). Faixa afetada: `>=10.0.0 <15.5.24`.
- **Explicação técnica:** as duas falhas atingem o servidor do Next antes de qualquer checagem de sessão da aplicação, então o middleware e os guards de permissão não protegem contra elas. O endpoint `/_next/image` existe por padrão, mesmo sem uso de `next/image` no código. A produção roda na Vercel (`regions: gru1`), que pode ter mitigação própria, mas isso não está confirmado. Em desenvolvimento, a máquina do restaurante é Windows.
- **Exemplo de ataque:** uma requisição HTTP crafted para `/_next/image` com um AVIF malicioso, sem login, executando código no servidor.
- **Correção recomendada:** atualizar para a linha corrigida mais recente da 15.5 (o `npm audit` indica `15.5.24` como mínimo; a última publicada é `15.5.27`). É atualização de patch dentro da mesma minor, com risco baixo.
- **Código seguro sugerido:**
  ```bash
  npm install next@15.5.27 --save-exact
  npm run build
  npm run test
  ```
  E depois, se preferir fixar a faixa em `package.json`: `"next": "~15.5.27"`.

---

### 2. Perfil Produção lê totais financeiros e históricos de mesas — ALTO

- **Tipo:** Controle de acesso quebrado (A01:2021 — Broken Access Control), falta de RBAC em páginas de leitura.
- **Gravidade:** ALTO.
- **Arquivos e linhas:**
  - `src/app/(staff)/mesas/page.tsx:28` — só `requireUser()`; a listagem exibe, na linha `142` e `147`, `totalAmount`, `paidAmount`, nome do garçom e quantidade de pessoas de todas as mesas.
  - `src/app/(staff)/mesas/[id]/layout.tsx` — só `requireUser()`; mostra status, horário, pessoas e garçom da sessão ativa.
  - `src/app/(staff)/mesas/[id]/page.tsx` — a comanda aparece para qualquer perfil logado; só a abertura de mesa checa `TABLES_OPEN` (linha `48`).
  - `src/app/(staff)/mesas/[id]/historico/page.tsx` — **sem nenhum guard**; mostra `formatBRL(session.totalAmount)` (linha `35`) de até 20 atendimentos encerrados.
  - `src/app/(staff)/mesas/[id]/historico/[sessionId]/page.tsx:26` — só `requireUser()`; mostra o resumo financeiro completo (linha `111`).
- **Código vulnerável:**
  ```tsx
  // src/app/(staff)/mesas/page.tsx
  const user = await requireUser();   // qualquer perfil logado
  // ...
  {formatBRL(session.totalAmount)}     // total da mesa exibido ao Produção
  ```
- **Explicação técnica:** `CLAUDE.md` §5 diz que o perfil Produção só deve "visualizar pedidos do seu setor". Hoje o perfil `KITCHEN` (Produção) recebe `PRODUCTION_STATUS_UPDATE` e `PRINT_JOBS_MANAGE`, mas nenhum código de leitura de mesas. As páginas de leitura, porém, não pedem nenhuma permissão. As ações de escrita estão protegidas (`registerPaymentAction` exige `PAYMENTS_REGISTER` e assim por diante), então o impacto é de **leitura**, não de alteração de dados.
- **Exemplo de ataque:** um usuário com perfil Produção, logado normalmente, abre `/mesas` e vê o total e o pago de todas as mesas, ou abre `/mesas/<id>/historico` e lê o faturamento de atendimentos encerrados. Não precisa de nenhuma ferramenta além do navegador.
- **Correção recomendada:** criar um código de permissão de visualização de mesas (`tables.view`), concedido a ADMIN, CASHIER e WAITER, e exigi-lo no layout de `/mesas` e nas páginas abaixo. Para o histórico, exigir ao menos `AUDIT_VIEW` ou uma das permissões de caixa. É preciso atualizar `ROLE_PERMISSIONS` e o seed; não é uma mudança só de tela.
- **Código seguro sugerido:**
  ```ts
  // src/domain/auth/permissions.ts — novo código
  TABLES_VIEW: "tables.view",

  // ROLE_PERMISSIONS
  ADMIN: Object.values(PERMISSIONS),           // já inclui
  CASHIER: [..., PERMISSIONS.TABLES_VIEW],
  WAITER:  [..., PERMISSIONS.TABLES_VIEW],
  KITCHEN: [PERMISSIONS.PRODUCTION_STATUS_UPDATE, PERMISSIONS.PRINT_JOBS_MANAGE], // sem TABLES_VIEW

  // src/app/(staff)/mesas/[id]/layout.tsx (e mesas/page.tsx, historico/*)
  const user = await requirePermission(PERMISSIONS.TABLES_VIEW);
  ```
  Como o layout `(staff)` é compartilhado, é melhor que o redirecionamento para Produção também seja feito no próprio layout de mesas, usando `redirect("/producao")` quando faltar `TABLES_VIEW`.

---

### 3. Ausência de headers de segurança — MÉDIO

- **Tipo:** Configuração insegura (A05:2021 — Security Misconfiguration).
- **Gravidade:** MÉDIO.
- **Arquivos:** `next.config.ts` (sem `headers()`, linha `4` só tem `reactStrictMode`); `vercel.json` (só `regions`).
- **Verificação real:** `curl -sI https://mitiz-mesas.vercel.app/login` devolve **apenas** `Strict-Transport-Security`. Não há `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` nem `Permissions-Policy`.
- **Explicação técnica:**
  - Sem `X-Frame-Options` nem `frame-ancestors`, a aplicação pode ser embutida num `<iframe>` de outro site. Um atacante sobrepõe botões invisíveis às telas de "Registrar pagamento" e "Fechar mesa" (clickjacking).
  - Sem CSP, qualquer XSS futuro executa script livre; hoje não há ponto de XSS, mas a defesa em profundidade está ausente.
  - Sem `nosniff`, o navegador pode reinterpretar tipos de arquivo.
- **Exemplo de ataque:** página hospedada em outro domínio com `<iframe src="https://mitiz-mesas.vercel.app/mesas/...">` transparente, induzindo um caixa a clicar em "Fechar mesa".
- **Correção recomendada:** definir headers globais no `next.config.ts`. Começar com CSP em modo `Content-Security-Policy-Report-Only` para não quebrar a hidratação do Next, e depois endurecer.
- **Código seguro sugerido:**
  ```ts
  // next.config.ts
  const securityHeaders = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",   // hidratação do Next; trocar por nonce depois
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} wss://${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://x.supabase.co").host}`,
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    },
  ];

  const nextConfig: NextConfig = {
    reactStrictMode: true,
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders }];
    },
  };
  ```

---

### 4. Cookies de sessão do Supabase sem `httpOnly` — MÉDIO

- **Tipo:** Gerenciamento de sessão (A07:2021 — Identification and Authentication Failures).
- **Gravidade:** MÉDIO.
- **Arquivos:** `node_modules/@supabase/ssr/dist/main/utils/constants.js:6-7` (`sameSite: "lax"`, `httpOnly: false`); `src/lib/supabase/server.ts` e `src/lib/supabase/middleware.ts` usam esses padrões sem sobrescrevê-los.
- **Código vulnerável:**
  ```ts
  // @supabase/ssr — padrão
  sameSite: "lax",
  httpOnly: false,
  ```
- **Explicação técnica:** o `httpOnly: false` é intencional no `@supabase/ssr`, porque o cliente do navegador precisa ler o token. A consequência é que qualquer XSS consegue ler o JWT de sessão e usá-lo de outro lugar. Como a aplicação não tem XSS hoje (ver checklist), o risco é latente, não ativo.
- **Exemplo de ataque:** um campo de texto do cliente (nome, observação) renderizado sem escape em alguma tela futura, com script que lê `document.cookie` e envia o token para fora.
- **Correção recomendada:** manter o `@supabase/ssr` (remover o cliente do navegador de telas que não precisam dele é trabalho grande, sem ganho imediato). A mitigação prática é o CSP do item 3, que impede o script de sair para outro domínio, e a regra de nunca usar `dangerouslySetInnerHTML`. Vale também reduzir a validade do JWT no painel do Supabase e confirmar que o `Secure` está ativo em produção (HTTPS).
- **Código seguro sugerido:** não há troca de código segura e simples; a correção é de arquitetura e de configuração do painel. Registrar a decisão como ADR se ela for aceita.

---

### 5. Login sem limitação de tentativas na aplicação — MÉDIO

- **Tipo:** Autenticação (A07:2021).
- **Gravidade:** MÉDIO (depende de configuração que não foi verificada no painel).
- **Arquivo:** `src/app/login/actions.ts:10-30` (`signIn`); não há contador de tentativas no código.
- **Explicação técnica:** a mensagem de erro é genérica (linha `22`, boa prática, sem enumeração de usuários). Porém, a aplicação não limita tentativas por IP ou por e-mail. A única barreira é o rate limit embutido no Supabase Auth, cujos valores não foram conferidos (não há acesso ao painel nesta varredura).
- **Exemplo de ataque:** tentativas automatizadas de senha contra contas de garçons com senhas fracas. Como o `createUser` aceita senha de 8 caracteres (`usuarios/actions.ts`), a superfície é real.
- **Correção recomendada:** no painel do Supabase, em Authentication > Rate limits, confirmar os limites de sign-in; subir a senha mínima para 10 caracteres no `passwordSchema`; avaliar CAPTCHA do Supabase se o cadastro for aberto.

---

### 6. Dependências de alta severidade — BAIXO (runtime) / MÉDIO (ferramentas)

- **Tipo:** Componentes vulneráveis.
- **Gravidade:** BAIXO para o que roda em produção; MÉDIO para o toolchain de build.
- **Arquivos:** `package-lock.json`.
- **Resultado do `npm audit`:** 25 vulnerabilidades no total (3 críticas, 17 altas, 5 moderadas), contando dependências de desenvolvimento. Só o `next` aparece como crítico em produção; as outras duas críticas estão em ferramentas de desenvolvimento.
- **Altas relevantes:**
  - `prisma` (CLI) — `6.13.0-dev.1` a `8.1.0-dev.4`, com correção disponível.
  - `sharp` — usado só em `scripts/generate-app-icons.ts`, não no servidor da aplicação.
  - `postcss`, `nanoid`, `deepmerge-ts`, `source-map-js` — cadeia de build.
- **Correção recomendada:** rodar `npm audit fix` em um branch e validar com `npm run build` e os testes. Para `prisma`, confirmar a versão corrigida antes de subir de major, porque o Prisma Client precisa ser regenerado.

---

### 7. JSON de pagamento sem schema na entrada — BAIXO

- **Tipo:** Validação de entrada (A03:2021 — Injection, defesa em profundidade).
- **Gravidade:** BAIXO.
- **Arquivo:** `src/app/(staff)/mesas/[id]/pagamentos/actions.ts:175`.
- **Código vulnerável:**
  ```ts
  allocations = JSON.parse(String(formData.get("allocationsJson") ?? "[]"));
  ```
- **Explicação técnica:** é o único `JSON.parse` de formulário sem Zod na entrada. A função `registerPayment` valida o conteúdo, então não há falha explorável hoje, mas a regra 24 do `CLAUDE.md` pede que a validação não dependa só do domínio. Os outros `JSON.parse` (`reservas-assados/actions.ts:31`, `pedidos/actions.ts:51`, `producao/.../actions.ts`) já passam por `zod`.
- **Correção recomendada:**
  ```ts
  const allocationsSchema = z.array(
    z.object({ orderItemId: z.string(), amount: z.string().regex(/^\d+(\.\d{1,2})?$/) }),
  ).max(200);

  allocations = allocationsSchema.parse(JSON.parse(String(formData.get("allocationsJson") ?? "[]")));
  ```
  Ajustar os campos ao tipo `AllocationRequest` real antes de aplicar.

---

### 8. Canais de tempo real públicos — BAIXO

- **Tipo:** Exposição de informação (A01:2021).
- **Gravidade:** BAIXO.
- **Arquivo:** `src/lib/realtime/publish.ts:36` (`private: false`).
- **Explicação técnica:** os canais de Broadcast são públicos, então quem tiver a chave anônima (ela fica no bundle do navegador, por design) consegue assinar um tópico e ver que algo mudou e em qual atendimento. O payload é só `{ type }`, sem valor financeiro nem nome de cliente, conforme a ADR 0003. O vazamento é de **atividade**, não de dado de negócio. Os tópicos usam UUID, o que dificulta adivinhação.
- **Correção recomendada:** migrar para canais privados com autorização por RLS em `realtime.messages`. É trabalho de média complexidade e só vale a pena se a operação passar a considerar a atividade sensível.

---

### 9. Bloqueio biométrico apenas na interface — BAIXO (informativo)

- **Tipo:** Controle de acesso no cliente.
- **Gravidade:** BAIXO.
- **Arquivo:** `src/components/auth/biometric-lock-screen.tsx:21`.
- **Explicação técnica:** o `BiometricLockScreen` envolve `children`, que já foi renderizado no servidor. O conteúdo chega ao navegador antes do desbloqueio e só fica oculto por CSS/estado. Quem inspeciona o HTML ou o payload RSC vê os dados sem a digital. O próprio comentário do componente diz que isto é "conveniência na frente de um acesso já autorizado", então não é uma falha de autorização: a sessão Supabase já exige login.
- **Correção recomendada:** nenhuma obrigatória. Se o requisito for impedir a leitura de dados em aparelho desbloqueado por terceiros, a tela precisaria buscar os dados só após o desbloqueio.

---

### 10. Logs com objetos de erro completos — BAIXO

- **Tipo:** Exposição de dados sensíveis em logs (A09:2021 — Logging and Monitoring Failures).
- **Gravidade:** BAIXO.
- **Arquivos:** `src/app/(staff)/mesas/[id]/pedidos/actions.ts` (`console.error("[createOrderAction] erro inesperado…", error)`), `src/app/(staff)/reservas-assados/actions.ts` (linhas `77`, `113`, `136`, `171`).
- **Explicação técnica:** erros do Prisma podem conter valores de campos em mensagens (por exemplo, violação de unicidade). Como o log vai para a Vercel, dados de cliente como telefone podem sobrar lá. Não há senha nem token registrado nos pontos verificados.
- **Correção recomendada:** logar `error.code` e a rota, não o objeto inteiro, e manter o objeto completo só em ambiente de desenvolvimento.

---

### 11. Token do agente de impressão em `.env` local — INFORMATIVO

- **Arquivo:** `printer-agent/agent.js:25` (`PRINT_AGENT_TOKEN` lido de variável de ambiente); `printer-agent/.env.example` (placeholder, correto).
- **Pontos positivos:** o servidor guarda só o SHA-256 do token (`src/lib/printing/token.ts`), o token tem 24 bytes aleatórios e há rotação pela tela de impressoras.
- **Observação:** quem tiver acesso ao computador do restaurante lê o `.env` em texto puro. É aceitável para este porte, desde que a máquina tenha acesso restrito.

---

### Pontos verificados e sem falha encontrada

- **SQL Injection:** não há `$queryRaw`, `$executeRaw` nem SQL concatenado em `src/`, `scripts/`, `prisma/` ou `tests/`. Todo acesso ao banco passa pelo Prisma, com parâmetros.
- **XSS:** não há `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` nem `document.write`. Os dados de cliente são renderizados pelo React, que escapa por padrão.
- **Execução de comando:** `child_process` só aparece no agente de impressão, com comando fixo (`copy /b`). O alvo (`PRINTER_TARGET`) vem de variável de ambiente local, não de entrada de usuário.
- **Deserialização:** não há `unserialize`, `pickle` nem `eval`. O único parse é `JSON.parse`, que não executa código.
- **CSRF:** Server Actions do Next 15 rejeitam requisições de origem diferente (verificação de `Origin`), e os cookies são `SameSite=Lax`. As rotas de API do agente usam `Authorization: Bearer` e não aceitam cookie, então não são alvo de CSRF.
- **IDOR na impressão:** `transitionJob` (`src/application/printing/print-queue.ts:62-66`) confere `job.printerId !== printerId`, então um agente não altera job de outra impressora.
- **Mass assignment:** os schemas Zod (`createUserSchema`, `cartSchema`, `itemsSchema`) listam os campos aceitos. Não há `...req.body` passado direto ao Prisma.
- **Segredos:** o `.env` está no `.gitignore` e não aparece no histórico do git. A busca por padrões de chave JWT e `sb_secret` no histórico retornou vazio. `SUPABASE_SERVICE_ROLE_KEY` só é lida em código de servidor (`src/lib/supabase/service-role.ts`, `src/lib/realtime/publish.ts`).
- **Redirecionamento aberto:** o middleware grava em `redirectTo` só o `pathname`, nunca uma URL externa, e a tela de login não lê esse parâmetro. Não há open redirect.
- **Proteção de rotas:** o middleware exige sessão em todas as rotas que não são `/api/`; as rotas de API se autenticam sozinhas (`authenticatePrinter`). Layouts `/admin` (`ADMIN_MANAGE`) e `(staff)` (sessão) estão protegidos, e as Server Actions têm guarda de permissão.
- **Senha:** o app não guarda senha. O hash fica no Supabase Auth; o `signIn` devolve mensagem genérica.
- **RLS:** corrigido nesta semana em `payment_item_allocations` (commit `13711d2`). As demais tabelas já tinham RLS ligado.

---

## Checklist OWASP

| Item | Situação | Observação |
|---|---|---|
| A01 Controle de acesso | ⚠ Parcial | Escrita protegida em todas as Server Actions; leitura de mesas e histórico sem permissão (item 2) |
| A02 Falhas criptográficas | ✔ Seguro | Hash de token do agente com SHA-256; senhas no Supabase Auth; HTTPS com HSTS |
| A03 Injection (SQL, XSS, comando) | ✔ Seguro | Prisma sem SQL bruto; React escapa; sem `dangerouslySetInnerHTML`. Parse de JSON sem Zod em um ponto (item 7) |
| A04 Design inseguro | ⚠ Parcial | Regras críticas no domínio e transacionais; falta modelo de permissão de leitura |
| A05 Configuração incorreta | ✖ Vulnerável | Sem headers de segurança além de HSTS (item 3) |
| A06 Componentes vulneráveis | ✖ Vulnerável | Next.js 15.5.22 com RCE crítica (item 1); Prisma CLI e outros com alta severidade |
| A07 Identificação e autenticação | ⚠ Parcial | Mensagem genérica e Supabase Auth; cookie sem `httpOnly` (item 4); sem limite de tentativas no app (item 5) |
| A08 Integridade de software e dados | ✔ Seguro | Sem deserialização insegura; migrations versionadas; Server Actions com verificação de origem |
| A09 Logs e monitoramento | ⚠ Parcial | Trilha de auditoria em ações críticas; erros logados como objeto completo (item 10) |
| A10 SSRF | ✔ Seguro | Nenhuma requisição com URL vinda de entrada de usuário; o endpoint de realtime usa URL do ambiente |
| CSRF | ✔ Seguro | Origin check do Next e `SameSite=Lax`; API com Bearer |
| XSS (armazenado, refletido, DOM) | ✔ Seguro | Nenhum ponto de injeção de HTML encontrado; falta CSP como barreira extra (item 3) |
| Sessão e cookies | ⚠ Parcial | `Secure` e expiração dependem do painel do Supabase, não verificados aqui |
| Upload de arquivos | ✔ Seguro | Não há upload de arquivo de usuário no sistema |
| Segredos no repositório | ✔ Seguro | `.env` ignorado e fora do histórico; `.env.example` só com placeholders |
| Headers HTTP | ✖ Vulnerável | Só HSTS (item 3) |

---

## Recomendações de hardening

- **Atualizar o Next.js** para `15.5.27` agora (item 1). Prioridade máxima.
- **Criar `tables.view` e aplicar RBAC de leitura** em `/mesas`, `/mesas/[id]` e histórico (item 2).
- **Adicionar headers de segurança** no `next.config.ts`, começando com CSP em `Report-Only` (item 3).
- **Sanitização centralizada de entrada:** toda Server Action que recebe JSON deve passar por Zod (item 7).
- **Rate limit de login:** configurar no Supabase e subir a senha mínima para 10 caracteres (item 5).
- **Logs seguros:** padronizar um logger que registre código e rota, nunca o objeto de erro bruto (item 10).
- **Monitoramento:** alerta na Vercel para erros 5xx e no Supabase para falhas de login em sequência.
- **Testes de permissão:** adicionar teste de integração que chame cada página de leitura com um usuário de Produção e espere redirecionamento.
- **WAF:** não se aplica no porte atual; a Vercel já oferece proteção básica contra DDoS.
- **Rotação de token do agente** a cada troca de equipe ou máquina.

---

## Score final de segurança

**62 / 100 — Nível ALTO.**

| Critério | Peso | Nota |
|---|---|---|
| Injeção e XSS | 20 | 19 |
| Controle de acesso | 20 | 12 |
| Autenticação e sessão | 15 | 10 |
| Configuração e headers | 15 | 5 |
| Dependências | 15 | 4 |
| Segredos e dados sensíveis | 10 | 9 |
| Logs e auditoria | 5 | 3 |
| **Total** | **100** | **62** |

**Riscos principais, em ordem:**

1. Execução remota não autenticada pelo Next.js desatualizado (item 1): é o único risco que não depende de ninguém logado.
2. Perfil Produção lendo faturamento de mesas (item 2): risco interno, mas viola a regra de perfis do `CLAUDE.md`.
3. Ausência de CSP e anti-clickjacking nas telas de pagamento (item 3).
4. JWT de sessão acessível por JavaScript (item 4), que só pesa se surgir um XSS.

**Limites desta varredura:** não houve acesso ao painel do Supabase (rate limits, validade do JWT, flags de cookie) nem ao painel da Vercel (mitigações próprias do Next). Testes dinâmicos (ataques reais contra a produção) não foram feitos; a análise é estática, com uma checagem de headers em produção.
