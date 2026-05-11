import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const email = "testuser@gmail.com";
  const password = "12345678";
  const name = "Test User";

  try {
    console.log(`[SETUP] Checking if user ${email} exists...`);
    
    // 1. Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ 
        message: "User already exists.", 
        user: { email: existingUser.email, id: existingUser.id } 
      });
    }

    // 2. Create the user using Better Auth API
    console.log(`[SETUP] Creating user ${email}...`);
    const user = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    if (!user) {
      throw new Error("Failed to create user via Better Auth API");
    }

    // 3. Ensure the user has the 'user' role
    await prisma.user.update({
      where: { email },
      data: { role: "user" },
    });

    console.log(`[SETUP] User created successfully: ${email}`);

    return NextResponse.json({
      success: true,
      message: "Regular user created successfully!",
      credentials: {
        email,
        password,
      },
      user: user.user
    });

  } catch (error: any) {
    console.error("[SETUP] Error creating user:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
