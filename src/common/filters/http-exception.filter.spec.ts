import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/test?sort=desc' }),
      }),
    } as unknown as ArgumentsHost;
  });

  function expectResponse(statusCode: number, errorCode: string) {
    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledTimes(1);
    const body = json.mock.calls[0][0] as {
      success: boolean;
      statusCode: number;
      errorCode: string;
      message: string;
      timestamp: string;
      path: string;
      errors?: { field: string; message: string }[];
    };
    expect(body).toMatchObject({
      success: false,
      statusCode,
      errorCode,
      message: expect.any(String),
      timestamp: expect.any(String),
      path: '/api/v1/test',
    });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    return body;
  }

  it('giữ thông báo dạng string của HttpException và không thêm errors', () => {
    filter.catch(new HttpException('Yêu cầu không hợp lệ', 400), host);

    const body = expectResponse(400, 'VALIDATION_ERROR');
    expect(body.message).toBe('Yêu cầu không hợp lệ');
    expect(body).not.toHaveProperty('errors');
  });

  it('chuyển danh sách lỗi validation thành errors có field và message', () => {
    filter.catch(
      new BadRequestException({
        message: ['amount phải lớn hơn 0', 'name không được để trống'],
      }),
      host,
    );

    const body = expectResponse(400, 'VALIDATION_ERROR');
    expect(body.message).toBe('Dữ liệu không hợp lệ');
    expect(body.errors).toEqual([
      { field: 'amount', message: 'amount phải lớn hơn 0' },
      { field: 'name', message: 'name không được để trống' },
    ]);
  });

  it('giữ errorCode nghiệp vụ nếu exception cung cấp', () => {
    filter.catch(
      new HttpException(
        { errorCode: 'WALLET_NOT_FOUND', message: 'Không tìm thấy ví' },
        404,
      ),
      host,
    );

    const body = expectResponse(404, 'WALLET_NOT_FOUND');
    expect(body.message).toBe('Không tìm thấy ví');
    expect(body).not.toHaveProperty('errors');
  });

  it.each([
    [HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE'],
    [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED'],
    [HttpStatus.FORBIDDEN, 'FORBIDDEN'],
    [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_SERVER_ERROR'],
  ])(
    'map status %s khi exception không có errorCode',
    (statusCode, errorCode) => {
      filter.catch(
        new HttpException({ message: 'Lỗi theo status' }, statusCode),
        host,
      );

      const body = expectResponse(statusCode, errorCode);
      expect(body.message).toBe('Lỗi theo status');
      expect(body).not.toHaveProperty('errors');
    },
  );

  it('trả 500 an toàn cho lỗi không phải HttpException', () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      filter.catch(new Error('Chi tiết nội bộ'), host);

      const body = expectResponse(500, 'INTERNAL_SERVER_ERROR');
      expect(body.message).toBe('Đã có lỗi xảy ra');
      expect(JSON.stringify(body)).not.toContain('Chi tiết nội bộ');
      expect(body).not.toHaveProperty('errors');
      expect(logger).toHaveBeenCalledWith('Unhandled exception');
    } finally {
      logger.mockRestore();
    }
  });
});
