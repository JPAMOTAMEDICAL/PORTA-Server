import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('throws a readable error when required variables are missing', () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL is required\.\n- JWT_SECRET is required\./,
    );
  });

  it('applies defaults for optional runtime configuration', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/porta',
      JWT_SECRET: 'test-secret',
    });

    expect(env.PORT).toBe(4000);
    expect(env.JWT_EXPIRES_IN).toBe('1d');
    expect(env.JWT_REMEMBER_ME_EXPIRES_IN).toBe('7d');
    expect(env.NODE_ENV).toBe('development');
  });

  it('allows startup without smtp configuration', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/porta',
        JWT_SECRET: 'test-secret',
        SMTP_PORT: '587',
      }),
    ).not.toThrow();
  });

  it('rejects incomplete cloudinary configuration', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/porta',
        JWT_SECRET: 'test-secret',
        CLOUDINARY_CLOUD_NAME: 'demo',
      }),
    ).toThrow(/Cloudinary configuration is incomplete/);
  });

  it('rejects non-postgresql database urls', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://user:password@localhost:3306/porta',
        JWT_SECRET: 'test-secret',
      }),
    ).toThrow(/DATABASE_URL must use a PostgreSQL connection string/);
  });
});
