require("dotenv").config();

const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");

const app = express();
const PORT = process.env.PORT || 3000;

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

app.post("/api/submit", async (req, res) => {
  const { nombre, empresa, cargo, email, telefono, mejora } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ message: "Nombre y email son requeridos." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const pdfBuffer = await buildPdfBuffer({ nombre, empresa, cargo, email, telefono, mejora });

    const mailTo = process.env.MAIL_TO || "diegodasilva272013@gmail.com";
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;

    const mail = {
      from,
      to: mailTo,
      subject: "Nuevo Blueprint Diagnostic",
      text: `Nuevo lead:\n\nNombre: ${nombre}\nEmpresa: ${empresa}\nCargo: ${cargo}\nEmail: ${email}\nTeléfono: ${telefono}\nMejora con IA: ${mejora}`,
      attachments: [
        {
          filename: "blueprint-diagnostic.pdf",
          content: pdfBuffer
        }
      ]
    };

    await transporter.sendMail(mail);

    if (String(process.env.SEND_COPY_TO_USER).toLowerCase() === "true" && email) {
      await transporter.sendMail({
        from,
        to: email,
        subject: "Tu Blueprint Diagnostic",
        text: "Gracias por tu solicitud. Adjuntamos tu Blueprint Diagnostic.",
        attachments: [
          {
            filename: "blueprint-diagnostic.pdf",
            content: pdfBuffer
          }
        ]
      });
    }

    return res.json({ message: "Enviado correctamente." });
  } catch (error) {
    return res.status(500).json({ message: "Error enviando el formulario." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
