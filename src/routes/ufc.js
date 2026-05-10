import express from 'express';

const router = express.Router();

router.get('/fights', async (req, res) => {

  try {

    const fights = [

      {
        id: 1,

        fighterA: {
          name: 'Islam Makhachev',
          record: '27-1-0',
          image: 'https://i.pravatar.cc/200?img=12'
        },

        fighterB: {
          name: 'Leon Edwards',
          record: '22-4-0',
          image: 'https://i.pravatar.cc/200?img=14'
        },

        prediction: {
          winner: 'Islam Makhachev',
          probability: 68,
          confidence: 'HIGH',
          method: 'Submission',
          risk: 'LOW',
          bestBet: 'Moneyline'
        },

        analysis: `
          Data More AI projects a strong grappling advantage
          for Islam Makhachev. The model detects elite control
          metrics, pressure pace, and superior takedown efficiency.
          Leon Edwards may have moments on the feet early,
          but over 5 rounds the probability heavily favors
          Makhachev by submission or dominant decision.
        `
      },

      {
        id: 2,

        fighterA: {
          name: 'Alex Pereira',
          record: '12-2-0',
          image: 'https://i.pravatar.cc/200?img=32'
        },

        fighterB: {
          name: 'Tom Aspinall',
          record: '15-3-0',
          image: 'https://i.pravatar.cc/200?img=33'
        },

        prediction: {
          winner: 'Tom Aspinall',
          probability: 59,
          confidence: 'MEDIUM',
          method: 'KO/TKO',
          risk: 'MEDIUM',
          bestBet: 'Fight Does Not Go Distance'
        },

        analysis: `
          Data More AI sees major danger on both sides.
          Pereira has elite striking and knockout power,
          but Aspinall's speed and movement create matchup
          problems early. The model projects a violent fight
          with high finish probability before Round 3.
        `
      }

    ];

    res.json({
      ok: true,
      count: fights.length,
      fights
    });

  } catch (error) {

    res.status(500).json({
      ok: false,
      error: error.message
    });

  }

});

export default router;