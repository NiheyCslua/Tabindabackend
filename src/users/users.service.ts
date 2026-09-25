import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

/**
 * App Role drives whether an employee gets application login credentials.
 * 'no_app_access' employees are stored purely as employee records: no email,
 * no password, no Role is set on the underlying User row.
 *
 * Kept extensible: additional app roles can be added to APP_ROLES /
 * normalizeAppRole without redesigning the create/update flow.
 */
const APP_ROLES = ['no_app_access', 'admin', 'sales', 'inventory_manager'] as const;
type AppRole = (typeof APP_ROLES)[number];

// Maps an AppRole to the underlying Prisma Role enum value used for
// authentication/authorization. 'sales' reuses the existing EMPLOYEE role to
// stay backward compatible with existing accounts and guards.
const APP_ROLE_TO_DB_ROLE: Record<Exclude<AppRole, 'no_app_access'>, 'ADMIN' | 'EMPLOYEE' | 'INVENTORY_MANAGER'> = {
  admin: 'ADMIN',
  sales: 'EMPLOYEE',
  inventory_manager: 'INVENTORY_MANAGER',
};

const DB_ROLE_TO_APP_ROLE: Record<string, AppRole> = {
  ADMIN: 'admin',
  EMPLOYEE: 'sales',
  INVENTORY_MANAGER: 'inventory_manager',
};

type UserPayload = {
  name?: string;
  email?: string | null;
  password?: string;
  role?: string; // App Role, e.g. 'no_app_access' | 'admin' | 'sales' | 'inventory_manager' (case-insensitive)
  phone?: string;
  position?: string;
  cnic?: string | null;
  status?: string;
  salary?: number;
  hireDate?: string;
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private normalizeAppRole(role?: string): AppRole {
    if (!role) return 'no_app_access';
    const normalized = role.toLowerCase().replace(/\s+/g, '_');
    if (!APP_ROLES.includes(normalized as AppRole)) {
      throw new BadRequestException('Invalid App Role');
    }
    return normalized as AppRole;
  }

  private mapUser(user: any) {
    const { password, ...safeUser } = user;
    const appRole = user.role ? DB_ROLE_TO_APP_ROLE[user.role] ?? 'no_app_access' : 'no_app_access';
    return {
      ...safeUser,
      role: appRole,
      hasAppAccess: appRole !== 'no_app_access',
      email: safeUser.email || '',
      phone: safeUser.phone || '',
      position: safeUser.position || '',
      cnic: safeUser.cnic || '',
      status: safeUser.status || 'active',
      salary: Number(safeUser.salary || 0),
      employeeId: safeUser.id,
      hireDate: safeUser.hireDate || safeUser.createdAt,
    };
  }

  private async buildUserData(data: UserPayload, isCreate: boolean, existing?: any) {
    const out: any = {};

    for (const key of ['name', 'phone', 'position', 'status'] as const) {
      if (data[key] !== undefined) out[key] = data[key];
    }

    if (data.salary !== undefined) out.salary = Number(data.salary);
    if (data.hireDate !== undefined) out.hireDate = data.hireDate ? new Date(data.hireDate) : null;

    if (data.cnic !== undefined) {
      const cnic = data.cnic ? String(data.cnic).trim() : '';
      out.cnic = cnic ? cnic : null;
      if (out.cnic) {
        const existingCnic = await this.prisma.user.findUnique({ where: { cnic: out.cnic } });
        if (existingCnic && existingCnic.id !== existing?.id) {
          throw new BadRequestException('CNIC Number already in use');
        }
      }
    }

    // Determine the effective App Role for this request.
    const appRole =
      data.role !== undefined
        ? this.normalizeAppRole(data.role)
        : existing
        ? existing.role
          ? DB_ROLE_TO_APP_ROLE[existing.role]
          : 'no_app_access'
        : 'no_app_access';

    if (appRole === 'no_app_access') {
      out.role = null;
      // No login credentials for employees without app access.
      if (isCreate || data.role !== undefined) {
        out.email = null;
        out.password = null;
      }
    } else {
      out.role = APP_ROLE_TO_DB_ROLE[appRole as Exclude<AppRole, 'no_app_access'>];

      if (data.email !== undefined) out.email = data.email;
      const effectiveEmail = out.email !== undefined ? out.email : existing?.email;
      if (!effectiveEmail) {
        throw new BadRequestException('Email is required for this App Role');
      }

      if (isCreate) {
        if (!data.password) {
          throw new BadRequestException('Password is required for this App Role');
        }
        out.password = await bcrypt.hash(data.password, 10);
      } else if (data.password) {
        out.password = await bcrypt.hash(data.password, 10);
      }
    }

    return out;
  }

  async getAllUsers() {
    return (await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } })).map((user) => this.mapUser(user));
  }

  async createUser(data: UserPayload) {
    if (data.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existingEmail) throw new BadRequestException('Email already in use');
    }
    const built = await this.buildUserData(data, true);
    return this.mapUser(await this.prisma.user.create({ data: built }));
  }

  async updateUser(id: string, data: UserPayload) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    if (data.email && data.email !== existing.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existingEmail) throw new BadRequestException('Email already in use');
    }
    const built = await this.buildUserData(data, false, existing);
    return this.mapUser(await this.prisma.user.update({ where: { id }, data: built }));
  }

  async deleteUser(id: string) {
    return this.mapUser(await this.prisma.user.delete({ where: { id } }));
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.mapUser(user);
  }
}
