import { Badge } from '../../components/ui/index.js';
import { CODE, GROUP_CLASS, GROUP_CLASS_TONE } from '../../lib/status.js';

// Waiting (new list) is shown in white. A reconsideration request has an empty select status, so the student keeps showing as Not Willing until it is decided.
const WAITING = ['1A'];

export default function StatusBadge({ r }) {
  const label = r.statusCode ? CODE[r.statusCode] || r.statusCode : r.group === 'notwilling' ? CODE['6A'] : r.admitStatus || 'Not listed';
  const tone = WAITING.includes(r.statusCode) ? 'outline' : r.statusCode === '7A' ? 'warn' : GROUP_CLASS_TONE[GROUP_CLASS[r.group]] || 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}
