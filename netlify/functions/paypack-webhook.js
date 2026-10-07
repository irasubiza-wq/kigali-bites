// netlify/functions/paypack-webhook.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

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

    if (!ref) {
      return { statusCode: 200, body: JSON.stringify({ received: true, note: 'no ref' }) };
    }

    const ordersSnapshot = await db.collection('orders')
      .where('paymentRef', '==', ref)
      .limit(1)
      .get();

    if (ordersSnapshot.empty) {
      console.log(`No order found for ref: ${ref}`);
      return { statusCode: 200, body: JSON.stringify({ received: true, note: 'no matching order' }) };
    }

    const orderDoc = ordersSnapshot.docs[0];
    const newPaymentStatus = status === 'successful' ? 'paid' : 'failed';
    const newOrderStatus = status === 'successful' ? 'confirmed' : 'pending';

    await orderDoc.ref.update({
      paymentStatus: newPaymentStatus,
      status: newOrderStatus,
      paymentRef: ref,
      paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Order ${orderDoc.id} updated: ${newPaymentStatus}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, orderUpdated: orderDoc.id, status: newPaymentStatus })
    };
  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
