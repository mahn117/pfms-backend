import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsTrendPeriod(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTrendPeriod',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (value === undefined || value === null || value === '') {
            return true;
          }

          if (typeof value !== 'string') {
            return false;
          }

          const dto = args.object as {
            granularity?: 'week' | 'month';
          };

          const granularity = dto.granularity ?? 'month';

          if (granularity === 'month') {
            return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
          }

          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
          }

          const date = new Date(`${value}T00:00:00.000Z`);

          return (
            !Number.isNaN(date.getTime()) &&
            date.toISOString().slice(0, 10) === value
          );
        },

        defaultMessage(args: ValidationArguments) {
          const dto = args.object as {
            granularity?: 'week' | 'month';
          };

          const granularity = dto.granularity ?? 'month';

          if (granularity === 'month') {
            return `${args.property} phải có định dạng YYYY-MM và tháng phải từ 01 đến 12`;
          }

          return `${args.property} phải là ngày hợp lệ theo định dạng YYYY-MM-DD`;
        },
      },
    });
  };
}
