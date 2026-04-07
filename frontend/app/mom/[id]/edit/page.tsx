import ProtectedLayout from '@/components/layout/ProtectedLayout';
import MOMEditor from '@/components/mom/MOMEditor';

export default function MOMEditPage({ params }: { params: { id: string } }) {
  return (
    <ProtectedLayout>
      <div className="max-w-3xl mx-auto">
        <MOMEditor momId={params.id} />
      </div>
    </ProtectedLayout>
  );
}
