import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { WalletsService } from './wallets.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { GetWalletSummaryDto } from './dto/get-wallet-summary.dto';
import { ReconcileWalletDto } from './dto/reconcile-wallet.dto';

@ApiTags('Wallets')
@ApiBearerAuth()
@ApiErrors(401)
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  @ApiSuccess(201, responseSchemas.wallet)
  @ApiErrors(400)
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateWalletDto,
  ) {
    return this.walletsService.create(user.userId, dto);
  }

  @Get()
  @ApiSuccess(200, arrayOf(responseSchemas.wallet))
  findAll(@CurrentUser() user: { userId: string }) {
    return this.walletsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiSuccess(200, responseSchemas.wallet)
  @ApiErrors(404)
  findOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.walletsService.findOne(user.userId, id);
  }

  @Get(':id/summary')
  @ApiSuccess(200, responseSchemas.walletSummary)
  @ApiErrors(400, 404)
  getSummary(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query() query: GetWalletSummaryDto,
  ) {
    return this.walletsService.getSummary(user.userId, id, query);
  }

  @Post(':id/reconcile')
  @ApiSuccess(201, responseSchemas.reconcile)
  @ApiErrors(400, 404)
  reconcile(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: ReconcileWalletDto,
  ) {
    return this.walletsService.reconcile(user.userId, id, dto);
  }

  @Patch(':id')
  @ApiSuccess(200, responseSchemas.wallet)
  @ApiErrors(400, 404)
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateWalletDto,
  ) {
    return this.walletsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiSuccess(200, responseSchemas.message)
  @ApiErrors(404)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.walletsService.remove(user.userId, id);
  }
}
