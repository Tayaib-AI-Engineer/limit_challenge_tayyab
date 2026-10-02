import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  // LoginForm reads ?next= with useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
