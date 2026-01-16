const jwt = require('jsonwebtoken');
const { User } = require('../models'); // <--- IMPORTUJEMY MODEL UŻYTKOWNIKA

const ACCESS_TOKEN_SECRET = 'super-tajny-klucz-dostepu';
const REFRESH_TOKEN_SECRET = 'super-tajny-klucz-odswiezania';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Brak tokena' });

    jwt.verify(token, ACCESS_TOKEN_SECRET, async (err, decodedUser) => {
        if (err) return res.status(403).json({ message: 'Token nieprawidłowy' });

        try {
            // 1. Pobieramy aktualne dane użytkownika z bazy
            const userInDb = await User.findByPk(decodedUser.id);

            // 2. SPRAWDZENIE WERSJI SESJI:
            // Jeśli użytkownik nie istnieje LUB wersja w tokenie jest inna niż w bazie
            // oznacza to, że nastąpiło wylogowanie lub zalogowanie na innym urządzeniu.
            if (!userInDb || decodedUser.version !== userInDb.tokenVersion) {
                return res.status(403).json({ message: 'Sesja wygasła. Zalogowano na innym urządzeniu.' });
            }

            // 3. Jeśli wersje się zgadzają, przepuszczamy dalej
            req.user = decodedUser; 
            next();
            
        } catch (dbError) {
            console.error("Błąd weryfikacji sesji:", dbError);
            return res.status(500).json({ message: 'Błąd serwera' });
        }
    });
};

const authorizeRole = (roles) => {
    return (req, res, next) => {
        // req.user pochodzi z decodedUser z powyższej funkcji
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Brak uprawnień' });
        }
        next();
    };
};

module.exports = { 
    authenticateToken, 
    authorizeRole, 
    ACCESS_TOKEN_SECRET, 
    REFRESH_TOKEN_SECRET 
};