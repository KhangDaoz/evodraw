// Validate code and passcode in the request body
export function validateRoom(req, res, next) {
    const { code, passcode } = req.body || {};

    if (!code || typeof code !== 'string' || code.length !== 6) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "code" must be exactly a 6-character string.'
        });
    }

    if (!passcode || typeof passcode !== 'string' || passcode.length !== 4 || !/^\d{4}$/.test(passcode)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "passcode" must be exactly a 4-digit numeric string.'
        });
    }

    next();
}

export function validateUpdateRoom(req, res, next) {
    const { elements, appState, roomVersion } = req.body || {};

    if (!Array.isArray(elements)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "elements" must be an array.'
        });
    }

    if (elements.length > 10000) {
        return res.status(400).json({
            success: false,
            message: 'Too many elements. Maximum allowed is 10000.'
        });
    }

    if (typeof appState !== 'object' || appState === null) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "appState" must be a non-null object.'
        });
    }

    if (typeof roomVersion !== 'number' || roomVersion < 0) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "roomVersion" must be a non-negative number.'
        });
    }

    next();
}
