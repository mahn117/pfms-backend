import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-codes';
import { TransactionsService } from '../transactions.service';
import { TransactionOwnershipGuard } from './transaction-ownership.guard';

describe('TransactionOwnershipGuard', () => {
  let guard: TransactionOwnershipGuard;
  let transactionsService: { findOwnedOrThrow: jest.Mock };

  const context = (userId: string, id: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId }, params: { id } }),
      }),
    }) as ExecutionContext;

  const notFound = () =>
    new NotFoundException({
      errorCode: ErrorCode.TRANSACTION_NOT_FOUND,
      message: 'Không tìm thấy giao dịch',
    });

  beforeEach(() => {
    transactionsService = { findOwnedOrThrow: jest.fn() };
    guard = new TransactionOwnershipGuard(
      transactionsService as unknown as TransactionsService,
    );
  });

  it('cho phép khi transaction thuộc user', async () => {
    transactionsService.findOwnedOrThrow.mockResolvedValue({ id: 'tx-1' });

    await expect(guard.canActivate(context('user-1', 'tx-1'))).resolves.toBe(
      true,
    );
    expect(transactionsService.findOwnedOrThrow).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
    );
  });

  it.each([
    ['transaction thuộc user khác', 'tx-foreign'],
    ['transaction không tồn tại', 'tx-missing'],
    ['transaction đã bị xóa', 'tx-deleted'],
  ])('trả 404 TRANSACTION_NOT_FOUND khi %s', async (_case, id) => {
    transactionsService.findOwnedOrThrow.mockRejectedValue(notFound());

    await expect(
      guard.canActivate(context('user-1', id)),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        errorCode: ErrorCode.TRANSACTION_NOT_FOUND,
        message: 'Không tìm thấy giao dịch',
      },
    });
  });
});
