const sgMail = require("@sendgrid/mail");

const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.warn("[sendEmail] Missing SENDGRID_API_KEY – emails will NOT be sent.");
} else {
  sgMail.setApiKey(apiKey);
}

async function sendEmail({ to, subject, html, text }) {
  if (!apiKey) {
    console.log("[sendEmail] Skipping send – no SENDGRID_API_KEY set.");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("HTML:", html);
    return;
  }

  const from = process.env.EMAIL_FROM || "no-reply@example.com";

  const msg = {
    to,
    from,
    subject,
    // Fallback so SendGrid always has a text part
    text: text || "Please open this email in an HTML-capable client.",
    html,
  };

  try {
    await sgMail.send(msg);
  } catch (err) {
    console.error(
      "[sendEmail] Failed to send email via SendGrid:",
      err.code,
      err.response?.body || err.message
    );
    // do NOT throw
  }
}

module.exports = { sendEmail };
