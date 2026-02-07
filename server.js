require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post("/api/submit", async (req, res) => {
  const { nombre, empresa, cargo, email, telefono, mejora } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ message: "Nombre y email son requeridos." });
  }

  try {
    const webhookUrl =
      process.env.N8N_WEBHOOK_URL ||
      "https://setteriaarete-n8n.ts3f2b.easypanel.host/webhook-test/arete-lead";

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

    const webhookMethod = (process.env.N8N_WEBHOOK_METHOD || "AUTO").toUpperCase();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const baseOptions = {
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal
    };

    const buildGetUrl = () => {
      const url = new URL(webhookUrl);
      Object.entries(payload).forEach(([key, value]) => {
        url.searchParams.set(key, String(value ?? ""));
      });
      return url.toString();
    };

    let response;

    if (webhookMethod === "GET") {
      response = await fetch(buildGetUrl(), {
        ...baseOptions,
        method: "GET"
      });
    } else if (webhookMethod === "POST") {
      response = await fetch(webhookUrl, {
        ...baseOptions,
        method: "POST",
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch(webhookUrl, {
        ...baseOptions,
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        response = await fetch(buildGetUrl(), {
          ...baseOptions,
          method: "GET"
        });
      }
    }

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ message: "Error enviando al webhook." });
    }

    return res.json({ message: "Enviado correctamente." });
  } catch (error) {
    return res.status(500).json({ message: "Error enviando el formulario." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
