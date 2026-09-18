import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  API_PREFIX: Joi.string().default('api/v1'),
  TRUSTED_PROXY_IPS: Joi.string().allow('').optional(),

  DATABASE_URL: Joi.string().required(),

  REDIS_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().required(),

  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),

  JWT_REFRESH_SECRET: Joi.string().required(),

  JWT_REFRESH_EXPIRES: Joi.string().default('7d'),

  OTP_DELIVERY_PROVIDER: Joi.string().valid('smtp').required(),
  MAIL_HOST: Joi.string().trim().empty('').when('OTP_DELIVERY_PROVIDER', {
    is: 'smtp',
    then: Joi.required(),
  }),
  MAIL_PORT: Joi.number()
    .integer()
    .min(1)
    .max(65535)
    .empty('')
    .when('OTP_DELIVERY_PROVIDER', {
      is: 'smtp',
      then: Joi.required(),
    }),
  MAIL_USER: Joi.string().trim().empty('').optional(),
  MAIL_PASSWORD: Joi.string().empty('').optional(),
  MAIL_FROM: Joi.string().trim().empty('').when('OTP_DELIVERY_PROVIDER', {
    is: 'smtp',
    then: Joi.required(),
  }),
  MAIL_SECURE: Joi.boolean().default(false),
  MAIL_CONNECTION_TIMEOUT_MS: Joi.number().integer().positive().default(10000),

  SMS_PROVIDER_API_KEY: Joi.string().allow('').optional(),

  UPLOAD_STORAGE: Joi.string().valid('local', 's3').default('local'),

  UPLOAD_MAX_SIZE_MB: Joi.number().default(5),
}).and('MAIL_USER', 'MAIL_PASSWORD');
