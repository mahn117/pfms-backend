import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})], // register({}) rỗng vì mỗi lần sign ta tự truyền secret riêng (access/refresh khác nhau)
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
