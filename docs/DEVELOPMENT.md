# Local Development Guide

This guide will help you set up the Japanese Read Helper application for local development with Docker Compose.

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose installed
- Git
- Google Gemini API key

## Quick Start

```bash
# 1. Clone and install dependencies
git clone <your-repo-url>
cd japanese-read-helper
npm install

# 2. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local and add your GEMINI_API_KEY

# 3. Start the database
docker-compose up -d

# 4. Start the Next.js development server
npm run dev

# 5. Initialize the database (first time only)
# Open http://localhost:3333/api/init-db in your browser

# 6. Load text files into database (first time only)
# Open http://localhost:3333/api/migrate-text-files in your browser

# 7. Start developing!
# Open http://localhost:3333
```

## Detailed Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create your local environment file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and configure:

1. **Add your Google Gemini API key**:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```
   Get your API key from: https://makersuite.google.com/app/apikey

2. **Verify database connection string** (should already be correct):
   ```env
   DATABASE_URL="postgres://postgres:123@localhost:5433/yomi_sapo"
   ```
   **Note**: The password `123` matches the `docker-compose.yml` configuration. If you changed the password in `docker-compose.yml`, update it here too.

### 3. Start PostgreSQL Database

Start the database container:

```bash
docker-compose up -d
```

**Docker Compose Commands**:
- `docker-compose up -d` - Start database in background
- `docker-compose down` - Stop database
- `docker-compose logs -f` - View database logs
- `docker-compose ps` - Check container status
- `docker-compose restart` - Restart database

**First time?** The database will automatically create a volume to persist your data.

### 4. Start Next.js Development Server

```bash
npm run dev
```

The application will be available at: http://localhost:3333

### 5. Initialize Database Tables (First Time Only)

After starting the development server for the first time, you need to create the database tables:

1. Open your browser
2. Navigate to: http://localhost:3333/api/init-db
3. You should see: `{"message":"Database tables created successfully","success":true}`

**Important**: Only run this once when setting up your local environment!

### 6. Load Text Files into Database (First Time Only)

To populate your database with the existing text files:

1. Navigate to: http://localhost:3333/api/migrate-text-files
2. This will read all `.txt` files from `public/` and insert them into the database
3. You should see a success response with migration statistics

**Example response**:
```json
{
  "success": true,
  "message": "Text file migration completed",
  "stats": {
    "totalMigrated": 15,
    "errors": 0,
    "directories": 2
  },
  "log": [...]
}
```

## Daily Development Workflow

Once you've completed the initial setup, your daily workflow is simple:

```bash
# Make sure database is running
docker-compose up -d

# Start development server
npm run dev

# Start coding!
```

## Database Management

### Connect to Database

You can connect to your local database using any PostgreSQL client:

**Connection details**:
- Host: `localhost`
- Port: `5433`
- Database: `yomi_sapo`
- Username: `postgres`
- Password: `123`

**Example with psql**:
```bash
psql -h localhost -p 5433 -U postgres -d yomi_sapo
```

**Popular GUI clients**:
- [pgAdmin](https://www.pgadmin.org/)
- [DBeaver](https://dbeaver.io/)
- [TablePlus](https://tableplus.com/)

### Reset Database

If you need to start fresh:

```bash
# Stop and remove containers and volumes
docker-compose down -v

# Start fresh database
docker-compose up -d

# Reinitialize tables
# Visit http://localhost:3333/api/init-db

# Reload text files
# Visit http://localhost:3333/api/migrate-text-files
```

### View Database Logs

```bash
docker-compose logs -f db
```

### Backup Database

```bash
docker exec yomi-sapo-db pg_dump -U postgres yomi_sapo > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker exec -i yomi-sapo-db psql -U postgres -d yomi_sapo
```

## Development Scripts

Available npm scripts:

```bash
# Development
npm run dev          # Start Next.js dev server on port 3333
npm run dev-lan      # Start dev server accessible on LAN

# Building
npm run build        # Build for production
npm start           # Start production server

# Code Quality
npm run lint        # Run ESLint
```

## Project Structure

```
japanese-read-helper/
├── app/                      # Next.js App Router
│   ├── api/                 # API routes
│   │   ├── init-db/        # Database initialization
│   │   ├── migrate-text-files/  # Text file migration
│   │   ├── read-bookmark/  # Bookmark operations
│   │   ├── write-bookmark/
│   │   ├── read-public-txt/  # Text content operations
│   │   └── ...
│   ├── components/         # React components
│   └── ...
├── lib/                    # Utility functions
│   ├── db/                # Database layer
│   │   ├── schema.ts     # Database schema
│   │   └── queries.ts    # Database queries
│   ├── services/         # Business logic
│   └── ...
├── public/               # Static files (text files to be migrated)
├── docker-compose.yml    # Database configuration
├── .env.local           # Local environment variables (create from example)
└── .env.local.example   # Environment template
```

## Troubleshooting

### Database connection errors

**Error**: `ECONNREFUSED 127.0.0.1:5433`

**Solution**:
```bash
# Check if database is running
docker-compose ps

# Start if not running
docker-compose up -d

# Check logs for errors
docker-compose logs db
```

### Port 5433 already in use

**Error**: `port is already allocated`

**Solution**: Another PostgreSQL instance is running
```bash
# Find process using port 5433
sudo lsof -i :5433

# Stop your system PostgreSQL (Ubuntu/WSL)
sudo service postgresql stop

# Or change port in docker-compose.yml
# Change "5433:5432" to a free port, e.g. "5434:5432"
# Then update .env.local: the same port
```

### Database tables not created

**Error**: Tables don't exist when reading data

**Solution**: Run the initialization endpoint
```bash
# Visit in browser or use curl
curl http://localhost:3333/api/init-db
```

### Text files not loading

**Error**: Empty file list or missing content

**Solution**: Run the migration script
```bash
# Visit in browser or use curl
curl http://localhost:3333/api/migrate-text-files
```

### Environment variables not loaded

**Error**: `GEMINI_API_KEY is not defined`

**Solution**:
1. Ensure `.env.local` exists (copy from `.env.local.example`)
2. Add your actual API key
3. Restart the dev server (`npm run dev`)

### Docker commands not found

**Error**: `docker: command not found`

**Solution**: Install Docker Desktop
- Windows/Mac: https://www.docker.com/products/docker-desktop/
- Linux: https://docs.docker.com/engine/install/

## Testing Features Locally

### Test Bookmarks
1. Go to http://localhost:3333
2. Select a text file from dropdown
3. Click the bookmark icon on any paragraph
4. Refresh the page - bookmark should persist

### Test AI Processing
1. Go to http://localhost:3333/text-input-ai
2. Enter Japanese text
3. Submit - should see AI-rephrased versions

### Test Visual Novel Mode
1. Go to http://localhost:3333/visual-novel
2. Copy Japanese text to clipboard
3. Should appear and get processed

## Database Schema

### `bookmarks` table
Stores bookmark positions for each file:
```sql
CREATE TABLE bookmarks (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  directory VARCHAR(255) NOT NULL,
  bookmark_text TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(file_name, directory)
);
```

### `text_entries` table
Stores all text content:
```sql
CREATE TABLE text_entries (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  directory VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(file_name, directory)
);
```

## Next Steps

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel deployment instructions
- See [CLAUDE.md](./CLAUDE.md) for project architecture details

## Getting Help

If you encounter issues:
1. Check the troubleshooting section above
2. Review Docker Compose logs: `docker-compose logs -f`
3. Check Next.js logs in the terminal
4. Check browser console for client-side errors
