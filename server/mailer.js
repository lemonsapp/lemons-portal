const { Resend } = require("resend");
const { render } = require("@react-email/render");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html, react }) {
  console.log("[MAIL] Intentando enviar a:", to, "subject:", subject);

  if (!process.env.RESEND_API_KEY) {
    console.log("[MAIL] RESEND_API_KEY no está seteada. (simulado)");
    return;
  }

  const testTo = process.env.MAIL_TEST_TO;
  const finalTo = testTo ? testTo : to;

  // Podés mandar html directo o un componente React
  const finalHtml = react ? render(react) : html;

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.MAIL_FROM, // IMPORTANTE: formato válido "Nombre <email@dominio>"
      to: finalTo,
      subject,
      html: finalHtml,
    });

    if (error) {
      console.log("[MAIL] ERROR:", error);
      throw new Error(error.message || "Resend error");
    }

    console.log("[MAIL] OK! id:", data?.id, "to:", finalTo);
  } catch (e) {
    console.log("[MAIL] EXCEPCIÓN:", e.message);
    throw e;
  }
}

module.exports = { sendEmail };