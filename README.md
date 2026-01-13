# AcademIQ

Academic CV indexing and analysis platform.

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL database, Storage, Edge Functions)
- **Hosting**: Netlify (frontend) + Supabase (backend)

## Deployment Guide

### Prerequisites

1. A [Supabase](https://supabase.com) account and project
2. A [Netlify](https://netlify.com) account
3. [Supabase CLI](https://supabase.com/docs/guides/cli) installed locally
4. Node.js 20+

### Step 1: Set Up Supabase Project

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Note your project URL and anon key from **Settings > API**

### Step 2: Set Up Supabase Database

Run the database migrations to create the required tables:

```bash
# Login to Supabase CLI
supabase login

# Link to your project (get project ref from dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push
```

Or manually run the SQL from `supabase-setup.sql` in the Supabase SQL Editor.

### Step 3: Set Up Supabase Storage

1. Go to **Storage** in your Supabase dashboard
2. Create a bucket named `academiq-cvs`
3. Set the bucket to **Public** (for CV file access)
4. Add a storage policy to allow uploads:

```sql
CREATE POLICY "Allow public uploads" ON storage.objects
FOR INSERT TO anon
WITH CHECK (bucket_id = 'academiq-cvs');

CREATE POLICY "Allow public reads" ON storage.objects
FOR SELECT TO anon
USING (bucket_id = 'academiq-cvs');
```

### Step 4: Deploy Supabase Edge Functions

The CV parsing is handled by Supabase Edge Functions. Deploy them:

```bash
# Set required secrets for the Edge Functions
supabase secrets set OPENAI_API_KEY=your-openai-api-key

# Deploy all functions
supabase functions deploy academiq-parse-cv
supabase functions deploy check-duplicate-cv
supabase functions deploy setup-database
```

### Step 5: Deploy to Netlify

#### Option A: Deploy via Netlify UI

1. Push your code to GitHub
2. Go to [Netlify](https://app.netlify.com)
3. Click **Add new site > Import an existing project**
4. Connect your GitHub repository
5. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
6. Add environment variables in **Site settings > Environment variables**:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
7. Deploy!

#### Option B: Deploy via Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize site (first time)
netlify init

# Set environment variables
netlify env:set VITE_SUPABASE_URL "https://your-project.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "your-anon-key"

# Deploy
netlify deploy --prod
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |

For Edge Functions (set via `supabase secrets set`):

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for CV parsing |

## Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your Supabase credentials
# Then start development server
npm run dev
```

## Project Structure

```
academiq01/
├── src/
│   ├── components/     # React components
│   ├── lib/           # Supabase client & database functions
│   └── App.tsx        # Main application
├── supabase/
│   ├── functions/     # Edge Functions (deployed to Supabase)
│   └── migrations/    # Database migrations
├── netlify.toml       # Netlify configuration
└── package.json
```
