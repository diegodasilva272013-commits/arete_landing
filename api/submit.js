const path = require("path");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");

const APP_VERSION = "vercel-native-2026-07-25";
const projectRoot = path.resolve(__dirname, "..");

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (_) {
        const params = new URLSearchParams(body);
        const result = {};
        for (const [key, value] of params.entries()) {
          result[key] = value;
        }
        resolve(result);
      }
    });
  });
}

function buildPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    const logoPath = path.join(projectRoot, "assets", "arete_logo_lockup.png.png");
    try {
      doc.image(logoPath, 50, 40, { width: 140 });
    } catch (_) {
      // Continue without logo if the asset is unavailable.
    }

    const companyLine = data.empresa ? `Empresa: ${data.empresa}` : "Empresa: -";
    const dateLine = `Fecha: ${new Date().toLocaleDateString("es-ES")}`;

    doc.fillColor("#0b1b2b").fontSize(18).text("Blueprint Diagnostic", 50, 125, { align: "left" });
    doc.fillColor("#3b6bd6").fontSize(11).text("Areté Soluciones", 50, 150, { align: "left" });
    doc.fillColor("#0b1b2b").fontSize(10).text(companyLine, 380, 130, { align: "left" }).text(dateLine, 380, 145, { align: "left" });
    doc.moveTo(50, 175).lineTo(545, 175).strokeColor("#e5e7eb").stroke();
    doc.moveDown(4).fillColor("#111827").fontSize(12).text("Datos de contacto:");

    const fields = [
      ["Nombre", data.nombre],
      ["Empresa", data.empresa],
      ["Cargo", data.cargo],
      ["Email", data.email],
      ["Teléfono", data.telefono],
      ["Mejora con IA", data.mejora]
    ];

    fields.forEach(([label, value]) => {
      doc.fillColor("#0b1b2b").fontSize(11).text(`${label}:`, { continued: true });
      doc.fillColor("#111827").fontSize(11).text(` ${value || "-"}`);
    });

    doc.moveDown(2).fillColor("#6b7280").fontSize(10).text("Generado automáticamente desde Blueprint Diagnostic.");
    doc.end();
  });
}

async function requestUrl(url, method = "GET", body = "") {
  const opts = { method, redirect: "follow" };

  if (method !== "GET") {
    opts.headers = { "Content-Type": "application/json" };
    if (body) opts.body = body;
  }

  const res = await fetch(url, opts);
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: text };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(`<!DOCTYPE html><html lang="es"><body><h1>Blueprint Diagnostic</h1><p>La app está lista para Vercel.</p></body></html>`);
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ message: "Método no permitido", version: APP_VERSION }));
  }

  const body = await parseBody(req);

  if (!body || Object.keys(body).length === 0) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ message: "El formulario llegó vacío.", version: APP_VERSION }));
  }

  const { nombre, empresa, cargo, email, telefono, mejora } = body;

  if (!nombre || !email) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ message: "Nombre y email son requeridos.", version: APP_VERSION }));
  }

  const payload = {
    nombre,
    empresa: empresa || "",
    cargo: cargo || "",
    email,
    telefono: telefono || "",
    mejora: mejora || "",
    source: "blueprint-diagnostic",
    submittedAt: new Date().toISOString()
  };

  const webhookUrl = process.env.WEBHOOK_URL || "https://setteriaarete-n8n.ts3f2b.easypanel.host/webhook/arete-lead/";

  const sendWebhook = async () => {
    const r = await requestUrl(webhookUrl, "POST", JSON.stringify(payload));
    return r;
  };

  const sendEmail = async () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP no configurado.");
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    const pdfBuffer = await buildPdfBuffer(payload);
    const mailTo = process.env.MAIL_TO || "diegodasilva272013@gmail.com";
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;

    await transporter.sendMail({
      from,
      to: mailTo,
      subject: "Nuevo Blueprint Diagnostic",
      text: `Nuevo lead:\n\nNombre: ${nombre}\nEmpresa: ${empresa}\nCargo: ${cargo}\nEmail: ${email}\nTeléfono: ${telefono}\nMejora con IA: ${mejora}`,
      attachments: [{ filename: "blueprint-diagnostic.pdf", content: pdfBuffer }]
    });

    if (String(process.env.SEND_COPY_TO_USER).toLowerCase() === "true" && email) {
      await transporter.sendMail({
        from,
        to: email,
        subject: "Tu Blueprint Diagnostic",
        text: "Gracias por tu solicitud. Adjuntamos tu Blueprint Diagnostic.",
        attachments: [{ filename: "blueprint-diagnostic.pdf", content: pdfBuffer }]
      });
    }

    return { ok: true };
  };

  const [wh, em] = await Promise.allSettled([sendWebhook(), sendEmail()]);
  const webhookOk = wh.status === "fulfilled" && wh.value?.ok === true;
  const emailOk = em.status === "fulfilled";

  res.statusCode = webhookOk && emailOk ? 200 : 502;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify({
    message: webhookOk && emailOk ? "OK: webhook y email enviados." : "Hubo un problema al procesar el formulario.",
    version: APP_VERSION,
    webhookOk,
    emailOk
  }));
};
