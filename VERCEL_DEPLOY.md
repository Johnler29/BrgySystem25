# Deploying to Vercel

This guide will help you deploy your Barangay Langkaan II Web Management System to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com) (free account works)
2. **Git Repository**: Your code should be in a Git repository (GitHub, GitLab, or Bitbucket)
3. **MongoDB Atlas**: Make sure your MongoDB Atlas cluster is accessible from the internet

## Step 1: Prepare Your Code

✅ The following files have been created/updated for Vercel deployment:
- `vercel.json` - Vercel configuration
- `api/index.js` - Serverless function handler
- `welcome.js` - Updated to use environment variables

## Step 2: Set Up Environment Variables

Before deploying, you need to set up environment variables in Vercel:

### Required Environment Variables:

1. **MONGO_URI** (Required)
   - Your MongoDB Atlas connection string
   - Example: `mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority`
   - ⚠️ **Important**: Update your MongoDB Atlas IP whitelist to allow Vercel's IPs (or use `0.0.0.0/0` for all IPs)

2. **SESSION_SECRET** (Recommended)
   - A random secret string for session encryption
   - Generate a secure random string (e.g., use `openssl rand -base64 32`)
   - Example: `your-super-secret-random-string-here`

3. **NODE_ENV** (Optional)
   - Set to `production` for production deployments
   - Vercel sets this automatically, but you can override it

## Step 3: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended for first-time)

1. **Push your code to GitHub/GitLab/Bitbucket**
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import Project in Vercel**
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "Add New Project"
   - Import your Git repository
   - Vercel will auto-detect it's a Node.js project

3. **Configure Environment Variables**
   
   **Getting Your MongoDB URI:**
   
   **Option 1: If you know your password**
   - Go to [MongoDB Atlas Dashboard](https://cloud.mongodb.com/)
   - Click "Connect" on your cluster
   - You should see "Choose a connection method" screen
   - Under **"Connect to your application"** section, click on **"Drivers"** (the option with binary code icon)
   - On the next screen:
     - Select **Node.js** as your driver
     - Select the latest version (e.g., 6.0 or later)
   - Copy the connection string shown (looks like: `mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority`)
   - **Important**: Replace `<password>` in the connection string with your actual MongoDB database password
   - The final string should look like: `mongodb+srv://adminDB:yourpassword@barangaydb.5ootwqc.mongodb.net/barangayDB?retryWrites=true&w=majority`
   
   **Option 2: If you forgot your password (Reset it)**
   - Go to [MongoDB Atlas Dashboard](https://cloud.mongodb.com/)
   - ⚠️ **Important**: You need to go to **"Database & Network Access"**, NOT the "Users" page
   - In the **left sidebar**, look for the **"SECURITY"** section (scroll down if needed)
   - Click on **"Database & Network Access"** (it's under the SECURITY section, NOT under "Project Identity & Access")
   - You should see two tabs at the top: **"Database Access"** and **"Network Access"**
   - Make sure you're on the **"Database Access"** tab (should be selected by default)
   - You'll see a list of **database users** in a table (these are different from organization users)
   - Find your database user (e.g., `adminDB`) in the list
   - On the right side of that user's row, you'll see action buttons/icons
   - Look for the **pencil icon** (✏️) - this is the "Edit" button
   - Click the **pencil icon** next to your database user
   - A panel will open on the right side
   - Click the **"Edit Password"** button in that panel
   - Enter a new password (or click "Autogenerate Secure Password" for a random one)
   - Click **"Update User"** at the bottom
   - **Save this password** - you'll need it for the connection string
   - Now go back to your cluster → "Connect" → "Drivers" to get the connection string with the new password
   
   **Note**: If you're seeing organization/project users instead of database users, you're on the wrong page. Look for "Database & Network Access" under SECURITY, not "Users" or "Project Identity & Access".
   
   **Note**: If you see a hardcoded password in your code (like `capstonelozonvill`), that might be your current password, but it's recommended to reset it for security, especially before deploying to production.
   
   **Generating SESSION_SECRET:**
   - On Windows (PowerShell): `[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))`
   - On Mac/Linux: `openssl rand -base64 32`
   - Or use an online generator: [randomkeygen.com](https://randomkeygen.com/) (use "CodeIgniter Encryption Keys")
   
   **Adding Variables in Vercel:**
   - After importing your project, click on your project name
   - Go to **Settings** → **Environment Variables**
   - Click **Add New**
   - Add each variable:
     - **Name**: `MONGO_URI`
     - **Value**: Your MongoDB connection string (paste the full string)
     - **Environments**: Select all (Production, Preview, Development) ✓
     - Click **Save**
   - Repeat for `SESSION_SECRET`:
     - **Name**: `SESSION_SECRET`
     - **Value**: Your generated random string
     - **Environments**: Select all (Production, Preview, Development) ✓
     - Click **Save**
   
   ⚠️ **Important**: You must add these variables BEFORE your first deployment, or redeploy after adding them.

4. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete
   - Your app will be live at `https://your-project-name.vercel.app`

### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Set Environment Variables** (Before deploying)
   
   You can add environment variables via CLI or dashboard:
   
   **Via CLI:**
   ```bash
   vercel env add MONGO_URI
   # Paste your MongoDB connection string when prompted
   # Select environments: Production, Preview, Development
   
   vercel env add SESSION_SECRET
   # Paste your generated session secret when prompted
   # Select environments: Production, Preview, Development
   ```
   
   **Or via Dashboard:**
   - Go to your project in Vercel dashboard
   - Settings → Environment Variables
   - Add `MONGO_URI` and `SESSION_SECRET` as described in Option A

4. **Deploy**
   ```bash
   vercel
   ```
   - Follow the prompts to link your project
   - Vercel will use the environment variables you set

5. **Deploy to Production**
   ```bash
   vercel --prod
   ```

## Step 4: Configure MongoDB Atlas

⚠️ **Important**: Update your MongoDB Atlas network access:

1. Go to MongoDB Atlas Dashboard
2. Navigate to **Network Access**
3. Add IP Address:
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere" (or add Vercel's IP ranges)
   - This allows Vercel's servers to connect to your database

## Step 5: Update Session Cookie Settings

The code has been updated to automatically use secure cookies in production. The session configuration in `welcome.js` now uses:
- `secure: true` when `NODE_ENV === 'production'` (Vercel uses HTTPS)

## Troubleshooting

### Login Not Working / Page Just Refreshes

**This is a common issue on Vercel!** The problem is that sessions weren't persisting in serverless functions.

**✅ Fixed in the code:**
- Sessions now use MongoDB storage (via `connect-mongo`) instead of in-memory storage
- CORS configured to allow credentials
- Cookie settings optimized for Vercel

**What to do:**
1. **Redeploy your app** after the code changes:
   ```bash
   git add .
   git commit -m "Fix session storage for Vercel"
   git push
   ```
   Vercel will automatically redeploy, or you can trigger a redeploy in the dashboard.

2. **Verify environment variables are set:**
   - `MONGO_URI` - Your MongoDB connection string
   - `SESSION_SECRET` - A secure random string
   - Both should be set for Production, Preview, and Development

3. **Clear your browser cookies** for the Vercel domain and try logging in again

4. **Check browser console** (F12) for any errors:
   - Look for CORS errors
   - Check Network tab to see if `/api/login` returns 200 or an error

5. **Check Vercel function logs:**
   - Go to your Vercel project → "Deployments" → Click on latest deployment → "Functions" tab
   - Look for any errors in the logs

### Build Fails
- Check the build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Make sure Node.js version is compatible (Vercel uses Node 18.x by default)

### Database Connection Issues
- Verify `MONGO_URI` environment variable is set correctly
- Check MongoDB Atlas network access settings
- Ensure your MongoDB Atlas cluster is running
- Check Vercel function logs for MongoDB connection errors

### Session Issues
- Verify `SESSION_SECRET` is set
- Check that cookies are working (browser console → Application → Cookies)
- Ensure you're accessing the site via HTTPS (Vercel provides this automatically)
- **Important**: Sessions are now stored in MongoDB, so they persist across serverless function invocations

### Static Files Not Loading
- Vercel serves static files from the `public` directory automatically
- Check file paths in your HTML/JS files (use relative paths)

### 404 Errors
- Verify `vercel.json` routes are configured correctly
- Check that `api/index.js` exists and exports the app correctly

## Additional Configuration

### Custom Domain
1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

### Environment-Specific Variables
You can set different values for:
- **Production**: Live site
- **Preview**: Pull request previews
- **Development**: Local development with `vercel dev`

## File Uploads

⚠️ **Note**: Vercel serverless functions have limitations:
- File uploads are supported but have size limits (4.5MB for Hobby plan)
- Consider using cloud storage (AWS S3, Cloudinary, etc.) for production
- The `uploads` folder is not persisted between deployments

## Monitoring

- Check Vercel dashboard for:
  - Deployment logs
  - Function logs
  - Analytics (if enabled)
  - Error tracking

## Support

- Vercel Documentation: [vercel.com/docs](https://vercel.com/docs)
- Vercel Community: [github.com/vercel/vercel/discussions](https://github.com/vercel/vercel/discussions)

---

**You're all set!** 🚀

After deployment, your app will be available at `https://your-project-name.vercel.app`

