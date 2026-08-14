// Agente local de impressão — MITIZ Mesas, Módulo 7.
// Roda FORA do app Next.js (que está no Vercel, serverless — não tem como
// falar com uma impressora USB). Este script roda no computador ligado na
// Epson, consulta a fila (polling) e imprime.
// Arquitetura completa: docs/printing/architecture.md no projeto principal.
//
// Como manda pra impressora: a node-thermal-printer só monta os bytes
// ESC/POS e grava num arquivo temporário (interface "arquivo", não
// "impressora" — evita depender do pacote `printer`, um driver nativo
// antigo/mal mantido que não instala em máquina sem Visual Studio Build
// Tools). Quem entrega o arquivo pra impressora de verdade é o comando
// nativo do Windows `copy /b` (cópia binária), apontando pro
// compartilhamento da impressora ou pra porta dela — o jeito clássico e
// sem dependência nenhuma de imprimir RAW/ESC-POS no Windows.
"use strict";

require("dotenv/config");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");
const { ThermalPrinter, PrinterTypes, CharacterSet } = require("node-thermal-printer");

const SERVER_URL = process.env.SERVER_URL;
const TOKEN = process.env.PRINT_AGENT_TOKEN;
// Alvo do `copy /b` — compartilhamento (\\localhost\NOME) ou porta
// (USB001, LPT1 etc.). Ver README.md "Descobrir o alvo da impressora".
const PRINTER_TARGET = process.env.PRINTER_TARGET;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);

if (!SERVER_URL || !TOKEN || !PRINTER_TARGET) {
  console.error(
    "Faltam variáveis de ambiente (SERVER_URL, PRINT_AGENT_TOKEN, PRINTER_TARGET). Veja .env.example.",
  );
  process.exit(1);
}

const TEMP_FILE = path.join(os.tmpdir(), "mitiz-print-job.prn");

const printer = new ThermalPrinter({
  type: PrinterTypes.EPSON,
  // Não é a impressora de verdade — só onde a lib grava os bytes ESC/POS
  // antes do copy /b mandar pra impressora (ver comentário no topo).
  interface: TEMP_FILE,
  // 42 colunas é o padrão pra bobina de 80mm. Se a impressora usa bobina
  // de 58mm, trocar para ~32 (ajustar aqui e testar num ticket real).
  width: 42,
  removeSpecialCharacters: false,
  // Sem isso, acento (Porção, Não, café...) falha ao codificar — a
  // biblioteca engole o erro internamente e segue em frente, então o
  // ticket sai sem avisar que teve texto faltando/errado.
  characterSet: CharacterSet.PC860_PORTUGUESE,
  options: { timeout: 5000 },
});

const TYPE_LABEL = {
  NEW_ORDER: "*** NOVO PEDIDO ***",
  COMPLEMENT: "*** COMPLEMENTO ***",
  CANCELLATION: "*** CANCELAMENTO ***",
  REPRINT: "*** REIMPRESSAO ***",
  BILL_SUMMARY: "*** RESUMO DA COMANDA ***",
};

function formatDateTimeBR(iso) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// "Imprimir conferência" (formato em src/domain/printing/bill-summary.ts
// no projeto principal) — resumo do atendimento inteiro, não de um pedido:
// itens consolidados, totais, divisão igual por pessoa e, se já houver,
// pagamentos e saldo. Valores já vêm formatados em BRL do servidor (nada
// de Decimal/Intl aqui, mesmo racional do resto do agente: dependência
// zero além do necessário pra imprimir).
function renderBillSummary(content) {
  printer.clear();
  printer.setTextDoubleHeight();
  printer.alignCenter();
  printer.bold(true);
  printer.println(content.restaurantName);
  printer.bold(false);
  printer.println(TYPE_LABEL.BILL_SUMMARY);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Mesa: ${content.tableNumber}`);
  printer.println(`Garcom: ${content.waiterName}`);
  printer.println(`Hora: ${formatDateTimeBR(content.generatedAt)}`);
  printer.drawLine();

  for (const item of content.items) {
    printer.bold(true);
    printer.println(`${item.quantity}x ${item.label}`);
    printer.bold(false);
    printer.leftRight(`  ${item.unitPrice} cada`, item.lineTotal);
  }
  printer.drawLine();

  printer.leftRight("Subtotal", content.subtotal);
  if (content.serviceCharge) printer.leftRight("Taxa de servico", content.serviceCharge);
  if (content.discount) printer.leftRight("Desconto", content.discount);
  printer.bold(true);
  printer.leftRight("TOTAL", content.total);
  printer.bold(false);
  printer.drawLine();

  printer.leftRight(`Dividido por ${content.guestCount} pessoa(s)`, content.perPersonShare);

  if (content.payments.length > 0) {
    printer.drawLine();
    printer.println("Pagamentos ja registrados:");
    for (const payment of content.payments) {
      const label = payment.guestName
        ? `${payment.methodName} (${payment.guestName})`
        : payment.methodName;
      printer.leftRight(`  ${label}`, payment.amount);
    }
    printer.leftRight("Pago", content.paidAmount);
  }

  printer.drawLine();
  printer.bold(true);
  printer.leftRight("SALDO", content.balance);
  printer.bold(false);

  printer.drawLine();
  printer.cut();
}

// Monta o ticket a partir do `contentSnapshot` (formato descrito em
// src/domain/printing/ticket.ts no projeto principal) — decisão de layout
// (negrito, corte, largura de coluna) é toda daqui, não do servidor.
function renderTicket(content) {
  if (content.type === "BILL_SUMMARY") {
    renderBillSummary(content);
    return;
  }

  printer.clear();
  // Só altura dobrada, não largura — deixa o texto maior/mais legível sem
  // mexer na largura de coluna (que já leva em conta o `width: 42` lá em
  // cima); dobrar a largura também cortaria a metade dos caracteres por
  // linha e bagunçaria a quebra de linha.
  printer.setTextDoubleHeight();
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
  // Responsável da mesa (preenchido opcional na abertura) — pedido do
  // usuário 2026-08-14: só aparece quando de fato preenchido, embaixo da
  // hora. Diferente de "Para:" de cada item (pessoa daquele item
  // específico) — este é sobre a mesa inteira.
  if (content.responsibleName) {
    printer.println(`Responsavel: ${content.responsibleName}`);
  }
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

// Manda o .prn (bytes ESC/POS crus) pra impressora de verdade via `copy
// /b` — comando nativo do Windows, sem dependência nenhuma de pacote
// externo. PRINTER_TARGET é `\\localhost\NOME_DO_COMPARTILHAMENTO` (nome
// pode ter espaço, ex.: "EPSON TM-T20" — por isso as aspas manuais aqui,
// em vez de deixar o Node tentar adivinhar o quoting pro cmd.exe) ou uma
// porta tipo `USB001`.
function sendToPrinter() {
  return new Promise((resolve, reject) => {
    const command = `copy /b "${TEMP_FILE}" "${PRINTER_TARGET}"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message || "").toString().trim() || "Falha no copy /b"));
        return;
      }
      resolve();
    });
  });
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
    await printer.execute(); // grava o .prn temporário
    await sendToPrinter(); // copy /b pra impressora de verdade

    await reportResult(job.id, { status: "PRINTED" });
    console.log(`[ok] job ${job.id} (${job.type}) impresso.`);
  } catch (error) {
    const message = String(error && error.message ? error.message : error).slice(0, 500);
    console.error(`[falha] job ${job.id}:`, message);
    await reportResult(job.id, { status: "FAILED", error: message });
  } finally {
    fs.promises.unlink(TEMP_FILE).catch(() => {});
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
console.log(`Impressora (copy /b): ${PRINTER_TARGET} — consultando a cada ${POLL_INTERVAL_MS}ms`);
tick();
setInterval(tick, POLL_INTERVAL_MS);
