import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.EMAIL_WEBHOOK_SECRET || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { to, subject, text, html } = (await req.json()) as {
    to: string;
    subject: string;
    text?: string;
    html?: string;
  };
  if (!to || !subject) return new NextResponse("Bad Request", { status: 400 });
  try {
    await sendMail({ to, subject, text, html });
    return NextResponse.json({ ok: true });
  } catch {
    return new NextResponse("Failed", { status: 500 });
  }
}
