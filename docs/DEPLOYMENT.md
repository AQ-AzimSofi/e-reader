# Vercel Deployment Guide

This guide will walk you through deploying the よみサポ application to Vercel with Postgres database support.

## Architecture Changes

The application has been refactored to work with Vercel's serverless environment:

- **Bookmarks**: Stored in Vercel Postgres database (instead of `bookmark.json` files)
- **All text content**: Stored in Vercel Postgres database (instead of .txt files)
  - Existing text files from `bookv1-rephrase/` and `bookv2-furigana/` are migrated to database
  - User-generated text from text input pages stored in database
  - No physical .txt files needed in production (can be deleted after migration)

## Prerequisites

1. GitHub account with this repository pushed
2. Vercel account (sign up at https://vercel.com)
3. Google Gemini API key

## Step 1: Create Vercel Account

1. Go to https://vercel.com/signup
2. Sign up with your GitHub account
3. Authorize Vercel to access your repositories

## Step 2: Install Vercel CLI (Optional)

```bash
npm install -g vercel
```

## Step 3: Deploy to Vercel

### Option A: Via Vercel Dashboard (Recommended for first deployment)

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure project:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)
4. Click "Deploy" (will fail initially - this is expected, we need to set up database first)

### Option B: Via CLI

```bash
# Login to Vercel
vercel login

# Link project
vercel link

# Deploy
vercel
```

## Step 4: Create Vercel Postgres Database

1. Go to your project in Vercel Dashboard
2. Click on "Storage" tab
3. Click "Create Database"
4. Select "Postgres"
5. Choose a database name (e.g., `yomi-sapo-db`)
6. Select region closest to your users
7. Click "Create"
8. The database will be automatically connected to your project

**Important**: Vercel will automatically add environment variables for the database:
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

## Step 5: Set Environment Variables

1. In Vercel Dashboard, go to your project
2. Click "Settings" → "Environment Variables"
3. Add the following variable:

   | Name | Value | Environment |
   |------|-------|-------------|
   | `GEMINI_API_KEY` | Your Google Gemini API key | Production, Preview, Development |

4. Click "Save"

**Note**: Database environment variables are automatically added by Vercel Postgres.

## Step 6: Initialize Database Tables

After your first deployment succeeds, you need to create the database tables:

1. Open your deployed app URL (e.g., `https://your-app.vercel.app`)
2. Navigate to: `https://your-app.vercel.app/api/init-db`
3. You should see a success message: `{"message":"Database tables created successfully","success":true}`

**Important**: Only run this once! Running it multiple times is safe (it uses `CREATE TABLE IF NOT EXISTS`), but unnecessary.

## Step 7: Migrate Text Files to Database

Since all text content is now stored in the database, you need to migrate your existing .txt files:

1. Navigate to: `https://your-app.vercel.app/api/migrate-text-files`
2. This will read all .txt files from the `public/` directory and insert them into the database
3. You should see a success response with migration statistics:
   ```json
   {
     "success": true,
     "message": "Text file migration completed",
     "stats": {
       "totalMigrated": 15,
       "errors": 0,
       "directories": 2
     },
     "log": ["...migration details..."]
   }
   ```

**Important**:
- Run this only once after initial deployment
- This migration must be run BEFORE deleting the .txt files from the repository
- Save the migration log for your records

## Step 8: Remove .txt Files from Repository (Optional)

After successful migration, you can remove the physical .txt files:

```bash
# Remove text files (keep directories structure if needed)
rm -rf public/bookv1-rephrase/*.txt
rm -rf public/bookv2-furigana/*.txt
rm -rf public/temp/*.txt

# Commit and push
git add .
git commit -m "Remove migrated text files (now in database)"
git push
```

**Note**: You may want to keep the .txt files in your repository as a backup. They won't affect deployment size significantly.

## Step 9: Redeploy

After setting up the database and environment variables:

1. Go to "Deployments" tab in Vercel Dashboard
2. Click "..." next to the latest deployment
3. Click "Redeploy"
4. Wait for deployment to complete

## Step 10: Verify Deployment

1. Visit your deployed app URL
2. Test the following features:
   - Bookmark a paragraph (should save to database)
   - Navigate away and come back (bookmark should persist)
   - Use text input feature
   - Use AI processing feature

## Local Development with Vercel Postgres

To develop locally with the Vercel Postgres database:

1. Install Vercel CLI: `npm install -g vercel`
2. Link your project: `vercel link`
3. Pull environment variables: `vercel env pull .env.local`
4. Run development server: `npm run dev`

This will download the database credentials to `.env.local` so you can connect to the production database locally.

**Warning**: This connects to your production database. Be careful when testing!

### Alternative: Local Development with Local Database

For safer local development, you can set up a local Postgres database:

1. Install PostgreSQL locally
2. Create a local database: `createdb yomi-sapo-local`
3. Create `.env.local` with local database URL:
   ```
   POSTGRES_URL="postgres://username:password@localhost:5432/yomi-sapo-local"
   GEMINI_API_KEY="your-api-key"
   ```
4. Initialize tables: Visit `http://localhost:3333/api/init-db`
5. Run development server: `npm run dev`

## Database Schema

The application uses two tables:

### `bookmarks` table
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

## Migrating Existing Bookmarks (Optional)

If you have existing `bookmark.json` files you want to migrate to the database:

1. Create a migration script or manually insert data using SQL
2. Connect to your Vercel Postgres database using the connection string
3. Insert bookmarks using SQL INSERT statements

Example SQL:
```sql
INSERT INTO bookmarks (file_name, directory, bookmark_text)
VALUES ('readable-code', 'bookv1-rephrase', 'your bookmark text here')
ON CONFLICT (file_name, directory) DO UPDATE SET bookmark_text = EXCLUDED.bookmark_text;
```

## Troubleshooting

### Deployment Fails with Database Error

- Ensure database is created and connected to project
- Check that database environment variables are set
- Run `/api/init-db` endpoint after first successful deployment

### Bookmarks Not Saving

- Check browser console for errors
- Verify database tables were created (visit `/api/init-db`)
- Check Vercel logs in dashboard for API errors

### AI Processing Times Out

- The `vercel.json` file sets a 60-second timeout for AI routes
- If you need more time, increase `maxDuration` (max 300 seconds on Pro plan)

### Environment Variables Not Working

- Ensure you selected "Production, Preview, Development" when adding variables
- Redeploy after adding new environment variables
- For local development, run `vercel env pull .env.local`

## Vercel Free Tier Limits

The Hobby (free) plan includes:
- Unlimited deployments
- 100 GB bandwidth/month
- 100 GB-hours serverless function execution/month
- Vercel Postgres: 256 MB storage, 60 hours compute time/month
- Function timeout: 10 seconds (can be extended to 60s with config)

For this app, the free tier should be sufficient for personal use!

## Custom Domain (Optional)

To add a custom domain:

1. Go to "Settings" → "Domains" in Vercel Dashboard
2. Enter your domain name
3. Follow DNS configuration instructions
4. Wait for DNS propagation (can take up to 48 hours)

## Production Best Practices

- Enable preview deployments for testing
- Set up monitoring/logging in Vercel Dashboard
- Regularly backup your database
- Use environment-specific variables for staging vs production
- Monitor database usage to stay within free tier limits

## Support

If you encounter issues:
- Check Vercel logs in Dashboard → Deployments → [deployment] → Runtime Logs
- Check browser console for client-side errors
- Refer to Vercel documentation: https://vercel.com/docs
- Check Next.js documentation: https://nextjs.org/docs
