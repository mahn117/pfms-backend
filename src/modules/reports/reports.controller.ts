import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ApiErrors,
  ApiSuccess,
  arrayOf,
  responseSchemas,
} from '@/common/swagger/response-schemas';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { GetReportSummaryDto } from './dto/get-report-summary.dto';
import { GetReportByCategoryDto } from './dto/get-report-by-category.dto';
import { GetReportTrendDto } from './dto/get-report-trend.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@ApiErrors(401)
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiSuccess(200, responseSchemas.reportSummary)
  @ApiErrors(400, 404)
  getSummary(
    @CurrentUser() user: { userId: string },
    @Query() query: GetReportSummaryDto,
  ) {
    return this.reportsService.getSummary(user.userId, query);
  }

  @Get('trend')
  @ApiSuccess(200, arrayOf(responseSchemas.reportTrend))
  @ApiErrors(400, 404)
  getTrend(
    @CurrentUser() user: { userId: string },
    @Query() query: GetReportTrendDto,
  ) {
    return this.reportsService.getTrend(user.userId, query);
  }

  @Get('by-category')
  @ApiSuccess(200, arrayOf(responseSchemas.reportCategory))
  @ApiErrors(400)
  getByCategory(
    @CurrentUser() user: { userId: string },
    @Query() query: GetReportByCategoryDto,
  ) {
    return this.reportsService.getByCategory(user.userId, query);
  }
}
