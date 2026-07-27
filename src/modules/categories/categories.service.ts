import { Injectable } from '@nestjs/common';
import { Category } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainException } from '../../common/errors/domain-exception';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active categories as a top-level list with nested active children. */
  async listActive() {
    const all = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const roots = all.filter((c) => !c.parentId);
    return roots.map((root) => this.serialize(root, all));
  }

  async getBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category || !category.isActive) {
      throw new DomainException('CATEGORY_NOT_FOUND', 'Category not found', 404);
    }
    const children = await this.prisma.category.findMany({
      where: { parentId: category.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return { ...this.flat(category), children: children.map((c) => this.flat(c)) };
  }

  private serialize(node: Category, all: Category[]): Record<string, unknown> {
    const children = all
      .filter((c) => c.parentId === node.id)
      .map((c) => this.serialize(c, all));
    return { ...this.flat(node), children };
  }

  private flat(c: Category) {
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      bannerUrl: c.bannerUrl,
      iconUrl: c.iconUrl,
      sortOrder: c.sortOrder,
      parentId: c.parentId,
    };
  }
}
