import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { admin, customSession, jwt, twoFactor, lastLoginMethod } from "better-auth/plugins";
import { emailOTP } from "better-auth/plugins";
import { sendMail } from "./mailer";
import { getUserDetails } from "./custom-auth-functions";
  

export const auth = betterAuth({
  appName: "Xlter Ticketing System",
  database: prismaAdapter(prisma, {
    provider: "postgresql", // only for auth
  }),
  // We are serving over HTTP on LAN; make cookies work without HTTPS
  advanced: {
    defaultCookieAttributes: {
      secure: false,
      sameSite: "lax",
      path: "/",
    },
  },
  // Allow token/JWKS requests from these origins (CORS + origin validation)
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_AUTH_BASE_URL,
    // Common local dev hosts
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    // LAN IPs we use on this machine
    `http://${process.env.LAN_HOST ?? "192.168.18.2"}:3000`,
    // Retain the previous WSL/virtual adapter just in case
    "http://172.31.128.1:3000",
  ].filter(Boolean) as string[],
  emailAndPassword: {
    enabled: true,
  },

  socialProviders: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID as string,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRETVALUE as string,
      // Optional
      tenantId: '3bfbf68b-280a-4c52-8d23-e72ef5818d23',
      authority: `https://login.microsoftonline.com`, // Authentication authority URL
      prompt: "select_account", // Forces account selection
    },
  },

  plugins: [
    twoFactor({
     
    }),
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
      const roles = await getUserDetails(session.userId);
      // console.log("roles", roles);

      return {
        roles,
        user: {
          ...user,
          newField: "newField",
        },
        session
      };
    }),
    admin(),
    jwt({
      // Generate ES256 keys so Convex can verify using ES256
      jwks: {
        keyPairConfig: {
          alg: "ES256",
        },
      },
      // Set JWT standard claims to match Convex custom JWT provider
      jwt: {
        issuer: process.env.AUTH_JWT_ISSUER ?? "http://localhost:3000",
        audience:
          process.env.AUTH_JWT_AUDIENCE ??
          (process.env.AUTH_JWT_ISSUER ?? "http://localhost:3000"),
        // Keep tokens short-lived; Convex will auto-refresh via setAuth
        expirationTime: "10m",
        // Use Better Auth user id as subject to be available in Convex as identity.subject
        getSubject: (session) => session.user.id,
      },
    }),
    lastLoginMethod({
      storeInDatabase: true
    })
  ],
});