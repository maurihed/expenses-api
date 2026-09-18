import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async resolveByName(
    name?: string | null,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<string | null> {
    if (!name) return null;
    const category = await client.category.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    return category.id;
  }
}
