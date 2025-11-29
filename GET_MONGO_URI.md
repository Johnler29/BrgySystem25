# How to Get Your MongoDB Connection String (MONGO_URI)

## Quick Steps

1. **Go to MongoDB Atlas**
   - Visit: https://cloud.mongodb.com/
   - Log in to your account

2. **Navigate to Your Cluster**
   - Click on your project (e.g., "Project O")
   - You should see your cluster (e.g., "barangayDB")
   - Click the **"Connect"** button on your cluster

3. **Choose Connection Method**
   - You'll see "Choose a connection method" screen
   - Under **"Connect to your application"** section
   - Click on **"Drivers"** (the option with binary code icon: 1011)

4. **Select Node.js Driver**
   - On the next screen, you'll see driver options
   - Select **"Node.js"** as your driver
   - Select the latest version (e.g., 6.0 or later)

5. **Copy the Connection String**
   - You'll see a connection string that looks like:
     ```
     mongodb+srv://<username>:<password>@barangaydb.5ootwqc.mongodb.net/?retryWrites=true&w=majority
     ```
   - Click the **"Copy"** button or select and copy the entire string

6. **Replace the Password Placeholder**
   - The connection string will have `<password>` in it
   - Replace `<password>` with your actual MongoDB database password
   - Example:
     ```
     mongodb+srv://adminDB:yourpassword@barangaydb.5ootwqc.mongodb.net/barangayDB?retryWrites=true&w=majority
     ```
   - **Note**: Make sure to include `/barangayDB` before the `?` if your database name is `barangayDB`

7. **Final Connection String Format**
   Your complete connection string should look like:
   ```
   mongodb+srv://adminDB:yourpassword@barangaydb.5ootwqc.mongodb.net/barangayDB?retryWrites=true&w=majority
   ```

## If You Don't Know Your Password

1. Go to MongoDB Atlas Dashboard
2. In the left sidebar, find **"SECURITY"** section
3. Click **"Database & Network Access"**
4. Make sure you're on the **"Database Access"** tab
5. Find your database user (e.g., `adminDB`) in the list
6. Click the **pencil icon** (✏️) next to your user
7. Click **"Edit Password"**
8. Enter a new password (or use "Autogenerate Secure Password")
9. Click **"Update User"**
10. **Save this password** - you'll need it for the connection string

## Using the Connection String

Once you have your complete connection string:

1. **For Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add new variable:
     - **Name**: `MONGO_URI`
     - **Value**: Paste your complete connection string
     - **Environments**: Select all (Production, Preview, Development)
   - Click **Save**

2. **For Local Development:**
   - Create a `.env` file in your project root
   - Add: `MONGO_URI=your_connection_string_here`
   - Make sure `.env` is in your `.gitignore` file

## Important Notes

⚠️ **Security:**
- Never commit your connection string to Git
- Never share your connection string publicly
- The connection string contains your database password

⚠️ **Network Access:**
- Make sure MongoDB Atlas allows connections from Vercel
- Go to MongoDB Atlas → Network Access
- Add IP: `0.0.0.0/0` (allows from anywhere) or add Vercel's specific IP ranges

## Troubleshooting

**Connection string not working?**
- Check that you replaced `<password>` with your actual password
- Verify the database name is correct (`barangayDB`)
- Make sure there are no extra spaces in the connection string
- Check MongoDB Atlas Network Access settings

**Can't find the connection string?**
- Make sure you clicked "Connect" on your cluster
- Select "Drivers" under "Connect to your application"
- Not "Compass", "Shell", or other tools

