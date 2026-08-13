# Getting the code onto GitHub and into Vercel

Written for your machine specifically. About 20 minutes.

---

## 1. Check you have Git

Open PowerShell and run:

```powershell
git --version
```

If it errors, install it:

```powershell
winget install Git.Git
```

Then **close PowerShell and open a new one**, or it will not find the command.

---

## 2. Go to the project

```powershell
cd "$env:USERPROFILE\OneDrive\Documents\Claude\Projects\Joey\fcs"
```

---

## 3. Start the repo

```powershell
git init
git branch -M main
```

---

## 4. Check nothing secret is about to be committed

**Do not skip this.** It is the difference between a private key staying private
and it being on the internet forever.

```powershell
git status
```

Read the list. You should see `app/`, `components/`, `lib/`, `package.json` and
so on.

You must **not** see:

- `.env.local` — your Supabase secret key and Resend key live in it
- `node_modules/` — 417MB of other people's code
- `.next/` — build output

If any of those appear, stop and tell me. If they do not, carry on.

---

## 5. First commit

```powershell
git add .
git commit -m "Championship fantasy game"
```

Git may ask who you are the first time:

```powershell
git config --global user.name "Joey Poole"
git config --global user.email "joe.poole99@gmail.com"
```

---

## 6. Create the repo on GitHub

Go to [github.com/new](https://github.com/new).

- **Name**: `championship-fantasy`
- **Private**. You can always make it public later, but you cannot un-leak a key.
- **Do not** tick "Add a README", "Add .gitignore" or "Choose a licence". You
  already have those, and ticking them creates a conflicting first commit.

Click Create.

---

## 7. Push

GitHub shows you the commands. They will look like this:

```powershell
git remote add origin https://github.com/YOURNAME/championship-fantasy.git
git push -u origin main
```

A browser window opens asking you to sign in to GitHub. That is Git Credential
Manager, which ships with Git for Windows. Approve it and the push continues.
GitHub stopped accepting account passwords on the command line years ago, so if
you are ever asked to type a password, something has gone wrong.

Refresh the GitHub page. Your files should be there. **Click into the repo and
confirm `.env.local` is not listed.**

---

## 8. Import into Vercel

1. [vercel.com](https://vercel.com), sign in **with GitHub**
2. **Add New → Project**
3. Find `championship-fantasy`, click **Import**
4. Vercel detects Next.js on its own. Leave the build settings alone.
5. Open **Environment Variables** and add these seven, one at a time:

   | Name | Where it comes from |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your `.env.local` |
   | `SUPABASE_SERVICE_ROLE_KEY` | your `.env.local` |
   | `FOOTBALL_DATA_TOKEN` | your `.env.local` |
   | `ADMIN_EMAILS` | your `.env.local` |
   | `CRON_SECRET` | your `.env.local` |
   | `NEXT_PUBLIC_SITE_URL` | `https://championshipfantasy.com` |

   Open `.env.local` in Notepad and copy each value across. Watch for trailing
   spaces.

6. **Deploy**. Two to three minutes.

You get a URL like `championship-fantasy.vercel.app`. Open it. The site should
load, though sign in will not work yet because Supabase does not know about this
URL. That is the next step, in `DEPLOY.md`.

---

## Making changes from now on

Every push to `main` redeploys automatically. Once you have edited something:

```powershell
git add .
git commit -m "what you changed"
git push
```

Vercel picks it up within seconds.

---

## Two things worth knowing

**OneDrive and Git.** The project sits in your OneDrive folder, so OneDrive will
try to sync the `.git` folder. It usually works, but if you ever see Git
complaining about locked files or corrupt objects, that is why. Moving the
project to `C:\Users\Joey\Projects\fcs` fixes it permanently.

**If you ever do leak a key.** Rotate it immediately rather than deleting the
commit. Supabase: Settings, API Keys, roll the secret key. Resend: delete the
API key and make a new one. Removing a file from GitHub does not remove it from
the history, and bots scan public repos for keys within minutes.
