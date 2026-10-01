// netlify/functions/paypack-webhook.js
exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body);
    console.log('📬 Webhook received:', JSON.stringify(payload));

    const transaction = payload.data || payload;
    const ref = transaction.ref;
    const status = transaction.status;

    console.log(`Payment ref: ${ref} | status: ${status}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, ref, status })
    };
  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
