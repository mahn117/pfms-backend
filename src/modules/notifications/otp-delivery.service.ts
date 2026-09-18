export interface PasswordResetOtpDelivery {
  email: string;
  otp: string;
  expiresInSeconds: number;
}

export abstract class OtpDeliveryService {
  abstract sendPasswordResetOtp(
    delivery: PasswordResetOtpDelivery,
  ): Promise<void>;
}
