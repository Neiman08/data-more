import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fecha: { type: Date, default: Date.now }
});

export default mongoose.model('User', UserSchema);