import { prisma } from "@/server/db"
import { ConnectionTestRepository } from "@/server/repositories/connection-repository"
import { PrismaJobRepository } from "@/server/repositories/prisma-job-repository"

export const jobs = new PrismaJobRepository(prisma)
export const connectionTests = new ConnectionTestRepository(prisma)
