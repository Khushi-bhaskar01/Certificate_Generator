# Certify

A free-deployment-friendly certificate generator built with Next.js. It supports:

- Three built-in visual templates and image template uploads (PNG/JPG/SVG)
- Custom field labels and a live certificate preview
- Single certificate generation as a downloadable SVG
- CSV bulk generation (`name,course,date` columns)
- SHA-256-derived verification IDs and a public verification view
- Supabase authentication before generator access, private admin data, and public certificate verification with generation timestamps

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run `supabase/schema.sql`.
3. In **Project Settings → API**, copy the Project URL and the `anon` public key.
4. Copy `.env.example` to `.env.local` and fill in:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

5. In **Authentication → Users**, create the club lead account. Never put the `service_role` key in `.env.local`, browser code, Git, or Vercel client variables.

The generator requires an authenticated club lead. The schema lets authenticated club leads manage only their own templates/certificates. The public can query an exact certificate ID only when its status is `valid`; it cannot list revoked certificates or access the admin data. Apply the schema again after updating it so the public verification function includes `created_at`.

## Deploy free

Import this repository into Vercel or Netlify and use the default Next.js build settings. Add the same two `NEXT_PUBLIC_...` variables in the hosting provider's environment settings.
