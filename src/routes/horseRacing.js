import express from 'express';
import pdf from 'pdf-parse'; // Mantenemos el import normal
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

// ... (tus datos demo y rutas de analyze se quedan igual)

router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();
    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    const response = await fetch(url);
    if (!response.ok) return res.status(404).json({ ok: false, error: 'PDF no encontrado' });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // FIX: Intentar llamar a la función de dos maneras para evitar el error
    let data;
    try {
        data = await pdf(buffer);
    } catch (e) {
        // Si falla la primera, intentamos con .default (común en ESM)
        const pdfParser = pdf.default || pdf;
        data = await pdfParser(buffer);
    }

    const cleanText = data.text.replace(/\s+/g, ' ').trim();

    res.json({
      ok: true,
      url,
      info: {
        paginas: data.numpages,
      },
      textoExtraido: cleanText.substring(0, 5000) 
    });

  } catch (error) {
    console.error('❌ Error final:', error);
    res.status(500).json({ ok: false, error: 'Error procesando PDF: ' + error.message });
  }
});

export default router;
