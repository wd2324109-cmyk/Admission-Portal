import assert from 'node:assert';
process.env.NODE_ENV = 'test';
const { resolveRole, districtsFrom, decodeToken, profileFrom } = await import('./msms.js');

assert.equal(resolveRole({ userRole: 'PMU', districtId: null }), null);
assert.equal(resolveRole({ userRole: 'PMU', staffType: 'PMU', districtId: 4 }), null);
assert.equal(resolveRole({ userRole: 'RC', districtId: 4 }), 'REGION');
assert.equal(resolveRole({ userRole: 'rc' }), 'REGION');
assert.equal(resolveRole({ userRole: 'State co-ordinator' }), 'STATE');
assert.equal(resolveRole({ userRole: 'State-leads' }), 'STATE');
assert.equal(resolveRole({ userRole: 'HM', districtId: 12 }), 'DISTRICT');
assert.equal(resolveRole({ userRole: 'HM', districtId: null }), null);
assert.equal(resolveRole({ userRole: 'DMS', districtId: 12 }), null);
assert.equal(resolveRole({ userRole: 'XYZ' }), null);
assert.equal(resolveRole({ userRole: 'PMU', designation: 'State Lead - Enrollment' }), 'SUPER_ADMIN');
assert.equal(resolveRole({ userRole: 'RC', designation: 'state lead - enrollment', districtId: 3 }), 'SUPER_ADMIN');
assert.equal(resolveRole({ userRole: 'PMU', designation: 'Program Associate' }), null);
await assert.rejects(profileFrom({ userRole: 'XYZ' }), error => error.message === 'Invalid Credentials' && error.status === 403);

assert.deepEqual(districtsFrom({ data: [{ districtId: 5, districtName: 'Salem ' }, { districtId: 5, districtName: 'Salem' }, { districtId: 6, districtName: 'Erode' }] }),
  [{ id: '5', name: 'SALEM' }, { id: '6', name: 'ERODE' }]);
assert.deepEqual(districtsFrom([{ id: 7, name: 'Namakkal' }]), [{ id: '7', name: 'NAMAKKAL' }]);
assert.deepEqual(districtsFrom({ message: 'ok', result: { schools: [{ schoolName: 'A', district_id: 9, district: 'Karur' }] } }), [{ id: '9', name: 'KARUR' }]);
assert.deepEqual(districtsFrom(null), []);

const body = Buffer.from(JSON.stringify({ userData: { userName: '8682872464', userRole: 'PMU', regionCode: '0001' } })).toString('base64url');
assert.equal(decodeToken(`x.${body}.y`).userRole, 'PMU');
assert.equal(decodeToken('garbage'), null);
console.log('MSMS role and region parsing OK');
