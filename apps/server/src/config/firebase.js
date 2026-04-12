import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';

let firebaseApp = null;

/**
 * Initialize Firebase Admin SDK for file storage.
 * Requires FIREBASE_SERVICE_ACCOUNT_PATH and FIREBASE_STORAGE_BUCKET env vars.
 */
export function initFirebase() {
    if (firebaseApp || getApps().length > 0) {
        return;
    }

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

    if (!serviceAccountPath || !storageBucket) {
        console.warn(
            '[Firebase] Missing FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_STORAGE_BUCKET. File uploads will be disabled.'
        );
        return;
    }

    try {
        const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
        firebaseApp = initializeApp({
            credential: cert(serviceAccount),
            storageBucket,
        });

        // Autoconfigure CORS for the bucket so the frontend <canvas> can load images
        const bucket = getStorage().bucket();
        bucket.setCorsConfiguration([
            {
                origin: ['*'],
                method: ['GET', 'OPTIONS'],
                maxAgeSeconds: 3600,
            },
        ]).catch(err => {
            console.warn('[Firebase] Could not set CORS policy (might lack permissions):', err.message);
        });

        console.log('[Firebase] Initialized successfully.');
    } catch (err) {
        console.error('[Firebase] Failed to initialize:', err.message);
    }
}

/**
 * Get the Firebase Storage bucket instance.
 * Returns null if Firebase is not initialized.
 */
export function getBucket() {
    if (!firebaseApp && getApps().length === 0) return null;
    try {
        return getStorage().bucket();
    } catch {
        return null;
    }
}
