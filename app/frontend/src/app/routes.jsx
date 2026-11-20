// Route table: the single place that says which screens exist, who may open them and where they appear in the menu.
// To add a screen: create it under features/, then add one entry here. Nothing else needs to change.
import Dashboard from '../features/dashboard/Dashboard.jsx';
import StudentDetails from '../features/students/StudentDetails.jsx';
import Vacancies from '../features/vacancies/Vacancies.jsx';
import DocumentVerification from '../features/documents/DocumentVerification.jsx';
import TcRequests from '../features/tc/TcRequests.jsx';
import ListRequests from '../features/listRequests/ListRequests.jsx';
import ImportData from '../features/imports/ImportData.jsx';
import Logs from '../features/logs/Logs.jsx';
import Users from '../features/users/Users.jsx';

const everyone = () => true, admin = u => u.role === 'SUPER_ADMIN';

export const ROUTES = [
  { key: 'dash', label: 'Dashboard', icon: 'grid', section: 'Workspace', can: everyone, render: (user, go) => <Dashboard user={user} go={go} /> },
  { key: 'students', label: 'Student Details', icon: 'users', section: 'Workspace', can: everyone, render: user => <StudentDetails user={user} /> },
  { key: 'seats', label: 'Vacancy Management', icon: 'seat', section: 'Admission process', can: u => u.role !== 'DISTRICT', render: user => <Vacancies user={user} /> },
  { key: 'docs', label: 'Document Verification', icon: 'doc', section: 'Admission process', can: u => admin(u) || u.role === 'DISTRICT', render: user => <DocumentVerification user={user} /> },
  { key: 'tc', label: 'TC Requests', icon: 'list', section: 'Admission process', can: everyone, render: user => <TcRequests user={user} /> },
  { key: 'listreq', label: 'List Requests', icon: 'clock', section: 'Admission process', can: admin, render: () => <ListRequests /> },
  { key: 'import', label: 'Import Data & Lists', icon: 'up', section: 'Admission process', can: admin, render: user => <ImportData user={user} /> },
  { key: 'logs', label: 'Change History', icon: 'log', section: 'Administration', can: admin, render: () => <Logs /> },
  { key: 'users', label: 'Users & Access', icon: 'lock', section: 'Administration', can: admin, render: user => <Users me={user} /> },
];

export const visibleRoutes = user => ROUTES.filter(r => r.can(user));
