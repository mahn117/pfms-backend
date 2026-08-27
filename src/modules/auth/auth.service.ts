import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { StringValue } from 'ms';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RedisService } from '../../redis/redis.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { createHash } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException({
        errorCode: ErrorCode.EMAIL_ALREADY_EXISTS,
        message: 'Email đã được sử dụng',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
      },
    });

    return this.issueTokens(user.id, user.email!);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.INVALID_CREDENTIALS,
        message: 'Email hoặc mật khẩu không đúng',
      });
    }

    return this.issueTokens(user.id, user.email!);
  }

  async refresh(dto: RefreshTokenDto) {
    const payload = this.verifyRefreshToken(dto.refreshToken);
    const tokenHash = this.hashToken(dto.refreshToken);

    const matched = await this.prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!matched) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.INVALID_REFRESH_TOKEN,
        message: 'Refresh token không hợp lệ hoặc đã hết hạn',
      });
    }

    await this.prisma.refreshToken.update({
      where: { id: matched.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(payload.sub, payload.email);
  }

  async logout(dto: RefreshTokenDto) {
    const payload = this.verifyRefreshToken(dto.refreshToken, {
      ignoreExpiration: true,
    });
    const tokenHash = this.hashToken(dto.refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Đăng xuất thành công' };
  }

  private verifyRefreshToken(
    token: string,
    options?: { ignoreExpiration?: boolean },
  ): { sub: string; email: string } {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        ignoreExpiration: options?.ignoreExpiration ?? false,
      });
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCode.INVALID_REFRESH_TOKEN,
        message: 'Refresh token không hợp lệ hoặc đã hết hạn',
      });
    }
  }

  private readonly OTP_TTL_SECONDS = 5 * 60;

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) return { message: 'Nếu email tồn tại, OTP đã được gửi' };

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    await this.redisService.set(
      this.otpKey(user.id),
      otpHash,
      this.OTP_TTL_SECONDS,
    );

    console.log(`[DEV-ONLY] OTP đặt lại mật khẩu cho ${user.email}: ${otp}`); //Tạm log console

    return { message: 'Nếu email tồn tại, OTP đã được gửi' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const invalidOtpError = new UnauthorizedException({
      errorCode: ErrorCode.INVALID_OTP,
      message: 'OTP không hợp lệ hoặc đã hết hạn',
    });

    if (!user) throw invalidOtpError;

    const storedHash = await this.redisService.get(this.otpKey(user.id));
    if (!storedHash || !(await bcrypt.compare(dto.otp, storedHash))) {
      throw invalidOtpError;
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.redisService.del(this.otpKey(user.id));

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private otpKey(userId: string): string {
    return `otp:reset-password:${userId}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<string>(
        'JWT_ACCESS_EXPIRES',
      ) as StringValue,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<string>(
        'JWT_REFRESH_EXPIRES',
      ) as StringValue,
    });

    const refreshTokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        expiresAt: this.calculateExpiryDate(
          this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES'),
        ),
      },
    });

    return { accessToken, refreshToken };
  }

  private calculateExpiryDate(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const value = Number(match[1]);
    const unitMs = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]]!;
    return new Date(Date.now() + value * unitMs);
  }
}
