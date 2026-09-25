import { prisma } from "@/server/db"
import { PrismaJobRepository } from "@/server/repositories/prisma-job-repository"

export const jobs = new PrismaJobRepository(prisma)
