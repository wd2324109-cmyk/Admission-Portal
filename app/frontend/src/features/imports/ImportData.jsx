import { useState } from 'react';
import { PageHeader, ClassTabs } from '../../components/ui/index.js';
import Uploader from './Uploader.jsx';
import ListPanel from './ListPanel.jsx';

const STUDENT_COLUMNS = 'district, block, Udise, school_type, Schoolname, Emis, Name, Dob, Gender, community, medium, Disability_status, Disability_desc, Father_name, Mother_name, Phone, address, pincode, mark1-quertly, mark2-half, Total-highest of two, pass, nmss, Trust (Trust is the last column). The status columns are filled by the portal: select_status gets the status code and admit_status its description. Emis is a whole number up to 2,147,483,647.';
const VACANCY_COLUMNS = 'New_district, New_udise_type, New_udise_code, New_school_name, Group_code, Group_desc, gender, medium, community (GT-PWD, GT, BC, BCM, MBC, SC, SCA, ST), vacancies, admitted. One sheet row becomes one seat row per vacancy.';

// Import: <n>th_master_sheet and <n>th_vacancy_sheet, plus the State Enrollment Team's rank / list buttons.
export default function ImportData({ user }) {
  const [cls, setCls] = useState(9), admin = user.role === 'SUPER_ADMIN', th = `${cls}th`;
  return <>
    <PageHeader title={admin ? 'Import Data & Lists' : 'Furnish Vacancies'} />
    <div className="filters"><ClassTabs user={user} all cls={cls} onChange={setCls} /></div>
    <div className="grid grid--two grid--top">
      {admin && <Uploader key={'s' + cls} title={`${th}_master_sheet`} cls={cls} path="/import/students" canReplace columns={STUDENT_COLUMNS}
        hint="A new sheet is ADDED after the students already imported: an Emis that exists is skipped, nobody is changed or removed. Students that arrive with a select_status form the next List n." />}
      <Uploader key={'v' + cls} title={admin ? `${th}_vacancy_sheet` : `Your district ${th}_vacancy_sheet`} cls={cls} path="/import/vacancies" modes columns={VACANCY_COLUMNS}
        hint="Upload the vacancy sheet for this class. Choose whether it replaces the class's vacancies or adds seats for a later round." />
      {admin && <ListPanel cls={cls} />}
    </div>
  </>;
}
