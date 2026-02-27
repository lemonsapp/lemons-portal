const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html }) {
  console.log("[MAIL] Intentando enviar a:", to, "subject:", subject);

  if (!process.env.RESEND_API_KEY) {
    console.log("[MAIL] RESEND_API_KEY no está seteada. (simulado)");
    return;
  }

  const testTo = process.env.MAIL_TEST_TO;
  const finalTo = testTo ? testTo : to;

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.MAIL_FROM,
      to: finalTo,
      subject,
      html,
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