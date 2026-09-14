import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { ReferenceObject, SchemaObject } from '@nestjs/swagger';
import {
  BudgetPeriodType,
  CategoryType,
  GoalStatus,
  Role,
  TransactionType,
  WalletType,
} from '@/generated/prisma/client';

const uuid: SchemaObject = {
  type: 'string',
  format: 'uuid',
  example: '11111111-1111-4111-8111-111111111111',
};
const dateTime: SchemaObject = { type: 'string', format: 'date-time' };
const decimal: SchemaObject = {
  type: 'string',
  example: '100000.00',
  description: 'Prisma Decimal được serialize thành chuỗi để giữ độ chính xác',
};
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const object = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({ type: 'object', properties, required });
export const arrayOf = (
  items: SchemaObject | ReferenceObject,
): SchemaObject => ({
  type: 'array',
  items,
});

export class CategoryTreeNodeResponse {
  @ApiProperty({
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
    description: 'ID danh mục',
  })
  id!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    example: null,
    description: 'ID chủ sở hữu; null với danh mục hệ thống',
  })
  userId!: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    example: null,
    description: 'ID danh mục cha; null với danh mục gốc',
  })
  parentId!: string | null;

  @ApiProperty({ example: 'Ăn uống', description: 'Tên danh mục' })
  name!: string;

  @ApiProperty({
    enum: CategoryType,
    example: CategoryType.EXPENSE,
    description: 'Loại thu hoặc chi',
  })
  type!: CategoryType;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'fa-utensils',
    description: 'Tên icon, có thể null',
  })
  icon!: string | null;

  @ApiProperty({
    example: false,
    description: 'Danh mục mặc định của hệ thống hay của người dùng',
  })
  isSystem!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description: 'Thời điểm xoá mềm, null nếu đang hoạt động',
  })
  deletedAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-20T00:00:00.000Z',
    description: 'Thời điểm tạo',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-20T00:00:00.000Z',
    description: 'Thời điểm cập nhật',
  })
  updatedAt!: Date;

  @ApiProperty({
    type: () => [CategoryTreeNodeResponse],
    example: [],
    description: 'Danh sách danh mục con, lồng nhau theo cây',
  })
  children!: CategoryTreeNodeResponse[];
}

export const responseSchemas = {
  message: object({
    message: { type: 'string', example: 'Thao tác thành công' },
  }),
  tokens: object({
    accessToken: { type: 'string', description: 'JWT dùng cho Bearer auth' },
    refreshToken: {
      type: 'string',
      description: 'Token dùng để refresh/logout',
    },
  }),
  user: object({
    id: uuid,
    email: nullable({ type: 'string', format: 'email' }),
    phone: nullable({ type: 'string' }),
    fullName: { type: 'string' },
    avatarUrl: nullable({ type: 'string' }),
    locale: { type: 'string', example: 'vi' },
    role: { type: 'string', enum: Object.values(Role) },
    isActive: { type: 'boolean' },
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  wallet: object({
    id: uuid,
    userId: uuid,
    name: { type: 'string' },
    type: { type: 'string', enum: Object.values(WalletType) },
    initialBalance: decimal,
    currentBalance: decimal,
    isArchived: { type: 'boolean' },
    deletedAt: nullable(dateTime),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  walletSummary: object({
    walletId: uuid,
    currentBalance: decimal,
    totalIncome: { oneOf: [decimal, { type: 'number' }] },
    totalExpense: { oneOf: [decimal, { type: 'number' }] },
    from: nullable({ type: 'string' }),
    to: nullable({ type: 'string' }),
  }),
  reconcile: object(
    {
      walletId: uuid,
      currentBalance: { type: 'number' },
      actualBalance: { type: 'number' },
      difference: { type: 'number' },
      adjustmentCreated: { type: 'boolean' },
      transactionId: uuid,
      message: { type: 'string' },
    },
    [
      'walletId',
      'currentBalance',
      'actualBalance',
      'difference',
      'adjustmentCreated',
      'message',
    ],
  ),
  category: object({
    id: uuid,
    userId: nullable(uuid),
    parentId: nullable(uuid),
    name: { type: 'string' },
    type: { type: 'string', enum: Object.values(CategoryType) },
    icon: nullable({ type: 'string' }),
    isSystem: { type: 'boolean' },
    deletedAt: nullable(dateTime),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  categoryTree: arrayOf({ $ref: getSchemaPath(CategoryTreeNodeResponse) }),
  transaction: object({
    id: uuid,
    userId: uuid,
    walletId: uuid,
    toWalletId: nullable(uuid),
    categoryId: nullable(uuid),
    goalId: nullable(uuid),
    type: { type: 'string', enum: Object.values(TransactionType) },
    amount: decimal,
    date: dateTime,
    note: nullable({ type: 'string' }),
    attachmentUrl: nullable({ type: 'string' }),
    deletedAt: nullable(dateTime),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  budget: object({
    id: uuid,
    userId: uuid,
    categoryId: nullable(uuid),
    periodType: { type: 'string', enum: Object.values(BudgetPeriodType) },
    startDate: dateTime,
    endDate: dateTime,
    limitAmount: decimal,
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  budgetProgress: object({
    budgetId: uuid,
    categoryId: nullable(uuid),
    periodType: { type: 'string', enum: Object.values(BudgetPeriodType) },
    startDate: dateTime,
    endDate: dateTime,
    limitAmount: { type: 'number' },
    spent: { type: 'number' },
    remaining: { type: 'number' },
    percentUsed: { type: 'number' },
    isOverThreshold80: { type: 'boolean' },
    isOverLimit: { type: 'boolean' },
  }),
  goal: object({
    id: uuid,
    userId: uuid,
    name: { type: 'string' },
    targetAmount: decimal,
    currentAmount: decimal,
    deadline: nullable(dateTime),
    status: { type: 'string', enum: Object.values(GoalStatus) },
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  reportSummary: object({
    from: nullable({ type: 'string' }),
    to: nullable({ type: 'string' }),
    walletId: nullable(uuid),
    totalIncome: { type: 'number' },
    totalExpense: { type: 'number' },
    balance: { type: 'number' },
  }),
  reportCategory: object({
    categoryId: uuid,
    categoryName: { type: 'string' },
    totalAmount: { type: 'number' },
  }),
  reportTrend: object({
    period: { type: 'string', example: '2026-08' },
    totalIncome: { type: 'number' },
    totalExpense: { type: 'number' },
    balance: { type: 'number' },
  }),
  health: object({
    status: { type: 'string', enum: ['ok', 'error', 'shutting_down'] },
    info: { type: 'object', additionalProperties: true },
    error: { type: 'object', additionalProperties: true },
    details: { type: 'object', additionalProperties: true },
  }),
} satisfies Record<string, SchemaObject>;

const successEnvelope = (
  status: number,
  data: SchemaObject,
  paginated: boolean,
): SchemaObject =>
  object({
    success: { type: 'boolean', enum: [true] },
    statusCode: { type: 'integer', enum: [status] },
    message: { type: 'string', example: 'OK' },
    data,
    ...(paginated
      ? {
          meta: object({
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          }),
        }
      : {}),
  });

const errorEnvelope = (status: number): SchemaObject =>
  object(
    {
      success: { type: 'boolean', enum: [false] },
      statusCode: { type: 'integer', enum: [status] },
      errorCode: { type: 'string', example: 'VALIDATION_ERROR' },
      message: { type: 'string' },
      errors: arrayOf(
        object({ field: { type: 'string' }, message: { type: 'string' } }),
      ),
      timestamp: dateTime,
      path: { type: 'string', example: '/api/v1/wallets' },
    },
    ['success', 'statusCode', 'errorCode', 'message', 'timestamp', 'path'],
  );

const errorDescriptions: Record<number, string> = {
  400: 'Dữ liệu không hợp lệ',
  401: 'Thiếu hoặc không hợp lệ thông tin xác thực',
  403: 'Không có quyền thao tác tài nguyên',
  404: 'Không tìm thấy tài nguyên',
  409: 'Dữ liệu trùng hoặc xung đột',
  413: 'File vượt giới hạn dung lượng',
  429: 'Vượt giới hạn tần suất request',
  503: 'Dịch vụ không sẵn sàng',
};

export const ApiSuccess = (
  status: number,
  data: SchemaObject,
  paginated = false,
) =>
  applyDecorators(
    ApiExtraModels(CategoryTreeNodeResponse),
    ApiResponse({
      status,
      description: status === 201 ? 'Tạo thành công' : 'Thành công',
      schema: successEnvelope(status, data, paginated),
    }),
  );

export const ApiErrors = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: errorDescriptions[status] ?? 'Lỗi request',
        schema: errorEnvelope(status),
      }),
    ),
  );
