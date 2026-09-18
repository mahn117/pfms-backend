import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  OtpDeliveryService,
  type PasswordResetOtpDelivery,
} from './otp-delivery.service';

@Injectable()
export class SmtpOtpDeliveryService implements OtpDeliveryService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const user = configService.get<string>('MAIL_USER');
    const password = configService.get<string>('MAIL_PASSWORD');
    const timeout = configService.getOrThrow<number>(
      'MAIL_CONNECTION_TIMEOUT_MS',
    );

    this.from = configService.getOrThrow<string>('MAIL_FROM');
    this.transporter = nodemailer.createTransport({
      host: configService.getOrThrow<string>('MAIL_HOST'),
      port: configService.getOrThrow<number>('MAIL_PORT'),
      secure: configService.getOrThrow<boolean>('MAIL_SECURE'),
      ...(user && password ? { auth: { user, pass: password } } : {}),
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
      logger: false,
      debug: false,
    });
  }

  async sendPasswordResetOtp({
    email,
    otp,
    expiresInSeconds,
  }: PasswordResetOtpDelivery): Promise<void> {
    const expiresInMinutes = Math.ceil(expiresInSeconds / 60);

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Mã OTP đặt lại mật khẩu PFMS',
        text: `Mã OTP đặt lại mật khẩu của bạn là: ${otp}\nMã có hiệu lực trong ${expiresInMinutes} phút.`,
      });
    } catch {
      throw new Error('Không thể gửi email OTP');
    }
  }
}
