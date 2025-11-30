# Fix MongoDB Authentication Error

## Error You're Seeing
```
MongoServerError: bad auth : authentication failed
```

This means the password in your MongoDB connection string is incorrect.

## Solution: Update Your MongoDB Password

You have **two options**:

### Option 1: Reset MongoDB Password (Recommended)

1. **Go to MongoDB Atlas**
   - Visit: https://cloud.mongodb.com/
   - Log in

2. **Navigate to Database Access**
   - Left sidebar → **"SECURITY"** section
   - Click **"Database & Network Access"**
   - Make sure you're on the **"Database Access"** tab

3. **Find Your User**
   - Look for `adminDB` in the list
   - Click the **pencil icon** (✏️) next to it

4. **Reset Password**
   - Click **"Edit Password"**
   - Enter a new password (or use "Autogenerate Secure Password")
   - Click **"Update User"**
   - **SAVE THIS PASSWORD** - you'll need it!

5. **Create `.env` File**
   - In your project root, create a file named `.env`
   - Add this content (replace `YOUR_NEW_PASSWORD` with the password you just set):
     ```
     MONGO_URI=mongodb+srv://adminDB:YOUR_NEW_PASSWORD@barangaydb.5ootwqc.mongodb.net/barangayDB?retryWrites=true&w=majority
     SESSION_SECRET=your-random-secret-string-here
     ```

6. **Test the Connection**
   ```bash
   npm start
   ```

### Option 2: Use Existing Password (If You Know It)

If you know your current MongoDB password:

1. **Create `.env` File**
   - In your project root, create a file named `.env`
   - Add this content (replace `YOUR_PASSWORD` with your actual password):
     ```
     MONGO_URI=mongodb+srv://adminDB:YOUR_PASSWORD@barangaydb.5ootwqc.mongodb.net/barangayDB?retryWrites=true&w=majority
     SESSION_SECRET=your-random-secret-string-here
     ```

2. **Test the Connection**
   ```bash
   npm start
   ```

## Quick Steps Summary

1. **Reset password in MongoDB Atlas** (or use existing one)
2. **Create `.env` file** in project root with correct `MONGO_URI`
3. **Run `npm start`** to test

## Generate SESSION_SECRET (Optional)

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Mac/Linux:**
```bash
openssl rand -base64 32
```

## Important Notes

- The `.env` file is already in `.gitignore`, so it won't be committed to Git
- Never share your `.env` file or commit it to version control
- The `.env` file is only for local development
- For Vercel, you need to set environment variables in the Vercel dashboard

## After Fixing

Once you've created the `.env` file with the correct password:
- Your local server should start without errors
- You can test login locally
- For Vercel deployment, make sure to set `MONGO_URI` in Vercel's environment variables


