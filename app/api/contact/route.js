// POST /jobs/api/contact — hiring / general enquiry form.
//
// Mirrors leadnear-main/pages/api/sendContact.js minus the reCAPTCHA step,
// which needs keys this project does not carry. The honeypot field is kept:
// it costs nothing and stops naive bots.

import { NextResponse } from "next/server";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mailer";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Expected a JSON body." }, { status: 400 });
  }

  const { name = "", email = "", subject = "", message = "", website = "" } = body;

  // Honeypot: a real user never fills this, so accept-and-discard.
  if (website) return NextResponse.json({ message: "Request received" });

  if (
    name.trim().length < 2 ||
    !EMAIL_PATTERN.test(email) ||
    subject.trim().length < 3 ||
    message.trim().length < 10
  ) {
    return NextResponse.json({ message: "Please provide valid enquiry details." }, { status: 400 });
  }

  if (!isMailConfigured()) {
    return NextResponse.json(
      { message: "Email delivery is not configured on this deployment. Set BREVO_SMTP_HOST, BREVO_SMTP_USER and BREVO_SMTP_PASS." },
      { status: 503 }
    );
  }

  try {
    await sendMail({
      subject: `Contact form submitted by ${name}`,
      html: `<p><b>Name:</b> ${escapeHtml(name)}</p>
             <p><b>Email:</b> ${escapeHtml(email)}</p>
             <p><b>Subject:</b> ${escapeHtml(subject)}</p>
             <p><b>Message:</b><br/>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`,
    });
    return NextResponse.json({ message: "Thanks — we'll be in touch." });
  } catch (error) {
    console.error("Contact form send failed", error);
    return NextResponse.json({ message: "Could not send your message." }, { status: 500 });
  }
}
