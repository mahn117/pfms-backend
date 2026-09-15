import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { TransactionsService } from '../transactions.service';

type AuthenticatedRequest = Request<{ id: string }> & {
  user: { userId: string };
};

@Injectable()
export class TransactionOwnershipGuard implements CanActivate {
  constructor(private readonly transactionsService: TransactionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    await this.transactionsService.findOwnedOrThrow(
      request.user.userId,
      request.params.id,
    );

    return true;
  }
}
