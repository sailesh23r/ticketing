import { prisma } from "./prisma";

export async function getUserDetails(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role ?? null;
}
