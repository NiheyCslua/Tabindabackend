import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

type RoleType = 'ADMIN' | 'EMPLOYEE' | 'INVENTORY_MANAGER';

@Injectable()
export class AuthService {
constructor(
private prisma: PrismaService,
private jwtService: JwtService,
) {}

private normalizeRole(role: string): RoleType {
const normalized = role.toUpperCase();

if (!['ADMIN', 'EMPLOYEE', 'INVENTORY_MANAGER'].includes(normalized)) {
  throw new BadRequestException('Invalid role');
}

return normalized as RoleType;

}

private mapUser(user: any) {
const { password, ...safeUser } = user;

return {
  ...safeUser,
  role: safeUser.role ? String(safeUser.role).toLowerCase() : 'no_app_access', // frontend expects lowercase
  phone: safeUser.phone || '',
  position: safeUser.position || '',
  status: safeUser.status || 'active',
  salary: safeUser.salary ?? null, // ✅ FIXED
  employeeId: safeUser.id,
  hireDate: safeUser.hireDate || safeUser.createdAt,
};

}

async register(data: {
name: string;
email: string;
password: string;
role:
| 'ADMIN'
| 'EMPLOYEE'
| 'INVENTORY_MANAGER'
| 'admin'
| 'employee'
| 'inventory_manager';
phone?: string;
position?: string;
status?: string;
salary?: number;
}) {
// Public self-registration is only allowed to create the very first
// account on a brand-new database (bootstrapping the first admin).
// Once any user exists, this endpoint closes itself — further accounts
// must be created from inside the app by a logged-in admin.
const userCount = await this.prisma.user.count();

if (userCount > 0) {
  throw new BadRequestException(
    'Registration is closed. Ask an existing admin to add your account from the Employees page.',
  );
}

const existingUser = await this.prisma.user.findUnique({
where: { email: data.email },
});

if (existingUser) {
  throw new BadRequestException('Email already in use');
}

const hashedPassword = await bcrypt.hash(data.password, 10);

const user = await this.prisma.user.create({
  data: {
    name: data.name,
    email: data.email,
    password: hashedPassword,
    role: this.normalizeRole(data.role),
    phone: data.phone || '',
    position: data.position || '',
    status: data.status || 'active',
    salary:
      data.salary !== undefined && data.salary !== null
        ? Number(data.salary)
        : null,
    hireDate: new Date(), // optional but good
  },
});

return this.mapUser(user);

}

async login(data: { email: string; password: string }) {
const user = await this.prisma.user.findUnique({
where: { email: data.email },
});

if (!user || !user.password) {
  throw new BadRequestException('Invalid credentials');
}

const isPasswordValid = await bcrypt.compare(
  data.password,
  user.password,
);

if (!isPasswordValid) {
  throw new BadRequestException('Invalid credentials');
}

const token = this.jwtService.sign({
  userId: user.id,
  email: user.email,
  role: user.role,
});

return {
  access_token: token,
  user: this.mapUser(user),
};

}
}
