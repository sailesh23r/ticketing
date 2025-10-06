import { prisma } from "./prisma";

export async function getUserDetails(userId: string) {
  // Replace with your actual query logic.
  return await prisma.user.findFirst({
    where: {
     id: userId,
    },
  });
}
