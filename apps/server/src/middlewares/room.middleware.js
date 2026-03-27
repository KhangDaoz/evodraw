function validateCreateRoom(req, res, next) {
    const { name } = req.body || {};
    
    if (name && (typeof name !== 'string' || name.length > 50)) {
        return res.status(400).json({ success: false, message: 'Invalid format: "name" must be a string under 50 characters.' });
    }
    
    next();
}

function validateJoinRoom(req, res, next) {
    const { code, passcode } = req.body || {};
    
    if (!code || typeof code !== 'string' || code.length !== 6) {
        return res.status(400).json({ success: false, message: 'Invalid format: "code" must be a exactly a 6-character string.' });
    }

    // Checking strictly 4 digits
    if (!passcode || typeof passcode !== 'string' || passcode.length !== 4 || !/^\d{4}$/.test(passcode)) {
        return res.status(400).json({ success: false, message: 'Invalid format: "passcode" must be exactly a 4-digit numeric string.' });
    }

    next();
}

module.exports = {
    validateCreateRoom,
    validateJoinRoom
};
