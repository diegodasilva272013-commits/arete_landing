require("dotenv").config();

const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const http = require("http");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;
const APP_VERSION = "webhook-native-http-2026-02-07";

app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function buildPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    const logoPath = path.join(__dirname, "assets", "arete_logo_lockup.png.png");
    try {
      doc.image(logoPath, 50, 40, { width: 140 });
    } catch (_) {
      // If logo fails, continue without it.
    }

    const companyLine = data.empresa ? `Empresa: ${data.empresa}` : "Empresa: -";
    const dateLine = `Fecha: ${new Date().toLocaleDateString("es-ES")}`;

    doc
      .fillColor("#0b1b2b")
      .fontSize(18)
      .text("Blueprint Diagnostic", 50, 125, { align: "left" });

    doc
      .fillColor("#3b6bd6")
      .fontSize(11)
      .text("Areté Soluciones", 50, 150, { align: "left" });

    doc
      .fillColor("#0b1b2b")
      .fontSize(10)
      .text(companyLine, 380, 130, { align: "left" })
      .text(dateLine, 380, 145, { align: "left" });

    doc
      .moveTo(50, 175)
      .lineTo(545, 175)
      .strokeColor("#e5e7eb")
      .stroke();

    doc.moveDown(4);
    doc.fillColor("#111827").fontSize(12).text("Datos de contacto:");

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

    doc.moveDown(2);
    doc.fillColor("#6b7280").fontSize(10).text("Generado automáticamente desde Blueprint Diagnostic.");

    doc.end();
  });
}

function requestUrl(url, method = "GET", body = "", redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const headers = {
      Accept: "application/json",
      "User-Agent": "arete-backend/1.0"
    };

    if (method !== "GET" && body) headers["Content-Type"] = "application/json";
    if (body) headers["Content-Length"] = Buffer.byteLength(body);

    const req = client.request(
      {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers
      },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
          const nextUrl = new URL(res.headers.location, parsedUrl).toString();
          res.resume();
          return resolve(requestUrl(nextUrl, method, body, redirectsLeft - 1));
        }

        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: data
          })
        );
      }
    );

    req.setTimeout(15000, () => req.destroy(new Error("Request timeout")));
    req.on("error", reject);

    if (body) req.write(body);
    req.end();
  });
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

  const buildGetUrl = () => {
    const url = new URL(webhookUrl);
    Object.entries(payload).forEach(([k, v]) => url.searchParams.set(k, String(v ?? "")));
    return url.toString();
  };

  const sendWebhook = async () => {
    const url = buildGetUrl();
    console.log("WEBHOOK URL length:", url.length);
    console.log("WEBHOOK URL:", url);

    if (url.length > 4000) {
      return { ok: false, status: 414, body: "URI_TOO_LONG: el GET es demasiado largo (campo 'mejora' suele causar esto)." };
    }

    const r = await requestUrl(url, "GET");
    console.log("WEBHOOK RES:", r.status, (r.body || "").slice(0, 200));
    return r;
  };

  const sendEmail = async () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP no configurado (faltan SMTP_HOST/SMTP_USER/SMTP_PASS).");
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
      text:
        `Nuevo lead:\n\nNombre: ${nombre}\nEmpresa: ${empresa}\nCargo: ${cargo}\nEmail: ${email}\nTeléfono: ${telefono}\nMejora con IA: ${mejora}`,
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

  const webhookError = wh.status === "rejected"
    ? String(wh.reason?.message || wh.reason)
    : webhookOk
      ? null
      : `status=${wh.value?.status} body=${String(wh.value?.body || "").slice(0, 200)}`;

  const emailError = em.status === "rejected"
    ? String(em.reason?.message || em.reason)
    : null;

  if (!webhookOk || !emailOk) {
    return res.status(502).json({
      message: `ERROR: ${!webhookOk ? "falló WEBHOOK" : ""}${(!webhookOk && !emailOk) ? " y " : ""}${!emailOk ? "falló EMAIL" : ""}.`,
      version: APP_VERSION,
      webhookOk,
      emailOk,
      webhookError,
      emailError
    });
  }

  return res.status(200).json({
    message: "OK: webhook y email enviados.",
    version: APP_VERSION,
    webhookOk: true,
    emailOk: true
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
