import { envValidationSchema } from './env.validation';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/pfms',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
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
});
