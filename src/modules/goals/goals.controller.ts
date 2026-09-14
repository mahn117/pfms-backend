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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ApiErrors,
  ApiSuccess,
  arrayOf,
  responseSchemas,
} from '@/common/swagger/response-schemas';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { ContributeGoalDto } from './dto/contribute-goal.dto';

@ApiTags('Goals')
@ApiBearerAuth()
@ApiErrors(401)
@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @ApiSuccess(201, responseSchemas.goal)
  @ApiErrors(400)
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateGoalDto) {
    return this.goalsService.create(user.userId, dto);
  }

  @Get()
  @ApiSuccess(200, arrayOf(responseSchemas.goal))
  findAll(@CurrentUser() user: { userId: string }) {
    return this.goalsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiSuccess(200, responseSchemas.goal)
  @ApiErrors(404)
  findOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.goalsService.findOne(user.userId, id);
  }

  @Post(':id/contribute')
  @ApiSuccess(201, responseSchemas.goal)
  @ApiErrors(400, 404)
  contribute(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: ContributeGoalDto,
  ) {
    return this.goalsService.contribute(user.userId, id, dto);
  }

  @Patch(':id')
  @ApiSuccess(200, responseSchemas.goal)
  @ApiErrors(400, 404)
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goalsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiSuccess(200, responseSchemas.message)
  @ApiErrors(404)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.goalsService.remove(user.userId, id);
  }
}
