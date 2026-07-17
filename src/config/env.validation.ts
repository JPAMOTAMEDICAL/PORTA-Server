type RawEnv = Record<string, unknown>;

const DEFAULT_PORT = 4000;
const DEFAULT_JWT_EXPIRES_IN = '1d';
const DEFAULT_JWT_REMEMBER_ME_EXPIRES_IN = '7d';
const DEFAULT_NODE_ENV = 'development';
const POSTGRES_URL_PATTERN =
  /^(postgres(?:ql)?|prisma\+postgres(?:ql)?):\/\//i;
const CLOUDINARY_REQUIRED_IF_SET = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

function readString(env: RawEnv, key: string) {
  const value = env[key];
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function listMissing(env: RawEnv, keys: readonly string[]) {
  return keys.filter((key) => readString(env, key).length === 0);
}

function parsePort(rawValue: string, fieldName: string, errors: string[]) {
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${fieldName} must be a positive integer.`);
    return undefined;
  }

  return parsed;
}

export function validateEnv(rawEnv: RawEnv) {
  const env = { ...rawEnv };
  const errors: string[] = [];

  const databaseUrl = readString(env, 'DATABASE_URL');
  const jwtSecret = readString(env, 'JWT_SECRET');
  const jwtExpiresIn =
    readString(env, 'JWT_EXPIRES_IN') || DEFAULT_JWT_EXPIRES_IN;
  const jwtRememberMeExpiresIn =
    readString(env, 'JWT_REMEMBER_ME_EXPIRES_IN') ||
    DEFAULT_JWT_REMEMBER_ME_EXPIRES_IN;
  const nodeEnv = readString(env, 'NODE_ENV') || DEFAULT_NODE_ENV;
  const corsOrigins = readString(env, 'CORS_ORIGINS');
  const frontendAdminUrl = readString(env, 'FRONTEND_ADMIN_URL');
  const frontendFacilityUrl = readString(env, 'FRONTEND_FACILITY_URL');
  const googleMapsApiKey = readString(env, 'GOOGLE_MAPS_API_KEY');
  const documentsStorageRoot = readString(env, 'DOCUMENTS_STORAGE_ROOT');
  const cloudinaryCloudName = readString(env, 'CLOUDINARY_CLOUD_NAME');
  const cloudinaryApiKey = readString(env, 'CLOUDINARY_API_KEY');
  const cloudinaryApiSecret = readString(env, 'CLOUDINARY_API_SECRET');
  const cloudinaryUploadFolder = readString(env, 'CLOUDINARY_UPLOAD_FOLDER');
  const smtpHost = readString(env, 'SMTP_HOST');
  const smtpPortValue = readString(env, 'SMTP_PORT');
  const smtpUsername = readString(env, 'SMTP_USERNAME');
  const smtpPassword = readString(env, 'SMTP_PASSWORD');
  const smtpEncryption = readString(env, 'SMTP_ENCRYPTION').toUpperCase();
  const smtpSenderName = readString(env, 'SMTP_SENDER_NAME');
  const smtpReplyEmail = readString(env, 'SMTP_REPLY_EMAIL');
  const smtpDefaultSenderEmail = readString(
    env,
    'SMTP_DEFAULT_SENDER_EMAIL',
  );

  if (!databaseUrl) {
    errors.push('DATABASE_URL is required.');
  } else if (!POSTGRES_URL_PATTERN.test(databaseUrl)) {
    errors.push(
      'DATABASE_URL must use a PostgreSQL connection string (postgresql:// or postgres://).',
    );
  }

  if (!jwtSecret) {
    errors.push('JWT_SECRET is required.');
  }

  const port =
    parsePort(readString(env, 'PORT') || String(DEFAULT_PORT), 'PORT', errors) ??
    DEFAULT_PORT;
  const smtpPort = parsePort(smtpPortValue, 'SMTP_PORT', errors);

  if (smtpEncryption && !['NONE', 'TLS', 'SSL'].includes(smtpEncryption)) {
    errors.push('SMTP_ENCRYPTION must be one of NONE, TLS, or SSL.');
  }

  const hasAnyCloudinaryConfig = CLOUDINARY_REQUIRED_IF_SET.some(
    (key) => readString(env, key).length > 0,
  );
  if (hasAnyCloudinaryConfig) {
    const missing = listMissing(env, CLOUDINARY_REQUIRED_IF_SET);
    if (missing.length > 0) {
      errors.push(
        `Cloudinary configuration is incomplete. Missing: ${missing.join(', ')}.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment configuration is invalid:\n- ${errors.join('\n- ')}`,
    );
  }

  return {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    JWT_REMEMBER_ME_EXPIRES_IN: jwtRememberMeExpiresIn,
    NODE_ENV: nodeEnv,
    PORT: port,
    CORS_ORIGINS: corsOrigins,
    FRONTEND_ADMIN_URL: frontendAdminUrl,
    FRONTEND_FACILITY_URL: frontendFacilityUrl,
    GOOGLE_MAPS_API_KEY: googleMapsApiKey,
    DOCUMENTS_STORAGE_ROOT: documentsStorageRoot,
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_USERNAME: smtpUsername,
    SMTP_PASSWORD: smtpPassword,
    SMTP_ENCRYPTION: smtpEncryption,
    SMTP_SENDER_NAME: smtpSenderName,
    SMTP_REPLY_EMAIL: smtpReplyEmail,
    SMTP_DEFAULT_SENDER_EMAIL: smtpDefaultSenderEmail,
    CLOUDINARY_CLOUD_NAME: cloudinaryCloudName,
    CLOUDINARY_API_KEY: cloudinaryApiKey,
    CLOUDINARY_API_SECRET: cloudinaryApiSecret,
    CLOUDINARY_UPLOAD_FOLDER: cloudinaryUploadFolder,
  };
}
