const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'patient' },
    name: { type: DataTypes.STRING, allowNull: false },
    specialization: { type: DataTypes.STRING, allowNull: true },
    isBanned: { type: DataTypes.BOOLEAN, defaultValue: false },
    refreshToken: { type: DataTypes.STRING, allowNull: true }
});

const Slot = sequelize.define('Slot', {
    date: { type: DataTypes.STRING, allowNull: false },
    time: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'free' },
    visitType: { type: DataTypes.STRING },
    patientName: { type: DataTypes.STRING },
    patientNotes: { type: DataTypes.TEXT },
    patientAge: { type: DataTypes.INTEGER },
    patientGender: { type: DataTypes.STRING }
});

const CartItem = sequelize.define('CartItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    patientId: { type: DataTypes.INTEGER, allowNull: false },
    slotId: { type: DataTypes.INTEGER, allowNull: false }
});

const Rating = sequelize.define('Rating', {
    stars: { type: DataTypes.INTEGER, validate: { min: 1, max: 5 } },
    comment: { type: DataTypes.TEXT },
    reply: { type: DataTypes.TEXT }
});

const Absence = sequelize.define('Absence', {
    date: { type: DataTypes.STRING, allowNull: false },
    reason: { type: DataTypes.STRING }
});

// 2. Setting - NOWY MODEL do Zadania 1
const Setting = sequelize.define('Setting', {
    key: { type: DataTypes.STRING, unique: true, allowNull: false },
    value: { type: DataTypes.STRING, allowNull: false }
});

// Relacje
User.hasMany(Slot, { foreignKey: 'doctorId', as: 'doctorSlots' });
Slot.belongsTo(User, { foreignKey: 'doctorId', as: 'Doctor' });

User.hasMany(Slot, { foreignKey: 'patientId', as: 'patientVisits' });
Slot.belongsTo(User, { foreignKey: 'patientId', as: 'Patient' });

User.hasMany(CartItem, { foreignKey: 'patientId' });
CartItem.belongsTo(User, { foreignKey: 'patientId' });

Slot.hasOne(CartItem, { foreignKey: 'slotId' });
CartItem.belongsTo(Slot, { foreignKey: 'slotId' });

User.hasMany(Rating, { foreignKey: 'doctorId', as: 'receivedRatings' });
Rating.belongsTo(User, { foreignKey: 'doctorId', as: 'Doctor' });

User.hasMany(Rating, { foreignKey: 'patientId', as: 'givenRatings' });
Rating.belongsTo(User, { foreignKey: 'patientId', as: 'Patient' });

User.hasMany(Absence, { foreignKey: 'doctorId' });
Absence.belongsTo(User, { foreignKey: 'doctorId' });

module.exports = { sequelize, User, Slot, CartItem, Rating, Absence, Setting };