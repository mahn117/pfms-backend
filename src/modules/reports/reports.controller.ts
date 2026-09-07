import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { GetReportSummaryDto } from './dto/get-report-summary.dto';
import { GetReportByCategoryDto } from './dto/get-report-by-category.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: { userId: string },
    @Query() query: GetReportSummaryDto,
  ) {
    return this.reportsService.getSummary(user.userId, query);
  }

  @Get('by-category')
  getByCategory(
    @CurrentUser() user: { userId: string },
    @Query() query: GetReportByCategoryDto,
  ) {
    return this.reportsService.getByCategory(user.userId, query);
  }
}
