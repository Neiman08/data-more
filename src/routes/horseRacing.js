import express from 'express';
// Probaremos con un parser más directo
import pdf from 'pdf-parse/lib/pdf-parse.js'; 
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

// ... (Tus datos demo se quedan igual)

router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();
    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    const response = await fetch(url);
    if (!response.ok) return res.status(404).json({ ok: false, error: 'PDF no encontrado' });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Configuración mínima para no saturar la RAM
    const options = {
        pagerender: function(pageData) {
            return pageData.getTextContent().then(function(textContent) {
                return textContent.items.map(item => item.str).join(' ');
            });
        }
    };

    const data = await pdf(buffer, options);
    const cleanText = data.text.replace(/\s+/g, ' ').trim();

    res.json({
      ok: true,
      url,
      preview: cleanText.substring(0, 3000)
    });

  } catch (error) {
    console.error('ERROR CRÍTICO:', error);
    // Si falla el parseo, al menos devolvemos la URL para no romper la app
    res.status(500).json({ 
        ok: false, 
        error: "Error al leer PDF (Posible falta de RAM en Render)",
        url 
    });
  }
});

export default router;
