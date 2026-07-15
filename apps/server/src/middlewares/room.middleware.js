import { PASSCODE_PATTERN } from '../utils/codeGenerator.js';

// Validate code and passcode in the request body
export function validateRoom(req, res, next) {
    const { code, passcode } = req.body || {};

    if (!code || typeof code !== 'string' || code.length !== 6) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "code" must be exactly a 6-character string.'
        });
    }

    if (!passcode || typeof passcode !== 'string' || !PASSCODE_PATTERN.test(passcode.trim())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "passcode" must be a 4-6 character alphanumeric string.'
        });
    }

    next();
}
