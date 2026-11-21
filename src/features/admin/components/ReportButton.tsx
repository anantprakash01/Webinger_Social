/** FR-85: "Report" link that opens a small form. Reports go to the admin reports queue. */
import { useState } from 'react';
import { LuFlag } from 'react-icons/lu';
import { Button, Drawer, FormError, Select, TextArea } from '@/components/ui';
import type { ReportReason, ReportTargetType } from '@/types';
import { useCreateReport } from '../hooks';
import { REPORT_REASONS } from '../schemas';

export function ReportButton({ targetType, targetId, what, className }: { targetType: ReportTargetType; targetId: string; what: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? 'link small report-link'} onClick={() => setOpen(true)}>
        <LuFlag aria-hidden /> Report<span className="sr-only"> {what}</span>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Report ${what}`}>
        {open && <ReportForm targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />}
      </Drawer>
    </>
  );
}

function ReportForm({ targetType, targetId, onClose }: { targetType: ReportTargetType; targetId: string; onClose: () => void }) {
  const create = useCreateReport();
  const [reason, setReason] = useState<ReportReason | undefined>();
  const [details, setDetails] = useState('');
  if (create.isSuccess)
    return (
      <div className="form-stack" role="status">
        <p>
          <strong>Thanks, we got your report.</strong> Our trust & safety team reviews every report. The person you reported is not told who sent it.
        </p>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) create.mutate({ targetType, targetId, reason, details: details.trim() || null });
      }}
    >
      <Select label="What is wrong?" value={reason} onChange={(v) => setReason(v as ReportReason | undefined)} options={REPORT_REASONS.map((r) => ({ value: r.value, label: r.label }))} allLabel="Choose a reason" />
      <TextArea label="Details (optional)" rows={4} value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} hint="What happened, and where? Don't include card numbers or passwords." />
      <FormError>{create.error?.message}</FormError>
      <div className="row">
        <Button type="submit" disabled={!reason} loading={create.isPending}>
          Send report
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
