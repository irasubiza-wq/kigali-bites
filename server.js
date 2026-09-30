const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/paypack/cashin', async (req, res) => {
  const { phone, amount } = req.body;

  try {
    const authRes = await fetch('https://api.paypack.rw/api/auth/agents/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.PAYPACK_CLIENT_ID,
        client_secret: process.env.PAYPACK_CLIENT_SECRET
      })
    });
    const authData = await authRes.json();

    const payRes = await fetch('https://api.paypack.rw/api/transactions/cashin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.access}`
      },
      body: JSON.stringify({ amount, number: phone })
    });
    const payData = await payRes.json();

    res.json({ success: true, data: payData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server on port ${PORT}`));
