// POST /jobs/api/register — create a credentials account.
//
// leadnear-main's equivalent is closed (it returns 403 "New registrations are
// closed"), so this is written against the User model rather than ported. It
// deliberately does the minimum: create the row with a hashed password. No
// referral credits, no verification email, no rate-limit bookkeeping — those
// belong to the flows that were left out of scope.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

// Cost 10 matches what leadnear-main hashes with, so hashes stay comparable
// between the two databases.
const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    // A unique-violation here means someone registered the same address between
    // the check above and this insert; report it as the conflict it is.
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    console.error("Registration failed", error);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
