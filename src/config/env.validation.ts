import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  API_PREFIX: Joi.string().default('api/v1'),

  DATABASE_URL: Joi.string().required(),

  REDIS_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().required(),

  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),

  JWT_REFRESH_SECRET: Joi.string().required(),

  JWT_REFRESH_EXPIRES: Joi.string().default('7d'),

  MAIL_HOST: Joi.string().allow('').optional(),
  MAIL_PORT: Joi.number().optional().allow(''),
  MAIL_USER: Joi.string().allow('').optional(),
  MAIL_PASSWORD: Joi.string().allow('').optional(),

  SMS_PROVIDER_API_KEY: Joi.string().allow('').optional(),

  UPLOAD_STORAGE: Joi.string().valid('local', 's3').default('local'),

  UPLOAD_MAX_SIZE_MB: Joi.number().default(5),
});
