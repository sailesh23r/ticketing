import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST as string;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER as string;
const pass = process.env.SMTP_PASS as string;
const from = process.env.SMTP_FROM as string;

if (!host || !user || !pass || !from) {
  console.warn("SMTP env vars are not fully configured. Email sending will fail.");
}

export const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true for 465, false for other ports
  auth: {
    user,
    pass,
  },
});

export async function sendMail(params: { to: string; subject: string; text?: string; html?: string }) {
  const info = await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
  return info;
}
