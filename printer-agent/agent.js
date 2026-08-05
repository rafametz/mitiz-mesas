// Agente local de impressão — MITIZ Mesas, Módulo 7.
// Roda FORA do app Next.js (que está no Vercel, serverless — não tem como
// falar com uma impressora USB). Este script roda no computador ligado na
// Epson, consulta a fila (polling) e imprime.
// Arquitetura completa: docs/printing/architecture.md no projeto principal.
"use strict";

require("dotenv/config");
const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");

const SERVER_URL = process.env.SERVER_URL;
const TOKEN = process.env.PRINT_AGENT_TOKEN;
const PRINTER_INTERFACE = process.env.PRINTER_INTERFACE;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);

if (!SERVER_URL || !TOKEN || !PRINTER_INTERFACE) {
  console.error(
    "Faltam variáveis de ambiente (SERVER_URL, PRINT_AGENT_TOKEN, PRINTER_INTERFACE). Veja .env.example.",
  );
  process.exit(1);
}

const printer = new ThermalPrinter({
  type: PrinterTypes.EPSON,
  interface: PRINTER_INTERFACE,
  // 42 colunas é o padrão pra bobina de 80mm. Se a impressora usa bobina
  // de 58mm, trocar para ~32 (ajustar aqui e testar num ticket real).
  width: 42,
  removeSpecialCharacters: false,
  options: { timeout: 5000 },
});

const TYPE_LABEL = {
  NEW_ORDER: "*** NOVO PEDIDO ***",
  COMPLEMENT: "*** COMPLEMENTO ***",
  CANCELLATION: "*** CANCELAMENTO ***",
  REPRINT: "*** REIMPRESSAO ***",
};

function formatDateTimeBR(iso) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Monta o ticket a partir do `contentSnapshot` (formato descrito em
// src/domain/printing/ticket.ts no projeto principal) — decisão de layout
// (negrito, corte, largura de coluna) é toda daqui, não do servidor.
function renderTicket(content) {
  printer.clear();
  printer.alignCenter();
  printer.bold(true);
  printer.println(content.restaurantName);
  printer.bold(false);
  printer.println(TYPE_LABEL[content.type] || content.type);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Mesa: ${content.tableNumber}`);
  printer.println(`Pedido: #${content.orderSequenceNumber}`);
  printer.println(`Garcom: ${content.waiterName}`);
  printer.println(`Setor: ${content.sectorName}`);
  printer.println(`Hora: ${formatDateTimeBR(content.generatedAt)}`);
  printer.drawLine();

  for (const item of content.items) {
    printer.bold(true);
    printer.println(`${item.quantity}x ${item.productName}`);
    printer.bold(false);
    if (item.meatPointLabel) printer.println(`  Ponto: ${item.meatPointLabel}`);
    if (item.modifiers && item.modifiers.length > 0) {
      printer.println(`  + ${item.modifiers.join(", ")}`);
    }
    if (item.guestName) printer.println(`  Para: ${item.guestName}`);
    if (item.notes) {
      printer.bold(true);
      printer.println(`  OBS: ${item.notes}`);
      printer.bold(false);
    }
  }

  if (content.cancelReason) {
    printer.drawLine();
    printer.bold(true);
    printer.println(`MOTIVO: ${content.cancelReason}`);
    printer.bold(false);
  }

  printer.drawLine();
  printer.cut();
}

async function fetchPendingJobs() {
  const response = await fetch(`${SERVER_URL}/api/print-jobs/pending`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (response.status === 401) {
    throw new Error("Token inválido (401) — gere um novo em /admin/impressoras.");
  }
  if (!response.ok) {
    throw new Error(`Falha ao consultar a fila (HTTP ${response.status}).`);
  }
  const data = await response.json();
  return data.jobs || [];
}

async function reportResult(jobId, body) {
  const response = await fetch(`${SERVER_URL}/api/print-jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error(`[aviso] não consegui confirmar o job ${jobId} pro servidor (HTTP ${response.status}).`);
  }
}

async function processJob(job) {
  try {
    renderTicket(job.content);

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      throw new Error("Impressora não respondeu (verifique USB e se está ligada).");
    }

    await printer.execute();
    await reportResult(job.id, { status: "PRINTED" });
    console.log(`[ok] job ${job.id} (${job.type}) impresso.`);
  } catch (error) {
    const message = String(error && error.message ? error.message : error).slice(0, 500);
    console.error(`[falha] job ${job.id}:`, message);
    await reportResult(job.id, { status: "FAILED", error: message });
  }
}

let ticking = false;

async function tick() {
  if (ticking) return; // não sobrepõe consultas se uma impressão demorar
  ticking = true;
  try {
    const jobs = await fetchPendingJobs();
    for (const job of jobs) {
      await processJob(job);
    }
  } catch (error) {
    console.error("[erro] polling:", error.message || error);
  } finally {
    ticking = false;
  }
}

console.log(`Agente de impressão MITIZ — servidor: ${SERVER_URL}`);
console.log(`Impressora: ${PRINTER_INTERFACE} — consultando a cada ${POLL_INTERVAL_MS}ms`);
tick();
setInterval(tick, POLL_INTERVAL_MS);
