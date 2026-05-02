import express from 'express';
// Importación dinámica para evitar errores de carga en el arranque
let pdf;

const router = express.Router();

// Datos Demo
const demoRaces = [
  { raceId: 'demo-1', track: 'Santa Anita', runners: [{ name: 'Fast Storm', speed: 91 }] }
];

router.get('/racecards', (req, res) => res.json({ ok: true, races: demoRaces }));

router.get('/import-program', async (req, res) => {
  try {
    // Cargamos la librería solo cuando se llama al endpoint, no al iniciar el server
    if (!pdf) {
      const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
      pdf = pdfParse;
    }

    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();
    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    const response = await fetch(url);
    if (!response.ok) return res.status(404).json({ ok: false, error: 'PDF no encontrado' });

    const buffer = Buffer.from(await response.arrayBuffer());

    // Configuración para evitar errores de fuentes en Render
    const options = {
        pagerender: function(pageData) {
            return pageData.getTextContent().then(function(textContent) {
                return textContent.items.map(s => s.str).join(' ');
            });
        }
    };

    const data = await pdf(buffer, options);

    res.json({
      ok: true,
      url,
      textoExtraido: data.text.substring(0, 3000).replace(/\s+/g, ' ')
    });

  } catch (error) {
    console.error('❌ Error en el importador:', error);
    res.status(500).json({ ok: false, error: 'Error procesando PDF: ' + error.message });
  }
});

export default router;