// lib/mailer.js — shared SMTP transport for the contact and opt-out forms.
//
// leadnear-main sends through Brevo using BREVO_SMTP_*. The same variable names
// are honoured here so one set of credentials works for both projects, with
// generic SMTP_* accepted as an alternative.
//
// isMailConfigured() exists so the routes can answer "mail is not set up on
// this deployment" with a clear 503 instead of throwing an opaque connection
// error — this project is commonly run without SMTP credentials.

import nodemailer from "nodemailer";

function setting(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return "";
}

export function mailConfig() {
  return {
    host: setting("BREVO_SMTP_HOST", "SMTP_HOST"),
    port: Number(setting("BREVO_SMTP_PORT", "SMTP_PORT") || 587),
    user: setting("BREVO_SMTP_USER", "SMTP_USER"),
    pass: setting("BREVO_SMTP_PASS", "SMTP_PASSWORD", "SMTP_PASS"),
    from: setting("MAIL_FROM") || "support@leadnear.com",
    to: setting("MAIL_TO", "CONTACT_EMAIL") || "support@leadnear.com",
  };
}

export function isMailConfigured() {
  const { host, user, pass } = mailConfig();
  return Boolean(host && user && pass);
}

export async function sendMail({ subject, html }) {
  const config = mailConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  return transporter.sendMail({
    from: config.from,
    to: [config.to],
    subject,
    html,
  });
}

// Form values are interpolated into an HTML email, so escape them. Without
// this, a submitted value containing markup would be rendered as markup in
// whatever inbox receives it.
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
