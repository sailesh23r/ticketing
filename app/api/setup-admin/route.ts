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
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Update role just in case
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { role: "admin" },
      });
      
      return NextResponse.json({ 
        message: "User already exists. Role has been ensured as 'admin'.", 
        user: { email: existingUser.email, id: existingUser.id } 
      });
    }

    // 2. Create the user using Better Auth API to handle password hashing
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

    // 3. Ensure the user has the 'admin' role in the database
    await prisma.user.update({
      where: { email },
      data: { role: "admin" },
    });

    console.log(`[SETUP] Admin user created successfully: ${email}`);

    return NextResponse.json({
      success: true,
      message: "Admin user created successfully!",
      credentials: {
        email,
        password,
      },
      user: user.user
    });

  } catch (error: any) {
    console.error("[SETUP] Error creating admin user:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
