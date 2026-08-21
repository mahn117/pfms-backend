import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
interface AuthenticatedUser {
  userId: string;
  email: string;
}
interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
