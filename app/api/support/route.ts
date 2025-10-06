import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

// Configure nodemailer from environment variables
// Expecting SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS present
function getTransport() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS.")
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

export async function POST(req: NextRequest) {
  try {
    const { subject, description } = await req.json()
    if (!subject || !description) {
      return NextResponse.json({ error: "Missing subject or description" }, { status: 400 })
    }

    const transporter = getTransport()
    const to = "jibin85jose@gmail.com"

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER!,
      to,
      subject: `[Support] ${subject}`,
      text: description,
      html: `<p>${description.replace(/\n/g, "<br/>")}</p>`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("/api/support error", err)
    return NextResponse.json({ error: "Failed to send" }, { status: 500 })
  }
}

export const dynamic = "force-dynamic"