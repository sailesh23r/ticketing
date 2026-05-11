import { NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";

export async function GET() {
  try {
    console.log("[DEBUG] Starting SMTP test...");
    
    const info = await sendMail({
      to: "psailesh200@gmail.com",
      subject: "SMTP Test - Ticketing System",
      text: "This is a test email to verify SMTP configuration.",
      html: "<h1>SMTP Test</h1><p>This is a test email to verify SMTP configuration.</p>",
    });

    console.log("[DEBUG] SMTP test successful:", info.messageId);
    
    return NextResponse.json({ 
      success: true, 
      message: "Test email sent successfully!",
      messageId: info.messageId 
    });
    
  } catch (error: any) {
    console.error("[DEBUG] SMTP test failed:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
