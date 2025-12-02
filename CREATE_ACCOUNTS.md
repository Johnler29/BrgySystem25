# How to Create User Accounts with Different Roles

This guide explains how to create user accounts with different roles in the Barangay Langkaan II system.

## Method 1: Using the Admin API (Recommended)

### Create Account via API

Use the `/api/admin/create-user` endpoint (admin only) to create accounts with custom roles.

**Example using cURL:**

```bash
curl -X POST http://localhost:3000/api/admin/create-user \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "username": "john.doe",
    "email": "john.doe@example.com",
    "password": "SecurePass123!",
    "address": "Langkaan II",
    "role": "clerk",
    "verified": true
  }'
```

**Example using JavaScript (from browser console or admin page):**

```javascript
fetch('/api/admin/create-user', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include',
  body: JSON.stringify({
    firstName: 'John',
    lastName: 'Doe',
    username: 'john.doe',
    email: 'john.doe@example.com',
    password: 'SecurePass123!',
    address: 'Langkaan II',
    role: 'clerk',
    verified: true
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

### Available Roles

- `user` - Regular user (default)
- `admin` - Administrator
- `super_admin` - Super Administrator
- `moderator` - Moderator
- `clerk` - Clerk (can manage documents)
- `health_officer` - Health Officer (can access health pages)
- `emergency_officer` - Emergency Officer (can access disaster pages)

### Update User Role

To change an existing user's role:

```bash
curl -X PUT http://localhost:3000/api/admin/users/john.doe/role \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "role": "admin",
    "verified": true
  }'
```

## Method 2: Direct Database Access (MongoDB)

If you have direct access to MongoDB, you can create users directly:

```javascript
// Connect to MongoDB
use barangay_db;

// Create a new user with admin role
db.users.insertOne({
  username: "john.doe",
  email: "john.doe@example.com",
  firstName: "John",
  lastName: "Doe",
  name: "John Doe",
  role: "admin",  // Change this to desired role
  verified: true,
  address: "Langkaan II",
  passwordHash: "$2b$10$YOUR_BCRYPT_HASH_HERE", // Use bcrypt to hash password
  createdAt: new Date()
});
```

**To generate password hash (using Node.js):**

```javascript
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('YourPassword123!', 10);
console.log(hash);
```

## Method 3: Public Signup (Regular Users Only)

Regular users can sign up at `/signup`, but they will automatically get the `user` role and `verified: false` status. An admin must verify them and/or change their role.

## Role-Based Access

Once created, users will have access based on their role:

- **Dashboard, Residents, Community, Cases**: `admin`, `super_admin`, `moderator`
- **Document & Permits**: `admin`, `super_admin`, `clerk`
- **Health**: `admin`, `super_admin`, `health_officer`
- **Disaster**: `admin`, `super_admin`, `emergency_officer`
- **Financial, Logs & Reports, Settings**: `admin`, `super_admin` only

## Security Notes

1. **Password Requirements:**
   - Minimum 8 characters
   - At least 1 uppercase letter
   - At least 1 number
   - At least 1 special character

2. **Only admins** can create accounts with admin roles via the API
3. **Always verify** accounts before granting admin access
4. **Use strong passwords** for all admin accounts

## Example: Creating Different Role Accounts

### Create a Clerk Account
```javascript
fetch('/api/admin/create-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    firstName: 'Maria',
    lastName: 'Santos',
    username: 'maria.santos',
    email: 'maria@barangay.gov',
    password: 'SecurePass123!',
    address: 'Barangay Hall',
    role: 'clerk',
    verified: true
  })
});
```

### Create a Health Officer Account
```javascript
fetch('/api/admin/create-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    firstName: 'Dr. Juan',
    lastName: 'Cruz',
    username: 'juan.cruz',
    email: 'juan@barangay.gov',
    password: 'SecurePass123!',
    address: 'Health Center',
    role: 'health_officer',
    verified: true
  })
});
```

### Create a Super Admin Account
```javascript
fetch('/api/admin/create-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    firstName: 'Super',
    lastName: 'Admin',
    username: 'superadmin',
    email: 'superadmin@barangay.gov',
    password: 'SuperSecurePass123!',
    address: 'Barangay Hall',
    role: 'super_admin',
    verified: true
  })
});
```


