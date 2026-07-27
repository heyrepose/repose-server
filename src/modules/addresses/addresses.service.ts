import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AddressForbiddenException,
  AddressNotFoundException,
} from './addresses.errors';
import { CreateAddressDto, UpdateAddressDto } from './dto/addresses.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  listMine(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          userId,
          label: dto.label,
          line1: dto.line1,
          line2: dto.line2,
          city: dto.city,
          emirate: dto.emirate,
          country: dto.country ?? 'AE',
          postalCode: dto.postalCode,
          phone: dto.phone,
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this.requireOwned(userId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }

      const data: Prisma.AddressUpdateInput = {};
      if (dto.label !== undefined) data.label = dto.label;
      if (dto.line1 !== undefined) data.line1 = dto.line1;
      if (dto.line2 !== undefined) data.line2 = dto.line2;
      if (dto.city !== undefined) data.city = dto.city;
      if (dto.emirate !== undefined) data.emirate = dto.emirate;
      if (dto.country !== undefined) data.country = dto.country;
      if (dto.postalCode !== undefined) data.postalCode = dto.postalCode;
      if (dto.phone !== undefined) data.phone = dto.phone;
      if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;

      return tx.address.update({ where: { id }, data });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.requireOwned(userId, id);
    await this.prisma.address.delete({ where: { id } });
  }

  async requireOwned(userId: string, id: string) {
    const address = await this.prisma.address.findUnique({ where: { id } });
    if (!address) throw new AddressNotFoundException();
    if (address.userId !== userId) throw new AddressForbiddenException();
    return address;
  }
}
