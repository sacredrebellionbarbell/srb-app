# Sacred Rebellion Barbell — App

## Stack
- React (Create React App)
- Supabase (auth + database + storage)
- Stripe (membership billing)
- Vercel (hosting)

## Setup

### 1. Supabase Storage Bucket
In your Supabase dashboard → Storage → Create bucket named `avatars` → set to **Public**

### 2. Make your account a coach
After you sign up, go to Supabase → Table Editor → profiles → find your row → change `role` to `coach`

### 3. Deploy to Vercel
1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import your repo
3. Add these Environment Variables in Vercel:
   - `REACT_APP_SUPABASE_URL` = https://kinvrvqzoulzzkbfdqej.supabase.co
   - `REACT_APP_SUPABASE_ANON_KEY` = your anon key
   - `REACT_APP_STRIPE_PRICING_TABLE_ID` = prctbl_1TIWWOGhBbF4tLQWvvEGgWry
   - `REACT_APP_STRIPE_PUBLISHABLE_KEY` = pk_live_51SjMx...
4. Deploy

### 4. Connect your domain
In Vercel → Settings → Domains → add sacredrebellion.fit

## Features
- Date navigation (prev/next day arrows)
- Coach: post workouts with multiple sections
- Athletes: log results, see leaderboard, react to others
- Prepare button: Epley 1RM estimator with working percentages
- Schedule: class signup, recurring classes, 24/7 access check-in
- Profile: avatar upload, result history, estimated 1RMs, Stripe membership
- Members (coach only): view all members, email individuals or broadcast
- Password reset via email (Supabase handles this automatically)
