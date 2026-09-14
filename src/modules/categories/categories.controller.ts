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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@ApiErrors(401)
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiSuccess(201, responseSchemas.category)
  @ApiErrors(400)
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user.userId, dto);
  }

  @Get()
  @ApiSuccess(200, arrayOf(responseSchemas.category))
  findAll(@CurrentUser() user: { userId: string }) {
    return this.categoriesService.findAllFlat(user.userId);
  }

  @Get('tree')
  @ApiSuccess(200, responseSchemas.categoryTree)
  findTree(@CurrentUser() user: { userId: string }) {
    return this.categoriesService.findTree(user.userId);
  }

  @Patch(':id')
  @ApiSuccess(200, responseSchemas.category)
  @ApiErrors(400, 403, 404)
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiSuccess(200, responseSchemas.message)
  @ApiErrors(400, 403, 404)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.categoriesService.remove(user.userId, id);
  }
}
