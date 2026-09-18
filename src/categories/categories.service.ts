import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private toJson(category: any) {
    return {
      id: category.id,
      name: category.name,
      icon: category.icon ?? null,
      color: category.color ?? null,
      archived: category.archived,
    };
  }

  private rethrowDuplicate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Category name already exists');
    }
    throw error;
  }

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

  async findAll(includeArchived = false) {
    const rows = await this.prisma.category.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: { name: 'asc' },
    });
    return rows.map((category) => this.toJson(category));
  }

  async create(dto: CreateCategoryDto) {
    try {
      const category = await this.prisma.category.create({
        data: { name: dto.name, icon: dto.icon, color: dto.color },
      });
      return this.toJson(category);
    } catch (error) {
      this.rethrowDuplicate(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.prisma.category.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Category ${id} not found`);

    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.color !== undefined) data.color = dto.color;

    try {
      const category = await this.prisma.category.update({ where: { id }, data });
      return this.toJson(category);
    } catch (error) {
      this.rethrowDuplicate(error);
    }
  }

  async archive(id: string) {
    const current = await this.prisma.category.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Category ${id} not found`);

    const category = await this.prisma.category.update({
      where: { id },
      data: { archived: true },
    });
    return this.toJson(category);
  }
}
