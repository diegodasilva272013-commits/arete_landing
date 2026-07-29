function row(label, value) {
  return `
    <tr>
      <td style="padding:8px 12px;font:600 13px Helvetica,Arial,sans-serif;color:#0b1b2b;border-bottom:1px solid #e5e7eb;width:120px;">${label}</td>
      <td style="padding:8px 12px;font:400 13px Helvetica,Arial,sans-serif;color:#374151;border-bottom:1px solid #e5e7eb;">${value || "-"}</td>
    </tr>`;
}

function buildLeadEmailHtml(data) {
  return `
  <div style="background:#f4f6fa;padding:24px;font-family:Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#0b1b2b;padding:20px 24px;">
        <span style="color:#ffffff;font-size:16px;font-weight:700;">Areté Soluciones</span>
        <div style="color:#93b4f0;font-size:12px;margin-top:2px;">Nuevo lead · Blueprint Diagnostic</div>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;">
          ${row("Nombre", data.nombre)}
          ${row("Empresa", data.empresa)}
          ${row("Cargo", data.cargo)}
          ${row("Email", data.email)}
          ${row("Teléfono", data.telefono)}
        </table>
        <div style="margin-top:16px;">
          <div style="font:600 13px Helvetica,Arial,sans-serif;color:#0b1b2b;margin-bottom:6px;">¿Cómo mejoraría su negocio con IA?</div>
          <div style="background:#eef3fc;border:1px solid #d7e3f7;border-radius:6px;padding:12px 14px;font:400 13px Helvetica,Arial,sans-serif;color:#374151;white-space:pre-wrap;">${data.mejora || "-"}</div>
        </div>
        <p style="font:400 12px Helvetica,Arial,sans-serif;color:#6b7280;margin-top:20px;">Se adjunta el PDF con el detalle completo del diagnóstico.</p>
      </div>
    </div>
  </div>`;
}

function buildUserCopyHtml() {
  return `
  <div style="background:#f4f6fa;padding:24px;font-family:Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#0b1b2b;padding:20px 24px;">
        <span style="color:#ffffff;font-size:16px;font-weight:700;">Areté Soluciones</span>
      </div>
      <div style="padding:20px 24px;">
        <p style="font:400 14px Helvetica,Arial,sans-serif;color:#374151;">Gracias por completar tu Blueprint Diagnostic.</p>
        <p style="font:400 14px Helvetica,Arial,sans-serif;color:#374151;">Adjuntamos tu informe en PDF. Nuestro equipo se va a contactar a la brevedad para conversar los próximos pasos.</p>
        <p style="font:400 12px Helvetica,Arial,sans-serif;color:#6b7280;margin-top:20px;">— Equipo Areté Soluciones</p>
      </div>
    </div>
  </div>`;
}

module.exports = { buildLeadEmailHtml, buildUserCopyHtml };
