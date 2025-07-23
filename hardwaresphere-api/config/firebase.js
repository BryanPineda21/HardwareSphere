require('dotenv').config(); 
const admin = require('firebase-admin');

// Initialize Firebase Admin only if it hasn't been already
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      clientId: process.env.FIREBASE_CLIENT_ID,
      authUri: process.env.FIREBASE_AUTH_URI,
      tokenUri: process.env.FIREBASE_TOKEN_URI,
    }),
    storageBucket: `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app` // Corrected bucket name
  });
  console.log('Firebase Admin initialized.');
}

// Create and export the initialized services directly
const firestore = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

module.exports = {
  admin,
  firestore,
  auth,
  storage
};


