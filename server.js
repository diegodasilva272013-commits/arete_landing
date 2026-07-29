require("dotenv").config();

const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const { saveSubmission } = require("./lib/storage");
const { buildLeadEmailHtml, buildUserCopyHtml } = require("./lib/email");

const app = express();
const PORT = process.env.PORT || 3000;
const APP_VERSION = "webhook-native-http-2026-07-26";

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

app.post("/api/submit", async (req, res) => {
  const ct = req.headers["content-type"] || "";
  console.log("CT:", ct);
  console.log("BODY:", req.body);

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      message: "ERROR: el backend recibió el formulario VACÍO (body vacío). Revisá el envío del front (Content-Type).",
      version: APP_VERSION
    });
  }

  const { nombre, empresa, cargo, email, telefono, mejora } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({
      message: "ERROR: Nombre y email son requeridos (faltan o llegaron vacíos).",
      version: APP_VERSION,
      receivedKeys: Object.keys(req.body)
    });
  }

  const webhookUrl =
    process.env.WEBHOOK_URL || "https://setteriaarete-n8n.ts3f2b.easypanel.host/webhook/arete-lead/";

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

  const sendWebhook = async () => {
    if (!process.env.WEBHOOK_URL) {
      return { ok: true, skipped: true, reason: "Sin webhook configurado." };
    }

    console.log("WEBHOOK URL:", webhookUrl);
    const r = await requestUrl(webhookUrl, "POST", JSON.stringify(payload));
    console.log("WEBHOOK RES:", r.status, (r.body || "").slice(0, 200));
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
      text:
        `Nuevo lead:\n\nNombre: ${nombre}\nEmpresa: ${empresa}\nCargo: ${cargo}\nEmail: ${email}\nTeléfono: ${telefono}\nMejora con IA: ${mejora}`
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
  const storedLocally = saveSubmission(payload, __dirname);

  const webhookOk = wh.status === "fulfilled" && (wh.value?.ok === true || wh.value?.skipped === true);
  const emailOk = em.status === "fulfilled" && (em.value?.ok === true || em.value?.skipped === true);

  const webhookError = wh.status === "rejected"
    ? String(wh.reason?.message || wh.reason)
    : wh.value?.skipped
      ? "skipped"
      : null;

  const emailError = em.status === "rejected"
    ? String(em.reason?.message || em.reason)
    : em.value?.skipped
      ? "skipped"
      : null;

  const delivered = webhookOk || emailOk;

  return res.status(delivered || storedLocally ? 200 : 500).json({
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
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
