// Service Worker mínimo — existe só pra habilitar a instalação do PWA
// (ícone na tela inicial, abrir em tela cheia). De propósito, NÃO guarda
// nenhum dado do app em cache: mesa, pedido e status de produção sempre
// precisam vir da rede, nunca de uma versão antiga guardada aqui — decisão
// explícita (o app é operação em tempo real; informação desatualizada pro
// garçom/caixa é um risco real, não um detalhe).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Bug real em produção (2026-08-07): a versão anterior fazia
// `event.respondWith(fetch(event.request))` — parecia um passthrough
// inócuo, mas reencaminhar a MESMA requisição por dentro do Service
// Worker não é transparente pra todo tipo de request. Quebrou o POST das
// Server Actions do Next.js (ex.: salvar produto no admin virava erro
// 500). Não existe motivo nenhum pra interceptar essas chamadas — o
// listener continua registrado (alguns critérios de instalação mais
// antigos checam isso), mas sem chamar respondWith() em lugar nenhum, o
// que garante que o navegador segue com a requisição original,
// exatamente como se este arquivo não existisse.
self.addEventListener("fetch", () => {});
