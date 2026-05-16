# Add Teacher (Direct, No Email) Test Plan

This document validates the direct teacher provisioning flow:
- Migration RPC: `public.admin_create_teacher_direct`
- Edge action: `createTeacherDirect` via `teacher-portal-api`
- UI flow: Add Teacher modal in teacher management
- Regression coverage for existing teacher lifecycle flows

---

## Section 1 - Pre-test setup (SQL)

### [ ] Test 1.1 - Confirm migration function exists
1. Run:
```sql
select
  routine_schema,
  routine_name,
  data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'admin_create_teacher_direct';
```
2. Expected:
- Exactly one row for `public.admin_create_teacher_direct`.

Notes:

---

### [ ] Test 1.2 - Confirm action map wiring (code verification)
1. Run in terminal:
```bash
rg -n "createTeacherDirect" supabase/functions/teacher-portal-api/_lib/action-map.ts
```
2. Expected:
- Import exists for `createTeacherDirectAction`.
- `createTeacherDirect: createTeacherDirectAction` exists in `actionMap`.

Notes:

---

### [ ] Test 1.3 - Create test admin auth user (Dashboard steps)
1. Open Supabase Dashboard.
2. Go to `Authentication -> Users`.
3. Click `Add user`.
4. Create user with a known test admin email (for example `test+admin@example.com`) and password.
5. Ensure email is confirmed.

Expected:
- User exists in Auth users list.

Notes:

---

### [ ] Test 1.4 - Confirm admin profile role
1. Run:
```sql
select id, user_id, email, role, is_active, active, status
from public.profiles
where lower(email) = lower('test+admin@example.com');
```
2. Expected:
- `role` is `admin` or `superadmin`.

Notes:

---

### [ ] Test 1.5 - Clean slate for target test email
1. Run:
```sql
select teacher_id, email, status, active, deleted_at
from public.teachers
where lower(email) = lower('test+teacher@example.com');

select id, user_id, email, role
from public.profiles
where lower(email) = lower('test+teacher@example.com');
```
2. In Dashboard `Authentication -> Users`, confirm no user exists for `test+teacher@example.com`.

Expected:
- No active teacher row for the test email.
- No auth user for the test email before testing.

Notes:

---

## Section 2 - RPC unit tests (SQL in Supabase SQL Editor)

### [ ] Test 2.1 - Blank email rejected
1. Run:
```sql
select public.admin_create_teacher_direct(
  p_full_name   => 'Test Teacher',
  p_email       => '',
  p_phone       => null,
  p_group_id    => null,
  p_subgroup_id => null,
  p_notes       => null,
  p_actor_email => 'test+admin@example.com'
) as result;
```
2. Expected:
- `result->>'ok' = 'false'`
- `result->>'error'` contains `Email is required`.

Notes:

---

### [ ] Test 2.2 - Blank name rejected
1. Run:
```sql
select public.admin_create_teacher_direct(
  p_full_name   => '',
  p_email       => 'test+teacher@example.com',
  p_phone       => null,
  p_group_id    => null,
  p_subgroup_id => null,
  p_notes       => null,
  p_actor_email => 'test+admin@example.com'
) as result;
```
2. Expected:
- `result->>'ok' = 'false'`
- `result->>'error'` contains `Full name is required`.

Notes:

---

### [ ] Test 2.3 - Duplicate email rejected
1. Insert a seed row:
```sql
insert into public.teachers (
  teacher_id, full_name, email, status, active, created_by, updated_by
)
values (
  'T-DUPLICAT',
  'Duplicate Teacher',
  'test+teacher@example.com',
  'PENDING',
  false,
  'test+admin@example.com',
  'test+admin@example.com'
);
```
2. Call RPC:
```sql
select public.admin_create_teacher_direct(
  p_full_name   => 'Another Teacher',
  p_email       => 'test+teacher@example.com',
  p_phone       => null,
  p_group_id    => null,
  p_subgroup_id => null,
  p_notes       => null,
  p_actor_email => 'test+admin@example.com'
) as result;
```
3. Expected:
- `ok=false`
- `error` contains `A teacher with this email already exists`.
4. Cleanup:
```sql
delete from public.teachers where teacher_id = 'T-DUPLICAT';
```

Notes:

---

### [ ] Test 2.4 - Happy path
1. Run:
```sql
select public.admin_create_teacher_direct(
  p_full_name   => 'Test Teacher Full Name',
  p_email       => 'test+teacher@example.com',
  p_phone       => null,
  p_group_id    => null,
  p_subgroup_id => null,
  p_notes       => 'RPC happy path',
  p_actor_email => 'test+admin@example.com'
) as result;
```
2. Expected:
- `ok=true`
- `teacher_id` starts with `T-`
- `status='PENDING'`
3. Verify teacher:
```sql
select teacher_id, full_name, email, status, active
from public.teachers
where lower(email)=lower('test+teacher@example.com');
```
Expected:
- `status='PENDING'`
- `active=false`
4. Verify audit:
```sql
select action, target_id, metadata
from public.audit_logs
where action='teacher_created_direct'
order by created_at desc
limit 1;
```
Expected:
- `target_id` matches teacher row `teacher_id`
- `metadata->>'method' = 'direct_no_email'`

5. Cleanup:
```sql
delete from public.audit_logs
where action='teacher_created_direct'
  and metadata->>'email'='test+teacher@example.com';

delete from public.teachers
where lower(email)=lower('test+teacher@example.com');
```

Notes:

---

## Section 3 - Edge function tests (curl)

Use placeholders:
- `SUPABASE_URL=https://your-project.supabase.co`
- `ADMIN_JWT=<admin JWT from browser devtools>`
- `TEACHER_JWT=<teacher JWT>`

### [ ] Test 3.1 - Unauthenticated request rejected
1. Run:
```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/teacher-portal-api" \
  -H "Content-Type: application/json" \
  -d '{"action":"createTeacherDirect","params":{"full_name":"Test Teacher","email":"test+teacher@example.com","temp_password":"Temp1234!"}}'
```
2. Expected:
- HTTP `401`
- Body includes `ok:false` and error `Missing or invalid bearer token`.

Notes:

---

### [ ] Test 3.2 - Non-admin role rejected
1. Run:
```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/teacher-portal-api" \
  -H "Authorization: Bearer $TEACHER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"createTeacherDirect","params":{"full_name":"Test Teacher","email":"test+teacher@example.com","temp_password":"Temp1234!"}}'
```
2. Expected:
- HTTP `403`
- Body includes `ok:false` and error `Admin role required`.

Notes:

---

### [ ] Test 3.3 - Missing required fields rejected
1. Run:
```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/teacher-portal-api" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"createTeacherDirect","params":{"email":"test+teacher@example.com"}}'
```
2. Expected:
- HTTP `400`
- Body error contains `full_name is required` (or required-field message).

Notes:

---

### [ ] Test 3.4 - Password too short rejected
1. Run:
```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/teacher-portal-api" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"createTeacherDirect","params":{"full_name":"Test Teacher","email":"test+teacher@example.com","temp_password":"short"}}'
```
2. Expected:
- HTTP `400`
- Error mentions password length (`8` minimum).

Notes:

---

### [ ] Test 3.5 - Happy path
1. Run:
```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/teacher-portal-api" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "action":"createTeacherDirect",
    "params":{
      "full_name":"Test Teacher",
      "email":"test+teacher@example.com",
      "temp_password":"Temp1234!",
      "phone":"",
      "group_id":"",
      "subgroup_id":""
    }
  }'
```
2. Expected:
- HTTP `200`
- Body includes:
  - `ok:true`
  - `teacher_id` starts with `T-`
  - `auth_user_id` non-null UUID
  - `email` equals test email
  - `temp_password` echoes `Temp1234!`

3. Verify DB:
```sql
select teacher_id, status, active, teacher_user_id
from public.teachers
where lower(email)=lower('test+teacher@example.com');
```
Expected:
- `status='PENDING'`, `active=false`, `teacher_user_id` non-null

```sql
select user_id, role
from public.profiles
where lower(email)=lower('test+teacher@example.com');
```
Expected:
- `role='teacher'`

Notes:

---

### [ ] Test 3.6 - Duplicate email rejected at edge level
1. Repeat Test 3.5 with same email.
2. Expected:
- HTTP `200`
- Body includes `ok:false`
- Error includes `A teacher with this email already exists`.

Notes:

---

### [ ] Test 3.7 - Cleanup
1. Delete auth user (Admin API or Dashboard):
```bash
curl -i -X DELETE "$SUPABASE_URL/auth/v1/admin/users/<AUTH_USER_ID>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "apikey: <SERVICE_ROLE_KEY>"
```
2. Cleanup SQL:
```sql
delete from public.audit_logs
where target_id in (
  select teacher_id from public.teachers where lower(email)=lower('test+teacher@example.com')
);

delete from public.profiles
where lower(email)=lower('test+teacher@example.com');

delete from public.teachers
where lower(email)=lower('test+teacher@example.com');
```

Notes:

---

## Section 4 - UI manual test checklist

### [ ] Test 4.1 - Modal opens correctly
1. Log in as admin.
2. Open `teacher-management.html`.
3. Click `Add Teacher`.
4. Expected:
- Modal appears.
- All fields visible.
- Password field masked.

Notes:

---

### [ ] Test 4.2 - Client validation: empty full name
1. Leave Full Name empty, fill others.
2. Click `Create Teacher`.
3. Expected:
- Toast error: full name required.
- No API call made.

Notes:

---

### [ ] Test 4.3 - Client validation: invalid email
1. Enter `notanemail`.
2. Click `Create Teacher`.
3. Expected:
- Toast error about valid email.

Notes:

---

### [ ] Test 4.4 - Client validation: short password
1. Enter `abc` for temporary password.
2. Click `Create Teacher`.
3. Expected:
- Toast error about 8 character minimum.

Notes:

---

### [ ] Test 4.5 - Password visibility toggle
1. Click show/hide on temporary password.
2. Expected:
- Input type toggles `password` <-> `text`.

Notes:

---

### [ ] Test 4.6 - Successful creation
1. Enter valid data and submit.
2. Expected:
- Button shows `Creating…` during request.
- Result panel appears with email, temp password, login URL.
- Button changes to `Done ✓`.
- New `PENDING` teacher appears without page refresh.

Notes:

---

### [ ] Test 4.7 - Dark mode
1. Toggle dark mode (moon).
2. Open Add Teacher modal.
3. Expected:
- Modal/input/result panel render correctly in dark mode.
- No hardcoded color artifacts.

Notes:

---

### [ ] Test 4.8 - Modal reset on close
1. Complete a successful create.
2. Close modal.
3. Reopen modal.
4. Expected:
- Fields cleared.
- Result panel hidden.

Notes:

---

### [ ] Test 4.9 - Login with created credentials
1. Open incognito.
2. Go to `/foundation/auth/login.html`.
3. Sign in with created email + temp password.
4. Expected:
- Login succeeds.
- Teacher portal loads.
- Account is still `PENDING` until activated.

Notes:

---

## Section 5 - Regression tests for existing teacher flows

### [ ] Test 5.1 - Teacher list still loads
1. Open `teacher-management.html` as admin.
2. Expected:
- `PENDING`, `ACTIVE`, `SUSPENDED`, `INACTIVE`, `ALL` tabs load.
- Existing teachers visible.

Notes:

---

### [ ] Test 5.2 - Activate / Approve still works
1. Click `Activate / Approve` on existing `PENDING` teacher.
2. Expected:
- Status becomes `ACTIVE`.
- Audit row written.

Notes:

---

### [ ] Test 5.3 - Suspend still works
1. Click `Suspend` on existing `ACTIVE` teacher.
2. Expected:
- Status becomes `SUSPENDED`.
- Reason captured.

Notes:

---

### [ ] Test 5.4 - Link Auth still works
1. Click `Link Auth` on any teacher.
2. Expected:
- `link_teacher_to_auth_user` RPC succeeds.
- Success toast.
- No page crash.

Notes:

---

### [ ] Test 5.5 - Search and filter still work
1. Search by name/email.
2. Filter by group/subgroup.
3. Expected:
- Results filter correctly.
- Newly created test teacher appears by email search.

Notes:

---

## Section 6 - Cleanup (run after all tests)

### [ ] Test 6.1 - Clean teacher row(s)
1. Soft-delete option:
```sql
update public.teachers
set deleted_at = now(), updated_at = now()
where lower(email)=lower('test+teacher@example.com');
```
2. Hard-delete option:
```sql
delete from public.teachers
where lower(email)=lower('test+teacher@example.com');
```

Notes:

---

### [ ] Test 6.2 - Clean audit logs
1. Run:
```sql
delete from public.audit_logs
where target_id in (
  select teacher_id from public.teachers where lower(email)=lower('test+teacher@example.com')
)
or (
  metadata->>'email'='test+teacher@example.com'
  and action in ('teacher_created_direct','teacher_auth_user_linked','teacher_create_direct_rollback')
);
```

Notes:

---

### [ ] Test 6.3 - Delete auth user (Dashboard)
1. Open Supabase Dashboard.
2. Go to `Authentication -> Users`.
3. Find `test+teacher@example.com`.
4. Delete user.

Expected:
- Auth user removed.
- `profiles` row typically cascade-deletes (verify).

Notes:

