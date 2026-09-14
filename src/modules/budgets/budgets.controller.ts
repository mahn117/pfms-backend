import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ApiErrors,
  ApiSuccess,
  arrayOf,
  responseSchemas,
} from '@/common/swagger/response-schemas';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

@ApiTags('Budgets')
@ApiBearerAuth()
@ApiErrors(401)
@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  @ApiSuccess(201, responseSchemas.budget)
  @ApiErrors(400)
  @ApiBody({
    description:
      'MONTH yêu cầu month và không gửi startDate/endDate; CUSTOM yêu cầu startDate/endDate và không gửi month.',
    schema: {
      oneOf: [
        {
          allOf: [
            { $ref: getSchemaPath(CreateBudgetDto) },
            {
              type: 'object',
              required: ['month'],
              properties: { periodType: { type: 'string', enum: ['MONTH'] } },
              not: {
                anyOf: [{ required: ['startDate'] }, { required: ['endDate'] }],
              },
            },
          ],
        },
        {
          allOf: [
            { $ref: getSchemaPath(CreateBudgetDto) },
            {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: { periodType: { type: 'string', enum: ['CUSTOM'] } },
              not: { required: ['month'] },
            },
          ],
        },
      ],
    },
    examples: {
      monthly: {
        summary: 'Ngân sách theo tháng',
        value: { periodType: 'MONTH', month: '2026-08', limitAmount: 2000000 },
      },
      custom: {
        summary: 'Ngân sách tuỳ chỉnh',
        value: {
          periodType: 'CUSTOM',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          limitAmount: 2000000,
        },
      },
    },
  })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateBudgetDto,
  ) {
    return this.budgetsService.create(user.userId, dto);
  }

  @Get()
  @ApiSuccess(200, arrayOf(responseSchemas.budget))
  findAll(@CurrentUser() user: { userId: string }) {
    return this.budgetsService.findAll(user.userId);
  }

  @Get(':id/progress')
  @ApiSuccess(200, responseSchemas.budgetProgress)
  @ApiErrors(404)
  getProgress(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.budgetsService.getProgress(user.userId, id);
  }

  @Get(':id')
  @ApiSuccess(200, responseSchemas.budget)
  @ApiErrors(404)
  findOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.budgetsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiSuccess(200, responseSchemas.budget)
  @ApiErrors(400, 404)
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgetsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiSuccess(200, responseSchemas.message)
  @ApiErrors(404)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.budgetsService.remove(user.userId, id);
  }
}
