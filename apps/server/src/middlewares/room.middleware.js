// Validate code and passcode in the request body
export function validateRoom(req, res, next) {
    const { code, passcode } = req.body || {};

    if (!code || typeof code !== 'string' || code.length !== 6) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "code" must be exactly a 6-character string.'
        });
    }

    // 4–6 chars is transitional: legacy rooms have 4-digit numeric passcodes and
    // TTL out within 24h; new passcodes are 6-char alphanumeric. Can tighten to
    // {6} after one TTL window. Case-insensitive here; the service uppercases.
    if (!passcode || typeof passcode !== 'string' || !/^[A-Za-z0-9]{4,6}$/.test(passcode.trim())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "passcode" must be a 4-6 character alphanumeric string.'
        });
    }

    next();
}

export function validateUpdateRoom(req, res, next) {
    const { elements, appState } = req.body || {};

    if (!Array.isArray(elements)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "elements" must be an array.'
        });
    }

    if (typeof appState !== 'object' || appState === null) {
        return res.status(400).json({
            success: false,
            message: 'Invalid format: "appState" must be a non-null object.'
        });
    }

    // roomVersion is not validated: the server owns versioning (see updateRoomService),
    // so any client-supplied value is ignored rather than trusted.

    next();
}
