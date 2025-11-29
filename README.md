# Barangay Langkaan II Web Management System

A comprehensive web management system for Barangay Langkaan II, built with Node.js, Express, and MongoDB.

## Prerequisites

Before setting up this project, ensure you have the following installed:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **MongoDB Atlas account** (or local MongoDB instance) - The project uses MongoDB Atlas by default

## Project Setup

### 1. Clone or Navigate to the Project Directory

```bash
cd BrgyL2System1
```

### 2. Install Dependencies

Dependencies should already be installed, but if you need to reinstall:

```bash
npm install
```

### 3. Environment Configuration

The project uses MongoDB Atlas by default. The connection string is configured in `welcome.js`. 

If you want to use environment variables (recommended for production), you can create a `.env` file:

```env
PORT=3000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/barangayDB?retryWrites=true&w=majority
SESSION_SECRET=your-secret-key-here
```

**Note:** The `.env` file is already in `.gitignore` to keep your credentials secure.

### 4. Start the Server

#### Development Mode (with auto-reload):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your environment).

## Default Login Credentials

The system comes with default credentials:

### Admin Account:
- **Username:** `admin`
- **Password:** `admin123`

### User Account:
- **Username:** `anna.garcia`
- **Password:** `user123`

**⚠️ Important:** Change these default credentials in production!

## Project Structure

```
BrgyL2System1/
├── public/              # Frontend static files (HTML, CSS, JS)
│   ├── assets/         # Images and other assets
│   ├── *.html          # Page templates
│   └── *.js            # Frontend JavaScript files
├── routes/             # API route handlers
│   ├── cases.js
│   ├── community.js
│   ├── financial.js
│   ├── logs.js
│   └── settings.js
├── models/             # Database models
│   ├── logs.js
│   ├── SystemSettings.js
│   └── UserSettings.js
├── middleware/         # Express middleware
│   └── maintenance.js
├── uploads/            # File uploads directory
├── welcome.js          # Main server entry point
├── package.json        # Project dependencies
└── firebase.json       # Firebase hosting configuration
```

## Features

- **User Authentication** - Login/Signup with session management
- **Resident Management** - Manage barangay residents
- **Document Management** - Handle document requests and permits
- **Case Management** - Track and manage cases
- **Community Services** - Community programs and services
- **Financial Management** - Financial records and transactions
- **Health Programs** - Health-related services
- **Disaster Management** - Emergency and disaster response
- **Logs & Reports** - System logs and reporting
- **Settings** - System and user settings

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/signup` - User registration
- `POST /api/logout` - User logout
- `GET /api/me` - Get current user info

### Documents
- `GET /api/documents` - Get all documents
- `POST /api/documents/add` - Create new document request
- `PUT /api/documents/:id` - Update document (admin only)
- `DELETE /api/documents/:id` - Delete document (admin only)

### Residents
- `GET /api/residents` - Get all residents

### Statistics
- `GET /api/stats` - Get dashboard statistics

## Troubleshooting

### MongoDB Connection Issues

If you encounter MongoDB connection errors:

1. Check your internet connection (MongoDB Atlas requires internet)
2. Verify the MongoDB connection string in `welcome.js`
3. Ensure your MongoDB Atlas IP whitelist includes your IP address
4. Check MongoDB Atlas cluster status

### Port Already in Use

If port 3000 is already in use:

1. Change the PORT in your `.env` file, or
2. Kill the process using port 3000:
   ```bash
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

### bcrypt Installation Issues on Windows

If you encounter issues with `bcrypt` on Windows, the project also includes `bcryptjs` as a fallback. You can modify `welcome.js` to use `bcryptjs` instead:

```javascript
const bcrypt = require('bcryptjs'); // Instead of bcrypt
```

## Development

### Running in Development Mode

Use `nodemon` for automatic server restart on file changes:

```bash
npm run dev
```

### Adding New Features

1. Create route handlers in the `routes/` directory
2. Add corresponding frontend pages in `public/`
3. Update navigation in `public/base-header.js` if needed

## Security Notes

- Default credentials should be changed in production
- MongoDB connection strings contain sensitive information
- Session secrets should be strong and unique
- Always use HTTPS in production
- Keep dependencies updated for security patches

## Support

For issues or questions, please contact the development team.

## License

ISC

---

**Barangay Langkaan II Web Management System** - Empowering communities through digital solutions.

