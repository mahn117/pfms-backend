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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WalletsService } from './wallets.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { GetWalletSummaryDto } from './dto/get-wallet-summary.dto';
import { ReconcileWalletDto } from './dto/reconcile-wallet.dto';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateWalletDto,
  ) {
    return this.walletsService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { userId: string }) {
    return this.walletsService.findAll(user.userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.walletsService.findOne(user.userId, id);
  }

  @Get(':id/summary')
  getSummary(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query() query: GetWalletSummaryDto,
  ) {
    return this.walletsService.getSummary(user.userId, id, query);
  }

  @Post(':id/reconcile')
  reconcile(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: ReconcileWalletDto,
  ) {
    return this.walletsService.reconcile(user.userId, id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateWalletDto,
  ) {
    return this.walletsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.walletsService.remove(user.userId, id);
  }
}
