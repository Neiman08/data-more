import mongoose from 'mongoose';

const paymentRequestSchema = new mongoose.Schema({
  nombre: String,
  email: { type: String, required: true },
  metodo: String,
  status: { type: String, default: 'pendiente' }, // pendiente | aprobado
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('PaymentRequest', paymentRequestSchema);