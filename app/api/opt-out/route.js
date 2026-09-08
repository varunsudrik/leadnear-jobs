// POST /jobs/api/opt-out — data removal request.
//
// Mirrors leadnear-main/pages/api/sendOptOut.js. This is a privacy obligation,
// so a failure must be reported to the user rather than silently swallowed:
// somebody asking for their data to be removed has to know whether the request
// actually reached anyone.

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

  const { fullName = "", email = "", contactNumber = "", profileLink = "", linkedinUrl = "", website = "" } = body;

  if (website) return NextResponse.json({ message: "Request received" });

  if (fullName.trim().length < 2 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ message: "A name and valid email address are required." }, { status: 400 });
  }

  if (!isMailConfigured()) {
    return NextResponse.json(
      { message: "Email delivery is not configured on this deployment, so your request was not submitted. Please email support@leadnear.com directly." },
      { status: 503 }
    );
  }

  try {
    await sendMail({
      subject: `Opt-out request from ${fullName}`,
      html: `<p><b>Full name:</b> ${escapeHtml(fullName)}</p>
             <p><b>Email:</b> ${escapeHtml(email)}</p>
             <p><b>Contact number:</b> ${escapeHtml(contactNumber)}</p>
             <p><b>Profile link:</b> ${escapeHtml(profileLink)}</p>
             <p><b>LinkedIn URL:</b> ${escapeHtml(linkedinUrl)}</p>`,
    });
    return NextResponse.json({ message: "Your opt-out request has been submitted." });
  } catch (error) {
    console.error("Opt-out send failed", error);
    return NextResponse.json({ message: "Could not submit your request." }, { status: 500 });
  }
}
