import express from 'express';

const router = express.Router();

router.post('/commentary', async (req,res)=>{

  try{

    const { text } = req.body;

    if(!text){
      return res.status(400).json({
        ok:false,
        error:'Missing text'
      });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        method:'POST',
        headers:{
          'Accept':'audio/mpeg',
          'Content-Type':'application/json',
          'xi-api-key':process.env.ELEVENLABS_API_KEY
        },
        body:JSON.stringify({
          text,
          model_id:'eleven_multilingual_v2',
          voice_settings:{
            stability:0.38,
            similarity_boost:0.8,
            style:0.45,
            use_speaker_boost:true
          }
        })
      }
    );

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    res.set({
      'Content-Type':'audio/mpeg',
      'Content-Length':audioBuffer.length
    });

    res.send(audioBuffer);

  }catch(err){

    console.log(err);

    res.status(500).json({
      ok:false,
      error:'Voice generation failed'
    });

  }

});

export default router;