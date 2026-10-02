import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
