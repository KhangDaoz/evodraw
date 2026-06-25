import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, existsSync } from 'fs';

let firebaseApp = null;

export function initFirebase() {
    if (firebaseApp || getApps().length > 0) {
        return;
    }

    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!storageBucket) {
        console.warn('[Firebase] Missing FIREBASE_STORAGE_BUCKET. File uploads will be disabled.');
        return;
    }

    if (!serviceAccountJson && !serviceAccountPath) {
        console.warn('[Firebase] Missing both FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_SERVICE_ACCOUNT_PATH. File uploads will be disabled.');
        return;
    }

    try {
        let serviceAccount;

        if (serviceAccountJson) {
            serviceAccount = JSON.parse(serviceAccountJson);
            console.log('[Firebase] Using credentials from FIREBASE_SERVICE_ACCOUNT_JSON env var.');
        } else if (existsSync(serviceAccountPath)) {
            serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
            console.log('[Firebase] Using credentials from file:', serviceAccountPath);
        } else {
            console.warn('[Firebase] Service account file not found:', serviceAccountPath, '— File uploads will be disabled.');
            return;
        }

        firebaseApp = initializeApp({
            credential: cert(serviceAccount),
            storageBucket,
        });

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

export function getBucket() {
    if (!firebaseApp && getApps().length === 0) return null;
    try {
        return getStorage().bucket();
    } catch {
        return null;
    }
}
