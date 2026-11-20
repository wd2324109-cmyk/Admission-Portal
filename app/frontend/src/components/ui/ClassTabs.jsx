import Segmented from './Segmented.jsx';
import { classesFor } from '../../lib/status.js';

export default function ClassTabs({ user, cls, onChange, all = false }) {
  const list = all ? [9, 10] : classesFor(user);
  return <Segmented label="Class" items={list.map(c => [c, `Class ${c}`])} value={cls} onChange={onChange} />;
}
