const jwt = require('jsonwebtoken');
const SECRET_KEY = 'super-tajny-klucz-do-podmiany-w-produkcji';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Brak tokena' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token nieprawidłowy' });
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

module.exports = { authenticateToken, authorizeRole, SECRET_KEY };