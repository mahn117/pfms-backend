import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import { ErrorCode } from '../../../common/constants/error-codes';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
const UPLOAD_MAX_SIZE_MB = Number(process.env.UPLOAD_MAX_SIZE_MB ?? 5);

type MulterFileFilterCallback = (
  error: Error | null,
  acceptFile: boolean,
) => void;

// Dùng memoryStorage: file chỉ nằm trong buffer (RAM), KHÔNG ghi xuống đĩa
// tại bước interceptor. Việc ghi đĩa được dời vào TransactionsService,
// SAU KHI đã xác nhận transaction thuộc đúng user (tránh orphan file).
export const attachmentMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    callback: MulterFileFilterCallback,
  ) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return callback(
        new BadRequestException({
          errorCode: ErrorCode.INVALID_FILE_TYPE,
          message: 'Chỉ chấp nhận file ảnh (jpg/png) hoặc PDF',
        }),
        false,
      );
    }
    callback(null, true);
  },
};
