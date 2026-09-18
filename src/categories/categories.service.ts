import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async resolveByName(name?: string | null): Promise<string | null> {
    if (!name) return null;
    const existing = await this.prisma.category.findUnique({ where: { name } });
    if (existing) return existing.id;
    const created = await this.prisma.category.create({ data: { name } });
    return created.id;
  }
}
