const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_SECRET = 'super-tajny-klucz-dostepu';
const REFRESH_TOKEN_SECRET = 'super-tajny-klucz-odswiezania';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Brak tokena' });

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token nieprawidłowy lub wygasł' });
        req.user = user;
        next();
    });
};

const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Brak uprawnień' });
        next();
    };
};

module.exports = { 
    authenticateToken, 
    authorizeRole, 
    ACCESS_TOKEN_SECRET, 
    REFRESH_TOKEN_SECRET 
};