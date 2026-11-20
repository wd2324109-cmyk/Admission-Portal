import { Badge } from '../../components/ui/index.js';
import { CODE, GROUP_CLASS, GROUP_CLASS_TONE } from '../../lib/status.js';

export default function StatusBadge({ r }) {
  const label = r.statusCode ? CODE[r.statusCode] || r.statusCode : r.admitStatus || 'Not listed';
  return <Badge tone={r.statusCode === '7A' ? 'warn' : GROUP_CLASS_TONE[GROUP_CLASS[r.group]] || 'neutral'}>{label}</Badge>;
}
