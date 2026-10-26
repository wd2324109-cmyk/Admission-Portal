import { COMMUNITY_ORDER } from './services/domain/selection.js';

export const REGIONS = {
  CUDDALORE: ['CUDDALORE', 'NAGAPATTINAM', 'THANJAVUR'],
  ERODE: ['ERODE', 'SALEM', 'NAMAKKAL'],
  TIRUNELVELI: ['TIRUNELVELI', 'THOOTHUKUDI', 'TENKASI'],
};
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a, w) => { if (!w) return a[Math.floor(rnd() * a.length)]; let r = rnd() * w.reduce((x, y) => x + y), i = 0; while ((r -= w[i]) > 0) i++; return a[i]; };
const NAMES = ['Arun','Kavin','Mohan','Vijay','Surya','Karthik','Priya','Divya','Nandhini','Meena','Lakshmi','Harini','Ravi','Gokul','Sneha','Anitha'];
const SURN = ['K','S','M','R','P','V','T','N'];

export function buildSample(perClass = 1200) {
  const sts = [], vacs = []; let regno = 7000000;
  for (const [rc, dists] of Object.entries(REGIONS)) for (const cl of [9, 10]) {
    for (let i = 0; i < perClass / 3; i++) {
      const district = pick(dists), total = 500 - Math.floor(rnd() * rnd() * 330);
      sts.push({ regno: ++regno, emisNo: String(2016000000 + regno), name: `${pick(NAMES)} ${pick(SURN)}`,
        dob: `${10 + Math.floor(rnd() * 18)}-0${1 + Math.floor(rnd() * 9)}-${cl === 9 ? 2011 : 2010}`,
        gender: pick(['Boy', 'Girl']), classLevel: cl, district, regionalCentre: rc,
        schoolName: `GOVT HSS ${district}`, community: pick(['BC','BCM','MBC','SC','SCA','ST','OC'], [25,5,30,28,8,3,1]),
        medium: pick(['Tamil', 'English'], [80, 20]), disability: rnd() < 0.07, total,
        orank: 1000 + Math.floor(rnd() * 90000), phone: '9' + String(Math.floor(rnd() * 1e9)).padStart(9, '0') });
    }
    for (const gender of ['Boy', 'Girl']) for (const medium of ['Tamil', 'English'])
      for (const community of COMMUNITY_ORDER)
        vacs.push({ regionalCentre: rc, classLevel: cl, gender, medium, community,
          vacancies: medium === 'English' ? (community === 'GT' ? 2 : 1) : (community === 'GT' ? 3 : ['BC','MBC','SC'].includes(community) ? 2 : 1) });
  }
  return { sts, vacs };
}

