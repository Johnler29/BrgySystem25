// models/UserSettings.js
const mongoose = require('mongoose');

const UserSettingsSchema = new mongoose.Schema({
  userId: { type: String, index: true, unique: true }, // use your actual user _id or username
  theme: { type: String, default: 'light' },
  language: { type: String, default: 'en' },
  timezone: { type: String, default: 'Asia/Manila' },
  dateFormat: { type: String, default: 'YYYY-MM-DD' },
  fontSize: { type: String, default: 'medium' },
  autoSave: { type: Boolean, default: true },
  compactMode: { type: Boolean, default: false },
  showSidebar: { type: Boolean, default: true },
  animations: { type: Boolean, default: true },
  highContrast: { type: Boolean, default: false },
  twoFactor: { type: Boolean, default: false },
  sessionTimeout: { type: String, default: '30' },
  loginNotif: { type: Boolean, default: true },
  activityTracking: { type: Boolean, default: true },
  showProfile: { type: Boolean, default: true },
  browserNotif: { type: Boolean, default: false },
  autoBackup: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('UserSettings', UserSettingsSchema);
