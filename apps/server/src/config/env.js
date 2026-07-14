// Fail-fast environment validation. Called once at boot (see server.js) so a
// misconfigured deploy dies immediately with a clear message, rather than lazily
// at the first jwt.sign() — or worse, running happily with a guessable secret.

const MIN_SECRET_LENGTH = 32;

// Placeholder values that have shipped in .env.example / tutorials. A token signed
// with any of these is forgeable by anyone, which bypasses passcodes and invites
// entirely (the room JWT is the only thing every socket handler trusts).
const WEAK_SECRETS = new Set([
    'your-secret-key',
    'change-me',
    'changeme',
    'secret',
    'test',
]);

export function validateEnv() {
    const errors = [];
    const isProduction = process.env.NODE_ENV === 'production';

    const tokenSecret = process.env.TOKEN_SECRET;
    if (!tokenSecret) {
        errors.push('TOKEN_SECRET is not set.');
    } else if (WEAK_SECRETS.has(tokenSecret.trim().toLowerCase())) {
        errors.push('TOKEN_SECRET is a well-known placeholder value — room tokens would be forgeable.');
    } else if (tokenSecret.length < MIN_SECRET_LENGTH) {
        errors.push(`TOKEN_SECRET is too short (${tokenSecret.length} chars, need >= ${MIN_SECRET_LENGTH}).`);
    }

    // Dev falls back to a local mongod (see config/db.js); production must be explicit.
    if (isProduction && !process.env.MONGODB_URI) {
        errors.push('MONGODB_URI is not set (required when NODE_ENV=production).');
    }

    if (errors.length > 0) {
        throw new Error(
            `Invalid environment configuration:\n` +
            errors.map((e) => `  - ${e}`).join('\n') +
            `\n\nGenerate a strong secret with:  openssl rand -hex 32`
        );
    }

    // These degrade gracefully by design (uploads / voice disabled), so warn only.
    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || !process.env.LIVEKIT_URL) {
        console.warn('[Env] LiveKit is not fully configured — voice/video/screen-share will be unavailable.');
    }
    if (!process.env.FIREBASE_STORAGE_BUCKET) {
        console.warn('[Env] FIREBASE_STORAGE_BUCKET is not set — file uploads will be disabled.');
    }
}
