const configuredSecret = process.env.JWT_SECRET;

if (process.env.NODE_ENV === 'production' && !configuredSecret) {
  throw new Error('JWT_SECRET must be configured in production.');
}

if (process.env.NODE_ENV === 'production' && Buffer.byteLength(configuredSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET must be at least 32 bytes in production.');
}

module.exports = configuredSecret || 'local-development-only-secret-do-not-use-in-production';
