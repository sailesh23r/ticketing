import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const email = "testadmin@gmail.com";
  const password = "admin123";
  const name = "Test Admin";

  try {
    console.log(`[SETUP] Checking if user ${email} exists...`);
    
    // 1. Check if user already exists
    let existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Ensure role is admin
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { role: "admin" },
      });
      
      console.log(`[SETUP] User ${email} already exists. Role updated to admin.`);
    } else {
      // 2. Create the user using Better Auth API
      console.log(`[SETUP] Creating new user ${email}...`);
      const result = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name,
        },
      });

      if (!result) {
        throw new Error("Failed to create user via Better Auth API");
      }
      
      // 3. Ensure the user has the 'admin' role (Better Auth might default to 'user')
      await prisma.user.update({
        where: { email },
        data: { role: "admin" },
      });
      
      existingUser = await prisma.user.findUnique({ where: { email } });
    }

    return NextResponse.json({
      success: true,
      message: "Admin setup completed successfully!",
      user: {
        email: existingUser?.email,
        role: "admin"
      }
    });

  } catch (error: any) {
    console.error("[SETUP] Error creating admin user:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
