import { loadStripe } from '@stripe/stripe-js';

// Get Stripe public key from environment
const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;

if (!stripePublicKey) {
  console.error('Missing VITE_STRIPE_PUBLIC_KEY environment variable');
}

// Initialize Stripe
export const stripePromise = loadStripe(stripePublicKey);

// Helper function to get Stripe instance
export const getStripe = async () => {
  return await stripePromise;
};