import type { Metadata } from 'next';
import CartClient from './cart-client';

export const metadata: Metadata = {
  title: 'Panier — KESSIA Market',
  description: 'Vos articles avant paiement.',
};

export default function CartPage() {
  return <CartClient />;
}
