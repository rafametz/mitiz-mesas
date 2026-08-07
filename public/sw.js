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

// Passthrough puro — sempre busca da rede, nunca serve nada do cache.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
