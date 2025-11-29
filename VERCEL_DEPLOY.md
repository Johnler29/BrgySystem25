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
   - In the project settings, go to "Environment Variables"
   - Add the following:
     - `MONGO_URI`: Your MongoDB connection string
     - `SESSION_SECRET`: A secure random string
   - Make sure to add them for **Production**, **Preview**, and **Development** environments

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

3. **Deploy**
   ```bash
   vercel
   ```
   - Follow the prompts
   - When asked about environment variables, add them:
     - `MONGO_URI`: Your MongoDB connection string
     - `SESSION_SECRET`: A secure random string

4. **Deploy to Production**
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

### Build Fails
- Check the build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Make sure Node.js version is compatible (Vercel uses Node 18.x by default)

### Database Connection Issues
- Verify `MONGO_URI` environment variable is set correctly
- Check MongoDB Atlas network access settings
- Ensure your MongoDB Atlas cluster is running

### Session Issues
- Verify `SESSION_SECRET` is set
- Check that cookies are working (browser console)
- Ensure you're accessing the site via HTTPS (Vercel provides this automatically)

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

