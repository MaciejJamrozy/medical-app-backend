const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Setting } = require('../models');
const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = require('../middleware/auth');
const { PORT } = require('../server');

exports.register = async (req, res) => {
    try {
        const { username, password, name } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, name, role: 'patient' });
        res.status(201).json({ message: 'Zarejestrowano' });
    } catch (e) { res.status(400).json({ error: e.message }); }
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username } });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Błąd logowania' });
        }

        user.tokenVersion += 1;
        await user.save();

        const accessToken = jwt.sign(
            { id: user.id, role: user.role, version: user.tokenVersion }, 
            ACCESS_TOKEN_SECRET, 
            { expiresIn: '10s' } 
        );

        const refreshToken = jwt.sign(
            { id: user.id, role: user.role }, 
            REFRESH_TOKEN_SECRET, 
            { expiresIn: '7d' }
        );

        user.refreshToken = refreshToken;
        await user.save();

        const authSetting = await Setting.findOne({ where: { key: 'AUTH_MODE' } });
        const authMode = authSetting ? authSetting.value : 'LOCAL';

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            sameSite: 'lax',
            path: "/api/auth",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ 
            accessToken, 
            role: user.role, 
            id: user.id,
            name: user.name,
            username: user.username,
            isBanned: user.isBanned,
            authMode 
        });

    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.refreshToken = async (req, res) => {
    const token = req.cookies.refreshToken; 
    
    if (!token) return res.sendStatus(401);

    try {
        const user = await User.findOne({ where: { refreshToken: token } });
        
        if (!user) {
            res.clearCookie('refreshToken');
            return res.sendStatus(403); 
        }

        jwt.verify(token, REFRESH_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                res.clearCookie('refreshToken');
                return res.sendStatus(403);
            }

            const newAccessToken = jwt.sign(
                { 
                    id: user.id, 
                    role: user.role, 
                    version: user.tokenVersion 
                }, 
                ACCESS_TOKEN_SECRET, 
                { expiresIn: '10s' } 
            );

            res.json({ accessToken: newAccessToken });
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
};

exports.logout = async (req, res) => {
    const token = req.cookies.refreshToken;
    
    if (!token) return res.sendStatus(204);

    try {
        const user = await User.findOne({ where: { refreshToken: token } });
        if (user) {
            user.refreshToken = null;
            await user.save();
        }
        
        res.clearCookie('refreshToken', {
            httpOnly: true,
            sameSite: 'lax',
            path: "/api/auth",
        });
        
        res.sendStatus(204);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getAuthSettings = async (req, res) => {
    try {
        const setting = await Setting.findOne({ where: { key: 'AUTH_MODE' } });
        res.json({ mode: setting ? setting.value : 'LOCAL' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};