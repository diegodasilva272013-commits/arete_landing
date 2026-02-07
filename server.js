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
      "https://setteriaarete-n8n.ts3f2b.easypanel.host/webhook/arete-lead";

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

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
