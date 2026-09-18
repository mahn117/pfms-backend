import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SmtpOtpDeliveryService } from './smtp-otp-delivery.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('SmtpOtpDeliveryService', () => {
  const sendMail = jest.fn();
  const config: Record<string, unknown> = {
    MAIL_HOST: 'smtp.example.com',
    MAIL_PORT: 465,
    MAIL_USER: 'smtp-user',
    MAIL_PASSWORD: 'smtp-password',
    MAIL_FROM: 'PFMS <no-reply@example.com>',
    MAIL_SECURE: true,
    MAIL_CONNECTION_TIMEOUT_MS: 5000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    sendMail.mockResolvedValue({ messageId: 'message-1' });
  });

  function createService() {
    const configService = {
      get: jest.fn((key: string) => config[key]),
      getOrThrow: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;
    return new SmtpOtpDeliveryService(configService);
  }

  it('creates one reusable transporter with secure timeout configuration', async () => {
    const service = createService();

    await service.sendPasswordResetOtp({
      email: 'user@example.com',
      otp: '123456',
      expiresInSeconds: 300,
    });
    await service.sendPasswordResetOtp({
      email: 'other@example.com',
      otp: '654321',
      expiresInSeconds: 300,
    });

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'smtp-user', pass: 'smtp-password' },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      logger: false,
      debug: false,
    });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('sends a minimal password-reset email with from, to and subject', async () => {
    const service = createService();

    await service.sendPasswordResetOtp({
      email: 'user@example.com',
      otp: '123456',
      expiresInSeconds: 300,
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'PFMS <no-reply@example.com>',
      to: 'user@example.com',
      subject: 'Mã OTP đặt lại mật khẩu PFMS',
      text: expect.stringContaining('5 phút'),
    });
  });

  it('throws a sanitized error when SMTP delivery fails', async () => {
    const service = createService();
    sendMail.mockRejectedValue(
      new Error('smtp://smtp-user:smtp-password@smtp.example.com'),
    );

    await expect(
      service.sendPasswordResetOtp({
        email: 'user@example.com',
        otp: '123456',
        expiresInSeconds: 300,
      }),
    ).rejects.toThrow('Không thể gửi email OTP');
  });
});
