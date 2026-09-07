import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class ContributeGoalDto {
  @ApiProperty({
    example: 500000,
    description: 'Số tiền nạp thêm vào mục tiêu, phải lớn hơn 0',
  })
  @IsNumber()
  @IsPositive({ message: 'amount phải lớn hơn 0' })
  amount!: number;
}
