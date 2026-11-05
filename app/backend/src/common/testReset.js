// TEST-ONLY "forgot password". Never active in production, even if the env flag is set.
export const TEST_RESET = process.env.ENABLE_TEST_PASSWORD_RESET === 'true' && process.env.NODE_ENV !== 'production';
if (process.env.ENABLE_TEST_PASSWORD_RESET === 'true' && process.env.NODE_ENV === 'production')
  console.error('ENABLE_TEST_PASSWORD_RESET is set but ignored because NODE_ENV=production. Remove it from the environment.');
else if (TEST_RESET) console.warn('WARNING: test-only password reset is ENABLED. Anyone who knows a username can reset that password. Never use this in production.');
