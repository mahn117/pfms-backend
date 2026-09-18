import { Module } from '@nestjs/common';
import { OtpDeliveryService } from './otp-delivery.service';
import { SmtpOtpDeliveryService } from './smtp-otp-delivery.service';

@Module({
  providers: [
    SmtpOtpDeliveryService,
    {
      provide: OtpDeliveryService,
      useExisting: SmtpOtpDeliveryService,
    },
  ],
  exports: [OtpDeliveryService],
})
export class NotificationModule {}
