import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { admin, customSession, jwt, twoFactor, lastLoginMethod } from "better-auth/plugins";
import { emailOTP } from "better-auth/plugins";
import { sendMail } from "./mailer";
import { getUserDetails } from "./custom-auth-functions";

// Plain, production-ready Better Auth config.
// Keep plugins as-is and rely on env for origins and JWT so Convex can verify via JWKS.
export const auth = betterAuth({
  appName: "Xlter Ticketing System",
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // Allow token/JWKS requests from these origins (CORS + origin validation)
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_AUTH_BASE_URL,
    // Local development convenience
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000",
  ].filter(Boolean) as string[],

  emailAndPassword: { enabled: true },

  socialProviders: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID as string,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRETVALUE as string,
      tenantId: '3bfbf68b-280a-4c52-8d23-e72ef5818d23',
      authority: `https://login.microsoftonline.com`,
      prompt: "login",
      // Force email to lowercase so it matches existing DB records
      mapProfileToUser: (profile) => {
        return {
          email: (profile.email ?? "").toLowerCase(),
          name: profile.name,
          image: profile.picture,
        };
      },
    },
  },

  plugins: [
    twoFactor({}),
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await sendMail({
          to: email,
          subject: "Your verification code",
          text: `Your sign-in code is: ${otp}`,
          html: `<p>Your sign-in code is: <strong>${otp}</strong></p>`,
        });
      },
    }),
    customSession(async ({ user, session }) => {
      try {
        const role = await getUserDetails(session.userId);
        return {
          user: { ...user, role: role ?? "user", newField: "newField" },
          session,
        };
      } catch (e) {
        console.error("customSession error for user", session.userId, e);
        return {
          user: { ...user, role: "user", newField: "newField" },
          session,
        };
      }
    }),
    admin(),
    jwt({
      // ES256 so Convex can verify with your JWKS endpoint
      jwks: { keyPairConfig: { alg: "ES256" } },
      jwt: {
        issuer: process.env.AUTH_JWT_ISSUER ?? "http://localhost:3000",
        audience:
          process.env.AUTH_JWT_AUDIENCE ??
          (process.env.AUTH_JWT_ISSUER ?? "http://localhost:3000"),
        expirationTime: "10m",
        getSubject: (session) => session.user.id,
      },
    }),
    lastLoginMethod({ storeInDatabase: true }),
  ],
});