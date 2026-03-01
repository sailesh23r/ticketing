
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const basePrisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;

// Extend Prisma to lowercase emails on the user table so that
// Microsoft OAuth emails like "Jijo.Antony@cyberloop.ai" match
// the existing DB record "jijo.antony@cyberloop.ai".
// Better Auth does its email lookup BEFORE mapProfileToUser runs,
// so we must intercept at the database query level.
export const prisma = basePrisma.$extends({
  query: {
    user: {
      async $allOperations({ args, query }: { args: any; query: (args: any) => any }) {
        // Normalize email in WHERE clauses (find/update/delete)
        if (args?.where?.email && typeof args.where.email === "string") {
          console.log("[PRISMA] Lowercasing WHERE email:", args.where.email, "→", args.where.email.toLowerCase());
          args.where.email = args.where.email.toLowerCase();
        }
        // Normalize email in data (create/update)
        if (args?.data?.email && typeof args.data.email === "string") {
          args.data.email = args.data.email.toLowerCase();
        }
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;