import { envValidationSchema } from './env.validation';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/pfms',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  OTP_DELIVERY_PROVIDER: 'smtp',
  MAIL_HOST: 'smtp.example.com',
  MAIL_PORT: 587,
  MAIL_FROM: 'no-reply@example.com',
};

describe('envValidationSchema', () => {
  it('accepts an undefined TRUSTED_PROXY_IPS value', () => {
    const { error, value } = envValidationSchema.validate(requiredEnvironment);

    expect(error).toBeUndefined();
    expect(value.TRUSTED_PROXY_IPS).toBeUndefined();
  });

  it('accepts an empty TRUSTED_PROXY_IPS value', () => {
    const { error, value } = envValidationSchema.validate({
      ...requiredEnvironment,
      TRUSTED_PROXY_IPS: '',
    });

    expect(error).toBeUndefined();
    expect(value.TRUSTED_PROXY_IPS).toBe('');
  });

  it('preserves a trusted proxy IP list', () => {
    const trustedProxyIps = '127.0.0.1,10.0.0.1';
    const { error, value } = envValidationSchema.validate({
      ...requiredEnvironment,
      TRUSTED_PROXY_IPS: trustedProxyIps,
    });

    expect(error).toBeUndefined();
    expect(value.TRUSTED_PROXY_IPS).toBe(trustedProxyIps);
  });

  it.each(['MAIL_HOST', 'MAIL_PORT', 'MAIL_FROM'] as const)(
    'rejects smtp config without %s',
    (field) => {
      const environment = { ...requiredEnvironment };
      delete environment[field];

      const { error } = envValidationSchema.validate(environment);

      expect(error).toBeDefined();
    },
  );

  it.each([{ MAIL_USER: 'smtp-user' }, { MAIL_PASSWORD: 'smtp-password' }])(
    'rejects incomplete SMTP auth credentials',
    (credentials) => {
      const { error } = envValidationSchema.validate({
        ...requiredEnvironment,
        ...credentials,
      });

      expect(error).toBeDefined();
    },
  );

  it('accepts valid smtp config and parses defaults/booleans', () => {
    const { error, value } = envValidationSchema.validate({
      ...requiredEnvironment,
      MAIL_USER: 'smtp-user',
      MAIL_PASSWORD: 'smtp-password',
      MAIL_SECURE: 'true',
    });

    expect(error).toBeUndefined();
    expect(value.MAIL_SECURE).toBe(true);
    expect(value.MAIL_CONNECTION_TIMEOUT_MS).toBe(10000);
  });
});
