import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { User, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: dto.email,
          mode: 'insensitive',
        },
      },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);

    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        status: dto.status,
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }
}
