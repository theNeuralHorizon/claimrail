import { requireAuth } from '@/lib/auth/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NewVendorForm } from './new-vendor-form';

export const metadata = { title: 'Add vendor · ClaimRail' };

export default async function NewVendorPage() {
  await requireAuth();
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Add a vendor</h1>
        <p className="text-sm text-ink-500 mt-1">
          Paste the vendor's SLA text and we'll extract the credit tiers automatically.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Vendor details</CardTitle>
          <CardDescription>
            Monitor URL is probed every time /api/cron/probes is called.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewVendorForm />
        </CardContent>
      </Card>
    </div>
  );
}
