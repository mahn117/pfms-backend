import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import { ErrorCode } from '../../../common/constants/error-codes';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
const UPLOAD_MAX_SIZE_MB = Number(process.env.UPLOAD_MAX_SIZE_MB ?? 5);

type MulterFileFilterCallback = (
  error: Error | null,
  acceptFile: boolean,
) => void;

export const attachmentMulterOptions = {
  storage: diskStorage({
    destination: './uploads',
    filename: (
      req: Request,
      file: Express.Multer.File,
      callback: (error: Error | null, filename: string) => void,
    ) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${uniqueSuffix}${extname(file.originalname)}`);
    },
  }),
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
