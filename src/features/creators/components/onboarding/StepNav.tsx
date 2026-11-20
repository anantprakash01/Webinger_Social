import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { Button } from '@/components/ui';

/** Back / Continue row at the bottom of a wizard step. */
export function StepNav({ back, next, nextLabel = 'Continue', nextDisabled, nextHint }: { back?: () => void; next?: () => void; nextLabel?: string; nextDisabled?: boolean; nextHint?: string }) {
  return (
    <div className="stepnav">
      {back ? (
        <Button variant="ghost" onClick={back}>
          <LuChevronLeft aria-hidden /> Back
        </Button>
      ) : (
        <span />
      )}
      <div className="stepnav__next">
        {nextHint && <span className="small muted">{nextHint}</span>}
        {next && (
          <Button onClick={next} disabled={nextDisabled}>
            {nextLabel} <LuChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
