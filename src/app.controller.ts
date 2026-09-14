import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiSuccess } from './common/swagger/response-schemas';
import { AppService } from './app.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiSuccess(200, { type: 'string', example: 'Hello World!' })
  getHello(): string {
    return this.appService.getHello();
  }
}
