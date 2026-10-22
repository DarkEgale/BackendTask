/**
 * Live smoke test against the running backend on port 5000.
 * Prints status codes + response shapes only (never passwords/tokens).
 */
const BASE = 'http://localhost:5000/api';

let pass = 0;
let fail = 0;

function ok(label, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}${extra ? ' :: ' + extra : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${extra ? ' :: ' + extra : ''}`);
  }
}

function shape(obj, depth = 0) {
  if (obj === null || obj === undefined) return String(obj);
  if (Array.isArray(obj)) {
    if (!obj.length) return '[]';
    return `[${shape(obj[0], depth + 1)}]`;
  }
  if (typeof obj === 'object') {
    if (depth > 2) return '{...}';
    return `{ ${Object.keys(obj).join(', ')} }`;
  }
  return typeof obj;
}

/** Minimal cookie jar so we can talk to the session-protected endpoints. */
class Jar {
  constructor() { this.cookies = new Map(); }
  store(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function call(jar, method, path, body) {
  const headers = { Origin: 'http://localhost:5173' };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar.store(res);

  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}


const stamp = Date.now();
const USER_EMAIL = `smoke_user_${stamp}@test.com`;
const USER_PASS = 'SmokeTest@123';
const ADMIN_EMAIL = `smoke_admin_${stamp}@test.com`;
const ADMIN_PASS = 'SmokeTest@123';

(async () => {
  const jar = new Jar();
  const adminJar = new Jar();

  console.log('\n=== 1. AUTH ===');
  const reg = await call(jar, 'POST', '/auth/register', {
    name: 'Smoke User', email: USER_EMAIL, password: USER_PASS,
  });
  console.log(`  register -> ${reg.status} ${shape(reg.body)}`);
  ok('register returns 201', reg.status === 201, `got ${reg.status}`);
  ok('register returns success:true', reg.body?.success === true);
  ok('register returns user', Boolean(reg.body?.user?._id), shape(reg.body?.user));
  ok('register returns ssid', typeof reg.body?.ssid === 'string' && reg.body.ssid.length > 0);
  ok('user has role', reg.body?.user?.role === 'user', `role=${reg.body?.user?.role}`);
  ok('no password leaked', reg.body?.user?.password === undefined);
  ok('accessToken cookie set', jar.cookies.has('accessToken'));
  ok('refreshToken cookie set', jar.cookies.has('refreshToken'));
  const userId = reg.body?.user?._id;

  const dup = await call(new Jar(), 'POST', '/auth/register', {
    name: 'Dupe', email: USER_EMAIL, password: USER_PASS,
  });
  console.log(`  duplicate register -> ${dup.status} ${JSON.stringify(dup.body)}`);
  ok('duplicate email -> 409', dup.status === 409, `got ${dup.status}`);

  const badLogin = await call(new Jar(), 'POST', '/auth/login', {
    email: USER_EMAIL, password: 'WrongPassword1',
  });
  console.log(`  wrong password login -> ${badLogin.status} ${JSON.stringify(badLogin.body)}`);
  ok('wrong password -> 401', badLogin.status === 401, `got ${badLogin.status}`);

  const login = await call(jar, 'POST', '/auth/login', { email: USER_EMAIL, password: USER_PASS });
  console.log(`  login -> ${login.status} ${shape(login.body)}`);
  ok('login returns 200', login.status === 200, `got ${login.status}`);
  ok('login returns ssid', typeof login.body?.ssid === 'string');
  ok('login returns user', Boolean(login.body?.user?._id));

  console.log('\n=== 2. AUTHORIZATION ===');
  const noAuth = await call(new Jar(), 'GET', '/notes');
  console.log(`  notes without token -> ${noAuth.status} ${JSON.stringify(noAuth.body)}`);
  ok('unauthenticated -> 401', noAuth.status === 401, `got ${noAuth.status}`);

  const usersAsUser = await call(jar, 'GET', '/users?page=1&limit=10');
  console.log(`  /users as normal user -> ${usersAsUser.status} ${JSON.stringify(usersAsUser.body)}`);
  ok('GET /users as user -> 403', usersAsUser.status === 403, `got ${usersAsUser.status}`);

  const adminReg = await call(adminJar, 'POST', '/auth/register', {
    name: 'Smoke Admin', email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  ok('admin register -> 201', adminReg.status === 201, `got ${adminReg.status}`);
  const adminId = adminReg.body?.user?._id;
  ok('new user role is user (not admin)', adminReg.body?.user?.role === 'user');

  console.log('\n=== 3. NOTES ===');
  const create = await call(jar, 'POST', '/notes', { title: 'Smoke Note', notes: 'Smoke content' });
  console.log(`  create note -> ${create.status} ${shape(create.body)}`);
  ok('create note -> 201', create.status === 201, `got ${create.status}`);
  ok('create note returns note', Boolean(create.body?.note?._id));
  ok('note has userId', Boolean(create.body?.note?.userId));
  const noteId = create.body?.note?._id;

  const listNotes = await call(jar, 'GET', '/notes?page=1&limit=10');
  console.log(`  list notes -> ${listNotes.status} ${shape(listNotes.body)}`);
  ok('list notes -> 200', listNotes.status === 200);
  ok('list notes has notes array', Array.isArray(listNotes.body?.notes));
  ok('list notes has pagination', Boolean(listNotes.body?.pagination), JSON.stringify(listNotes.body?.pagination));
  ok('pagination has totalItems', typeof listNotes.body?.pagination?.totalItems === 'number');
  ok('pagination has totalPages', typeof listNotes.body?.pagination?.totalPages === 'number');
  ok('pagination has currentPage', typeof listNotes.body?.pagination?.currentPage === 'number');
  ok('pagination has itemsPerPage', typeof listNotes.body?.pagination?.itemsPerPage === 'number');
  const firstNote = listNotes.body?.notes?.[0];
  console.log(`  note shape: ${shape(firstNote)}`);
  ok('note exposes title', typeof firstNote?.title === 'string');
  ok('note exposes notes', typeof firstNote?.notes === 'string');
  ok('note exposes status', typeof firstNote?.status === 'string', `status=${firstNote?.status}`);
  ok('note exposes user{name,email}', Boolean(firstNote?.user?.name && firstNote?.user?.email), shape(firstNote?.user));

  const getNote = await call(jar, 'GET', `/notes/${noteId}`);
  console.log(`  get note -> ${getNote.status} ${shape(getNote.body)}`);
  ok('get note -> 200', getNote.status === 200, `got ${getNote.status}`);
  ok('get note returns note', Boolean(getNote.body?.note?._id));

  const upd = await call(jar, 'PUT', `/notes/${noteId}`, { title: 'Smoke Note v2', notes: 'Updated content', status: 'archived' });
  console.log(`  update note -> ${upd.status} ${shape(upd.body)}`);
  ok('update note -> 200', upd.status === 200, `got ${upd.status}`);
  ok('update applied title', upd.body?.note?.title === 'Smoke Note v2', `title=${upd.body?.note?.title}`);
  ok('update applied status', upd.body?.note?.status === 'archived', `status=${upd.body?.note?.status}`);

  const badStatus = await call(jar, 'PUT', `/notes/${noteId}`, { status: 'bogus' });
  console.log(`  update note bad status -> ${badStatus.status} ${JSON.stringify(badStatus.body)}`);
  ok('invalid status -> 400', badStatus.status === 400, `got ${badStatus.status}`);



  console.log('\n=== 4. INTERESTS ===');
  const catalog = await call(new Jar(), 'GET', '/interests?page=1&limit=20');
  console.log(`  interests catalog -> ${catalog.status} ${shape(catalog.body)}`);
  ok('interests catalog public -> 200', catalog.status === 200, `got ${catalog.status}`);
  ok('interests has array', Array.isArray(catalog.body?.interests));
  ok('interests has pagination', Boolean(catalog.body?.pagination));
  ok('interest has name', typeof catalog.body?.interests?.[0]?.name === 'string', `name=${catalog.body?.interests?.[0]?.name}`);

  const addInt = await call(jar, 'POST', '/users/me/interests', { name: 'Smoke Interest' });
  console.log(`  add interest -> ${addInt.status} ${shape(addInt.body)}`);
  ok('add interest -> 201', addInt.status === 201, `got ${addInt.status}`);
  ok('add interest returns interest', Boolean(addInt.body?.interest?._id));
  const interestId = addInt.body?.interest?._id;

  const myInterests = await call(jar, 'GET', '/users/me/interests');
  console.log(`  my interests -> ${myInterests.status} ${shape(myInterests.body)}`);
  ok('my interests -> 200', myInterests.status === 200, `got ${myInterests.status}`);
  ok('my interests has array', Array.isArray(myInterests.body?.interests));
  ok('my interest has name', typeof myInterests.body?.interests?.[0]?.name === 'string', `name=${myInterests.body?.interests?.[0]?.name}`);

  const dupInt = await call(jar, 'POST', '/users/me/interests', { name: 'Smoke Interest' });
  console.log(`  duplicate interest -> ${dupInt.status} ${JSON.stringify(dupInt.body)}`);
  ok('duplicate interest -> 409', dupInt.status === 409, `got ${dupInt.status}`);

  const grouped = await call(jar, 'GET', '/users/grouped/interest?page=1&limit=10');
  console.log(`  grouped by interest -> ${grouped.status} ${shape(grouped.body)}`);
  ok('grouped -> 200', grouped.status === 200, `got ${grouped.status}`);
  ok('grouped has count', typeof grouped.body?.count === 'number', `count=${grouped.body?.count}`);
  ok('grouped has users array', Array.isArray(grouped.body?.users));
  const group = grouped.body?.users?.find((g) => g.interest === interestId) || grouped.body?.users?.[0];
  console.log(`  group shape: ${shape(group)}`);
  ok('group has interest id', typeof group?.interest === 'string');
  ok('group has readable name', typeof group?.name === 'string' && group.name.length > 0, `name=${group?.name}`);
  ok('group has users array', Array.isArray(group?.users));

  const delInt = await call(jar, 'DELETE', `/users/me/interests/${interestId}`);
  console.log(`  remove interest -> ${delInt.status} ${shape(delInt.body)}`);
  ok('remove interest -> 200', delInt.status === 200, `got ${delInt.status}`);
  ok('remove interest returns user', Boolean(delInt.body?.user));

  console.log('\n=== 5. USER POSTS ===');
  const posts = await call(jar, 'GET', `/users/${userId}/posts?page=1&limit=10`);
  console.log(`  user posts -> ${posts.status} ${shape(posts.body)}`);
  ok('user posts -> 200', posts.status === 200, `got ${posts.status}`);
  ok('user posts has count', typeof posts.body?.count === 'number', `count=${posts.body?.count}`);
  ok('user posts has posts array', Array.isArray(posts.body?.posts));

  const otherPosts = await call(jar, 'GET', `/users/${'0'.repeat(24)}/posts`);
  console.log(`  other user posts -> ${otherPosts.status} ${JSON.stringify(otherPosts.body)}`);
  ok('other user posts -> 403', otherPosts.status === 403, `got ${otherPosts.status}`);

  console.log('\n=== 6. PROFILE / PASSWORD ===');
  const wrongPw = await call(jar, 'PUT', '/users/password', { oldPassword: 'NopeWrong123', newPassword: 'AnotherPass123' });
  console.log(`  change password wrong old -> ${wrongPw.status} ${JSON.stringify(wrongPw.body)}`);
  ok('wrong old password -> 401', wrongPw.status === 401, `got ${wrongPw.status}`);

  const shortPw = await call(jar, 'PUT', '/users/password', { oldPassword: USER_PASS, newPassword: 'abc' });
  console.log(`  change password too short -> ${shortPw.status} ${JSON.stringify(shortPw.body)}`);
  ok('short new password -> 400', shortPw.status === 400, `got ${shortPw.status}`);

  const newPass = 'NewSmokePass@456';
  const chPw = await call(jar, 'PUT', '/users/password', { oldPassword: USER_PASS, newPassword: newPass });
  console.log(`  change password -> ${chPw.status} ${shape(chPw.body)}`);
  ok('change password -> 200', chPw.status === 200, `got ${chPw.status}`);
  ok('change password returns message', typeof chPw.body?.message === 'string', chPw.body?.message);
  ok('change password returns user', Boolean(chPw.body?.user?._id));

  const relogin = await call(new Jar(), 'POST', '/auth/login', { email: USER_EMAIL, password: newPass });
  console.log(`  login with new password -> ${relogin.status}`);
  ok('login with new password -> 200', relogin.status === 200, `got ${relogin.status}`);
  const oldLogin = await call(new Jar(), 'POST', '/auth/login', { email: USER_EMAIL, password: USER_PASS });
  ok('old password rejected -> 401', oldLogin.status === 401, `got ${oldLogin.status}`);

  console.log('\n=== 7. NOTES DELETE ===');
  const del = await call(jar, 'DELETE', `/notes/${noteId}`);
  console.log(`  delete note -> ${del.status} ${JSON.stringify(del.body)}`);
  ok('delete note -> 200', del.status === 200, `got ${del.status}`);
  const gone = await call(jar, 'GET', `/notes/${noteId}`);
  ok('deleted note -> 404', gone.status === 404, `got ${gone.status}`);

  console.log('\n=== 8. SESSION REFRESH ===');
  const refreshed = await call(jar, 'POST', '/auth/refresh-session', {});
  console.log(`  refresh-session -> ${refreshed.status} ${shape(refreshed.body)}`);
  ok('refresh-session -> 200', refreshed.status === 200, `got ${refreshed.status}`);
  ok('refresh-session returns ssid', typeof refreshed.body?.ssid === 'string');
  const afterRefresh = await call(jar, 'GET', '/notes?page=1&limit=5');
  ok('auth still works after refresh', afterRefresh.status === 200, `got ${afterRefresh.status}`);

  console.log('\n=== 9. ERROR SHAPES ===');
  const notFound = await call(jar, 'GET', '/definitely-not-a-route');
  console.log(`  unknown route -> ${notFound.status} ${JSON.stringify(notFound.body)}`);
  ok('unknown route -> 404 JSON', notFound.status === 404 && notFound.body?.success === false);
  const badId = await call(jar, 'GET', '/notes/not-an-id');
  console.log(`  bad ObjectId -> ${badId.status} ${JSON.stringify(badId.body)}`);
  ok('bad ObjectId -> 400', badId.status === 400, `got ${badId.status}`);
  ok('errors carry message', typeof badId.body?.message === 'string');

  console.log('\n=== 10. ADMIN SURFACE (needs admin role) ===');
  console.log(`  admin user id: ${adminId}`);
  console.log(`  emails used: ${USER_EMAIL} / ${ADMIN_EMAIL}`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('SMOKE TEST CRASHED:', err);
  process.exit(2);
});

