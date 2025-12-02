/**
 * Simple script to create user accounts with different roles
 * 
 * Usage (from browser console while logged in as admin):
 * 
 * createAccount({
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   username: 'john.doe',
 *   email: 'john@example.com',
 *   password: 'SecurePass123!',
 *   address: 'Langkaan II',
 *   role: 'clerk',
 *   verified: true
 * });
 */

async function createAccount(userData) {
  try {
    const response = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(userData)
    });

    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Account created successfully!', data);
      return data;
    } else {
      console.error('❌ Error:', data.message);
      return data;
    }
  } catch (error) {
    console.error('❌ Network error:', error);
    return { ok: false, message: error.message };
  }
}

// Helper function to update user role
async function updateUserRole(username, role, verified = null) {
  try {
    const body = { role };
    if (verified !== null) {
      body.verified = verified;
    }

    const response = await fetch(`/api/admin/users/${username}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Role updated successfully!', data);
      return data;
    } else {
      console.error('❌ Error:', data.message);
      return data;
    }
  } catch (error) {
    console.error('❌ Network error:', error);
    return { ok: false, message: error.message };
  }
}

// Make functions available globally
window.createAccount = createAccount;
window.updateUserRole = updateUserRole;

console.log('📝 Account creation helpers loaded!');
console.log('Usage: createAccount({ firstName, lastName, username, email, password, address, role, verified })');
console.log('Usage: updateUserRole(username, role, verified)');


