import dotenv from "dotenv";
dotenv.config();

const BASE = "http://localhost:5000/api";
let pass = 0, fail = 0;

const check = (name, cond, extra = "") => {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const req = async (method, path, { body, cookie, bearer } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (cookie) headers.Cookie = cookie;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const res = await fetch(`${BASE}${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch { }
    return {
        status: res.status,
        json,
        setCookie: res.headers.getSetCookie ? res.headers.getSetCookie() : []
    };
};

const cookieOf = (setCookies, name) => {
    const c = setCookies.find(x => x.startsWith(name + "="));
    return c ? c.split(";")[0] : null;
};

const stamp = Date.now();
const userA = { name: "User A", email: `usera_${stamp}@test.com`, password: "secret123" };
const userB = { name: "User B", email: `userb_${stamp}@test.com`, password: "secret123" };
const admin = { name: "Admin", email: `admin_${stamp}@test.com`, password: "secret123" };

const run = async () => {
    console.log("\n=== 1. REGISTRATION (Mongoose 9 hook fix) ===");
    const r1 = await req("POST", "/auth/register", { body: userA });
    check("register returns 201", r1.status === 201, `got ${r1.status} ${JSON.stringify(r1.json)}`);
    check("register succeeds", r1.json?.success === true, JSON.stringify(r1.json));
    check("no password hash in response", r1.json?.user && r1.json.user.password === undefined, `password=${r1.json?.user?.password}`);
    const cookieA = cookieOf(r1.setCookie, "accessToken");
    check("accessToken cookie set", !!cookieA);
    check("refreshToken cookie set", !!cookieOf(r1.setCookie, "refreshToken"));
    const userAId = r1.json?.user?._id;

    console.log("\n=== 2. DUPLICATE EMAIL -> 409 ===");
    const r2 = await req("POST", "/auth/register", { body: userA });
    check("duplicate email returns 409", r2.status === 409, `got ${r2.status} ${JSON.stringify(r2.json)}`);
    check("409 is JSON not HTML", r2.json?.success === false, JSON.stringify(r2.json));

    console.log("\n=== 3. VALIDATION ERRORS -> 400 ===");
    const r3 = await req("POST", "/auth/register", { body: { name: "X", email: "bad", password: "123" } });
    check("invalid email returns 400", r3.status === 400, `got ${r3.status} ${JSON.stringify(r3.json)}`);

    console.log("\n=== 4. LOGIN ===");
    const r4 = await req("POST", "/auth/login", { body: { email: userA.email, password: userA.password } });
    check("login returns 200", r4.status === 200, `got ${r4.status} ${JSON.stringify(r4.json)}`);
    check("no password hash on login", r4.json?.user?.password === undefined);
    const cookieA2 = cookieOf(r4.setCookie, "accessToken");
    check("login sets accessToken cookie", !!cookieA2);

    const r4b = await req("POST", "/auth/login", { body: { email: userA.email, password: "wrongpass" } });
    check("wrong password returns 401", r4b.status === 401, `got ${r4b.status}`);

    console.log("\n=== 5. AUTH: COOKIE vs BEARER ===");
    const r5c = await req("GET", "/notes", { cookie: cookieA2 });
    check("cookie auth works", r5c.status === 200, `got ${r5c.status} ${JSON.stringify(r5c.json)}`);
    const r5h = await req("GET", "/notes", { bearer: cookieA2.split("=")[1] });
    check("bearer auth works", r5h.status === 200, `got ${r5h.status}`);
    const r5n = await req("GET", "/notes");
    check("no token returns 401", r5n.status === 401, `got ${r5n.status}`);
    const r5bad = await req("GET", "/notes", { bearer: "not.a.token" });
    check("invalid token returns 401", r5bad.status === 401, `got ${r5bad.status}`);

    console.log("\n=== 6. NOTES CRUD + OWNERSHIP ===");
    const r6 = await req("POST", "/notes", { cookie: cookieA2, body: { title: "T1", notes: "N1" } });
    check("create note returns 201", r6.status === 201, `got ${r6.status} ${JSON.stringify(r6.json)}`);
    const noteId = r6.json?.note?._id;

    const rB = await req("POST", "/auth/register", { body: userB });
    const cookieB = cookieOf(rB.setCookie, "accessToken");
    const userBId = rB.json?.user?._id;
    check("second user registered", rB.status === 201);

    const r7 = await req("GET", `/notes/${noteId}`, { cookie: cookieB });
    check("other user cannot read note (404, no existence leak)", r7.status === 404, `got ${r7.status}`);
    const r8 = await req("PUT", `/notes/${noteId}`, { cookie: cookieB, body: { title: "hacked" } });
    check("other user cannot update note (404)", r8.status === 404, `got ${r8.status}`);
    const r9 = await req("DELETE", `/notes/${noteId}`, { cookie: cookieB });
    check("other user cannot delete note (404)", r9.status === 404, `got ${r9.status}`);
    const r10 = await req("GET", `/notes/${noteId}`, { cookie: cookieA2 });
    check("owner can read note", r10.status === 200, `got ${r10.status}`);
    const r11 = await req("PUT", `/notes/${noteId}`, { cookie: cookieA2, body: { title: "T1-updated" } });
    check("owner can update note (returns updated doc)", r11.json?.note?.title === "T1-updated", JSON.stringify(r11.json));
    const r12 = await req("GET", "/notes", { cookie: cookieB });
    check("user B sees 0 notes", r12.json?.notes?.length === 0, JSON.stringify(r12.json?.pagination));

    console.log("\n=== 7. INVALID OBJECTID -> 400 ===");
    const r13 = await req("GET", "/notes/not-an-objectid", { cookie: cookieA2 });
    check("invalid note id returns 400", r13.status === 400, `got ${r13.status} ${JSON.stringify(r13.json)}`);

    console.log("\n=== 8. ADMIN AUTHORIZATION ===");
    const r14 = await req("POST", "/auth/register", { body: admin });
    const adminId = r14.json?.user?._id;
    const cookieAdmin = cookieOf(r14.setCookie, "accessToken");
    const { default: mongoose } = await import("mongoose");
    await mongoose.connect(process.env.MONGODB_URI);
    const { default: Users } = await import("../models/user.model.js");
    await Users.updateOne({ _id: adminId }, { $set: { role: "admin" } });
    await mongoose.disconnect();

    const r15 = await req("GET", "/users", { cookie: cookieA2 });
    check("non-admin cannot list users (403)", r15.status === 403, `got ${r15.status} ${JSON.stringify(r15.json)}`);
    const r16 = await req("GET", "/users", { cookie: cookieAdmin });
    check("admin can list users (200)", r16.status === 200, `got ${r16.status} ${JSON.stringify(r16.json)}`);
    check("no password hash in user list", r16.json?.users?.every(u => u.password === undefined));
    const r17 = await req("GET", `/users/${userAId}`, { cookie: cookieAdmin });
    check("admin can get single user", r17.status === 200, `got ${r17.status}`);
    check("single user has no password hash", r17.json?.user?.password === undefined);
    const r18 = await req("GET", `/users/${userBId}`, { cookie: cookieA2 });
    check("non-admin cannot get other user (403)", r18.status === 403, `got ${r18.status}`);

    console.log("\n=== 9. PASSWORD UPDATE ===");
    const r20 = await req("PUT", "/users/password", {
        cookie: cookieA2, body: { oldPassword: userA.password, newPassword: "newsecret123" }
    });
    check("password update returns 200", r20.status === 200, `got ${r20.status} ${JSON.stringify(r20.json)}`);
    check("no password hash after update", r20.json?.user?.password === undefined);
    const r21 = await req("POST", "/auth/login", { body: { email: userA.email, password: "newsecret123" } });
    check("login with new password works", r21.status === 200, `got ${r21.status}`);
    const r22 = await req("POST", "/auth/login", { body: { email: userA.email, password: userA.password } });
    check("login with old password fails", r22.status === 401, `got ${r22.status}`);
    const r23 = await req("PUT", "/users/password", {
        cookie: cookieA2, body: { oldPassword: "wrong", newPassword: "another123" }
    });
    check("wrong old password returns 401", r23.status === 401, `got ${r23.status}`);

    console.log("\n=== 10. REFRESH TOKEN ROTATION ===");
    const r24 = await req("POST", "/auth/refresh-session", { cookie: cookieOf(r21.setCookie, "refreshToken") });
    check("refresh-session returns 200", r24.status === 200, `got ${r24.status} ${JSON.stringify(r24.json)}`);
    check("refresh sets new accessToken cookie", !!cookieOf(r24.setCookie, "accessToken"));

    console.log("\n=== 11. REVOKE + SESSION INVALIDATION ===");
    // cookieA2 belongs to the login in r4, so revoke that session's ssid
    const r25 = await req("POST", "/auth/revoke", { cookie: cookieA2, body: { ssid: r4.json?.ssid } });
    check("revoke returns 200", r25.status === 200, `got ${r25.status} ${JSON.stringify(r25.json)}`);
    const r26 = await req("GET", "/notes", { cookie: cookieA2 });
    check("revoked session rejected (401)", r26.status === 401, `got ${r26.status}`);

    console.log("\n=== 12. CROSS-USER REVOKE BLOCKED ===");
    const r27 = await req("POST", "/auth/login", { body: { email: userB.email, password: userB.password } });
    const cookieB2 = cookieOf(r27.setCookie, "accessToken");
    const r28 = await req("POST", "/auth/revoke", { cookie: cookieB2, body: { ssid: r21.json?.ssid } });
    check("cannot revoke another user's session (403)", r28.status === 403, `got ${r28.status} ${JSON.stringify(r28.json)}`);

    console.log("\n=== 13. POSTS OWNERSHIP ===");
    const r29 = await req("GET", `/users/${userAId}/posts`, { cookie: cookieB2 });
    check("cannot read other user's posts (403)", r29.status === 403, `got ${r29.status} ${JSON.stringify(r29.json)}`);
    const r30 = await req("GET", `/users/${userBId}/posts`, { cookie: cookieB2 });
    check("can read own posts", r30.status === 200, `got ${r30.status}`);

    console.log("\n=== 14. 404 HANDLER ===");
    const r31 = await req("GET", "/nonexistent-route", { cookie: cookieA2 });
    check("unknown route returns JSON 404", r31.status === 404 && r31.json?.success === false, `got ${r31.status} ${JSON.stringify(r31.json)}`);

    console.log("\n=== 15. SESSION LIMIT (max 5 per user) ===");
    const sessUser = { name: "Sess", email: `sess_${stamp}@test.com`, password: "secret123" };
    const rS = await req("POST", "/auth/register", { body: sessUser });
    check("session-limit user registered", rS.status === 201, `got ${rS.status}`);
    const sessId = rS.json?.user?._id;

    // Create 7 sessions for the same user -> only the newest 5 should survive
    const cookies = [];
    for (let i = 0; i < 6; i++) {
        const rl = await req("POST", "/auth/login", { body: { email: sessUser.email, password: sessUser.password } });
        cookies.push(cookieOf(rl.setCookie, "accessToken"));
    }
    check("6 logins succeeded", cookies.every(Boolean));

    const { default: mongoose2 } = await import("mongoose");
    await mongoose2.connect(process.env.MONGODB_URI);
    const { default: Access } = await import("../models/access.model.js");
    const sessionCount = await Access.countDocuments({ userId: sessId });
    await mongoose2.disconnect();
    check("session count capped at 5", sessionCount === 5, `got ${sessionCount}`);

    const oldestAlive = await req("GET", "/notes", { cookie: cookies[0] });
    check("oldest session was evicted (401)", oldestAlive.status === 401, `got ${oldestAlive.status}`);
    const newestAlive = await req("GET", "/notes", { cookie: cookies[cookies.length - 1] });
    check("newest session still works (200)", newestAlive.status === 200, `got ${newestAlive.status}`);

    console.log("\n=== 16. INTERESTS: CATALOG + USER MANAGED ===");
    const iName = `Rock climbing ${stamp}`;

    // The catalog is public so a sign-up form can offer suggestions.
    const i1 = await req("GET", "/interests");
    check("interest catalog is public (200)", i1.status === 200, `got ${i1.status} ${JSON.stringify(i1.json)}`);
    check("catalog returns interests array", Array.isArray(i1.json?.interests), JSON.stringify(i1.json));
    check("catalog has pagination", !!i1.json?.pagination, JSON.stringify(i1.json));

    // A user adds a brand new interest of their own by name.
    const i2 = await req("POST", "/users/me/interests", { cookie: cookieB2, body: { name: iName } });
    check("add new interest by name returns 201", i2.status === 201, `got ${i2.status} ${JSON.stringify(i2.json)}`);
    check("new interest has a name", i2.json?.interest?.name === iName, JSON.stringify(i2.json?.interest));
    const newInterestId = i2.json?.interest?._id;
    check("new interest has an id", !!newInterestId);

    // The same name (different case/whitespace) must not create a duplicate.
    const i3 = await req("POST", "/users/me/interests", { cookie: cookieB2, body: { name: `  ${iName.toUpperCase()}  ` } });
    check("duplicate interest rejected (409)", i3.status === 409, `got ${i3.status} ${JSON.stringify(i3.json)}`);

    // Listing my own interests
    const i4 = await req("GET", "/users/me/interests", { cookie: cookieB2 });
    check("list my interests returns 200", i4.status === 200, `got ${i4.status} ${JSON.stringify(i4.json)}`);
    check("my interests contains the new one", i4.json?.interests?.some(x => x._id === newInterestId), JSON.stringify(i4.json));
    check("my interests include the name", i4.json?.interests?.some(x => x.name === iName), JSON.stringify(i4.json));

    // Unauthenticated access is rejected
    const i5 = await req("GET", "/users/me/interests");
    check("my interests requires auth (401)", i5.status === 401, `got ${i5.status}`);

    // Removing an interest
    const i6 = await req("DELETE", `/users/me/interests/${newInterestId}`, { cookie: cookieB2 });
    check("remove interest returns 200", i6.status === 200, `got ${i6.status} ${JSON.stringify(i6.json)}`);
    const i7 = await req("GET", "/users/me/interests", { cookie: cookieB2 });
    check("interest removed from profile", !i7.json?.interests?.some(x => x._id === newInterestId), JSON.stringify(i7.json));

    // Removing it again -> 404
    const i8 = await req("DELETE", `/users/me/interests/${newInterestId}`, { cookie: cookieB2 });
    check("removing a missing interest returns 404", i8.status === 404, `got ${i8.status}`);

    // A user cannot touch someone else's interests.
    // cookieA2 was revoked in test 11, so log in again to get a live session.
    const i9login = await req("POST", "/auth/login", { body: { email: userA.email, password: "newsecret123" } });
    const cookieA3 = cookieOf(i9login.setCookie, "accessToken");
    const i9 = await req("POST", "/users/me/interests", { cookie: cookieA3, body: { name: `Someone else ${stamp}` } });
    check("other user gets their own interest (not shared)", i9.status === 201, `got ${i9.status} ${JSON.stringify(i9.json)}`);
    const i10 = await req("GET", "/users/me/interests", { cookie: cookieB2 });
    check("interests are NOT shared between users", !i10.json?.interests?.some(x => x.name === `Someone else ${stamp}`), JSON.stringify(i10.json));

    // Registering with interest NAMES (not ids)
    const i11 = await req("POST", "/auth/register", {
        body: {
            name: "Interest Reg", email: `intreg_${stamp}@test.com`, password: "secret123",
            interests: [`${iName} variant`, "Reading"]
        }
    });
    check("register with interest names returns 201", i11.status === 201, `got ${i11.status} ${JSON.stringify(i11.json)}`);
    check("register response populates interest names", Array.isArray(i11.json?.user?.interests) && i11.json.user.interests[0]?.name, JSON.stringify(i11.json?.user?.interests));

    // Grouped-by-interest now carries the interest NAME
    const i12 = await req("GET", "/users/grouped/interest", { cookie: cookieB2 });
    check("grouped by interest returns 200", i12.status === 200, `got ${i12.status}`);
    check("grouped entries include a name field", i12.json?.users?.some(g => typeof g.name === "string"), JSON.stringify(i12.json));

    console.log("\n=== 17. INTERESTS: UPDATE (RENAME) ===");

    // An exclusive interest — only user B owns it.
    const upName = `Bouldering ${stamp}`;
    const u1 = await req("POST", "/users/me/interests", { cookie: cookieB2, body: { name: upName } });
    check("interest to rename created (201)", u1.status === 201, `got ${u1.status} ${JSON.stringify(u1.json)}`);
    const upId = u1.json?.interest?._id;

    // Rename my own interest
    const u2 = await req("PUT", `/users/me/interests/${upId}`, { cookie: cookieB2, body: { name: `  ${upName} renamed  ` } });
    check("rename own interest returns 200", u2.status === 200, `got ${u2.status} ${JSON.stringify(u2.json)}`);
    check("renamed interest keeps the new name", u2.json?.interest?.name === `${upName} renamed`, JSON.stringify(u2.json?.interest));
    const u3 = await req("GET", "/users/me/interests", { cookie: cookieB2 });
    check("profile shows the renamed interest", u3.json?.interests?.some(x => x.name === `${upName} renamed`), JSON.stringify(u3.json));

    // Missing name -> 400
    const u4 = await req("PUT", `/users/me/interests/${upId}`, { cookie: cookieB2, body: { name: "   " } });
    check("empty name rejected (400)", u4.status === 400, `got ${u4.status} ${JSON.stringify(u4.json)}`);

    // Name too long -> 400
    const u5 = await req("PUT", `/users/me/interests/${upId}`, { cookie: cookieB2, body: { name: "x".repeat(51) } });
    check("name over 50 chars rejected (400)", u5.status === 400, `got ${u5.status} ${JSON.stringify(u5.json)}`);

    // Renaming an interest that is not on my profile -> 404
    const u6 = await req("POST", "/users/me/interests", { cookie: cookieA3, body: { name: `A only ${stamp}` } });
    const aOnlyId = u6.json?.interest?._id;
    const u7 = await req("PUT", `/users/me/interests/${aOnlyId}`, { cookie: cookieB2, body: { name: `Nope ${stamp}` } });
    check("cannot rename an interest I do not own (404)", u7.status === 404, `got ${u7.status} ${JSON.stringify(u7.json)}`);

    // Unknown interest id -> 404
    const u8 = await req("PUT", "/users/me/interests/64b7f9c2e1a2b3c4d5e6f7a8", { cookie: cookieB2, body: { name: `Ghost ${stamp}` } });
    check("unknown interest id returns 404", u8.status === 404, `got ${u8.status} ${JSON.stringify(u8.json)}`);

    // Unauthenticated -> 401
    const u9 = await req("PUT", `/users/me/interests/${upId}`, { body: { name: `Nope ${stamp}` } });
    check("rename requires auth (401)", u9.status === 401, `got ${u9.status}`);

    // Duplicate name -> 409 (rename onto a name another interest already has)
    const u10 = await req("POST", "/users/me/interests", { cookie: cookieB2, body: { name: `Taken ${stamp}` } });
    const u11 = await req("PUT", `/users/me/interests/${upId}`, { cookie: cookieB2, body: { name: `Taken ${stamp}` } });
    check("rename onto an existing name rejected (409)", u11.status === 409, `got ${u11.status} ${JSON.stringify(u11.json)}`);

    // SHARED interest: both users pick the same one by name.
    const sharedName = `Shared hobby ${stamp}`;
    const s1 = await req("POST", "/users/me/interests", { cookie: cookieB2, body: { name: sharedName } });
    const s2 = await req("POST", "/users/me/interests", { cookie: cookieA3, body: { name: sharedName } });
    check("both users share the same interest id", s1.json?.interest?._id === s2.json?.interest?._id, `${s1.json?.interest?._id} vs ${s2.json?.interest?._id}`);
    const sharedId = s1.json?.interest?._id;

    // User A renames the shared interest -> must NOT change user B's copy.
    const u12 = await req("PUT", `/users/me/interests/${sharedId}`, { cookie: cookieA3, body: { name: `A renamed shared ${stamp}` } });
    check("rename shared interest returns 200", u12.status === 200, `got ${u12.status} ${JSON.stringify(u12.json)}`);
    const u13 = await req("GET", "/users/me/interests", { cookie: cookieB2 });
    check("other user's interest name is unchanged", u13.json?.interests?.some(x => x.name === sharedName), JSON.stringify(u13.json));
    const u14 = await req("GET", "/users/me/interests", { cookie: cookieA3 });
    check("renaming user has the new name", u14.json?.interests?.some(x => x.name === `A renamed shared ${stamp}`), JSON.stringify(u14.json));

    // ADMIN: rename an interest in the global catalog
    const ad1 = await req("PUT", `/interests/${sharedId}`, { cookie: cookieAdmin, body: { name: `Admin renamed ${stamp}` } });
    check("admin can rename a catalog interest (200)", ad1.status === 200, `got ${ad1.status} ${JSON.stringify(ad1.json)}`);
    check("admin rename applied", ad1.json?.interest?.name === `Admin renamed ${stamp}`, JSON.stringify(ad1.json?.interest));

    // Non-admin cannot rename the shared catalog
    const ad2 = await req("PUT", `/interests/${sharedId}`, { cookie: cookieB2, body: { name: `Hacked ${stamp}` } });
    check("non-admin cannot rename a catalog interest (403)", ad2.status === 403, `got ${ad2.status} ${JSON.stringify(ad2.json)}`);

    // Admin rename onto an existing name -> 409
    const ad3 = await req("PUT", `/interests/${sharedId}`, { cookie: cookieAdmin, body: { name: `Taken ${stamp}` } });
    check("admin rename onto existing name rejected (409)", ad3.status === 409, `got ${ad3.status} ${JSON.stringify(ad3.json)}`);

    // Admin rename of unknown id -> 404
    const ad4 = await req("PUT", "/interests/64b7f9c2e1a2b3c4d5e6f7a8", { cookie: cookieAdmin, body: { name: `Ghost ${stamp}` } });
    check("admin rename unknown interest returns 404", ad4.status === 404, `got ${ad4.status} ${JSON.stringify(ad4.json)}`);

    // The renamed catalog entry is visible in the catalog
    const ad5 = await req("GET", `/interests/${sharedId}`, { cookie: cookieAdmin });
    check("catalog shows the admin rename", ad5.json?.interest?.name === `Admin renamed ${stamp}`, JSON.stringify(ad5.json));

    console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
    process.exit(fail > 0 ? 1 : 0);
};

run().catch(e => { console.error("TEST CRASH:", e); process.exit(1); });
