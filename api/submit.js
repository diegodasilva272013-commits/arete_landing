const path = require("path");
const nodemailer = require("nodemailer");
const { saveSubmission } = require("../lib/storage");
const { buildLeadEmailHtml, buildUserCopyHtml } = require("../lib/email");

const APP_VERSION = "vercel-native-2026-07-26";
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
    if (!process.env.WEBHOOK_URL) {
      return { ok: true, skipped: true, reason: "Sin webhook configurado." };
    }

    const r = await requestUrl(webhookUrl, "POST", JSON.stringify(payload));
    if (!r.ok) {
      throw new Error(`Webhook falló: ${r.status}`);
    }
    return r;
  };

  const sendEmail = async () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return { ok: true, skipped: true, reason: "Sin SMTP configurado." };
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    const mailTo = process.env.MAIL_TO || "diegodasilva272013@gmail.com";
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;

    await transporter.sendMail({
      from,
      to: mailTo,
      subject: `Nuevo Blueprint Diagnostic — ${nombre}`,
      html: buildLeadEmailHtml(payload),
      text: `Nuevo lead:\n\nNombre: ${nombre}\nEmpresa: ${empresa}\nCargo: ${cargo}\nEmail: ${email}\nTeléfono: ${telefono}\nMejora con IA: ${mejora}`
    });

    if (String(process.env.SEND_COPY_TO_USER).toLowerCase() === "true" && email) {
      await transporter.sendMail({
        from,
        to: email,
        subject: "Tu Blueprint Diagnostic",
        html: buildUserCopyHtml(),
        text: "Gracias por tu solicitud. Nuestro equipo se va a contactar a la brevedad."
      });
    }

    return { ok: true };
  };

  const [wh, em] = await Promise.allSettled([sendWebhook(), sendEmail()]);
  const storedLocally = saveSubmission(payload, projectRoot);
  const webhookOk = wh.status === "fulfilled" && (wh.value?.ok === true || wh.value?.skipped === true);
  const emailOk = em.status === "fulfilled" && (em.value?.ok === true || em.value?.skipped === true);
  const webhookError = wh.status === "rejected" ? String(wh.reason?.message || wh.reason) : null;
  const emailError = em.status === "rejected" ? String(em.reason?.message || em.reason) : null;

  const delivered = webhookOk || emailOk;

  res.statusCode = delivered || storedLocally ? 200 : 500;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify({
    message: delivered
      ? "Recibimos tu solicitud."
      : storedLocally
        ? "Recibimos tu solicitud y la guardamos para seguimiento, pero no pudimos notificarla en el momento."
        : "No pudimos procesar la solicitud.",
    version: APP_VERSION,
    webhookOk,
    emailOk,
    webhookError,
    emailError,
    storedLocally
  }));
};
