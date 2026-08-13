# Going live

Roughly an hour of work, most of it waiting. Do them in this order.

---

## 1. Email, before anything else

This is the one that will actually stop people signing up. Supabase's built in
sender allows **2 auth emails per hour**. Three friends trying to join at once
and the third gets an error.

### What the free tier actually gives you

Resend's free plan is **3,000 emails a month, capped at 100 a day**, on **one
domain**, with 30 days of logs. The daily cap is the real constraint, not the
monthly one: 3,000 a month averages 100 a day anyway, so you can never bank
unused quota for a busy day.

For this game that means roughly **80 to 90 new managers a day**, leaving
headroom for password resets. Fine for a few hundred mates joining over a
fortnight. Tight if you get a good post the week before the season starts and
two hundred people try to sign up on the same evening.

### The trick that makes 100 a day go much further

Every magic link login costs an email. Every single one, forever. A returning
manager checking their points on a Saturday burns quota.

**Password sign in costs nothing.** One email to confirm the account, then that
person never needs another. The login page already defaults to the Password tab
for exactly this reason. If you get anywhere near the cap, nudge people towards
passwords rather than upgrading.

### You need a domain first

Resend will only send to **your own address** until you verify a domain. So
buy the domain before this step, not after. About £10 a year.

### Setting it up, with GoDaddy

The API key lives in **Resend**. GoDaddy is only where you paste the DNS records
Resend hands you. Do it in this order or the key will exist before the domain is
ready to use it.

**1. Add the domain in Resend**

[resend.com](https://resend.com) → **Domains → Add Domain** →
`championshipfantasy.com`. Pick the **Ireland** region, since your players are
in the UK.

Resend suggests using a subdomain like `send.championshipfantasy.com`. That is
better practice for reputation at scale, but it means your emails come from
`hello@send.championshipfantasy.com`, which looks worse. Use the root domain.
You can always segment later.

**2. Copy the records into GoDaddy**

Resend shows three records: an **MX**, a **TXT** for SPF, and a **TXT** for
DKIM. In GoDaddy: **My Products → Domains → championshipfantasy.com → DNS →
Add New Record**.

The one thing that catches everyone: **GoDaddy's Name field wants the host
without your domain on the end, and appends it for you.** Resend shows
`send.championshipfantasy.com`. You type just `send`. Paste the full thing and
you get `send.championshipfantasy.com.championshipfantasy.com`, which never
verifies and gives no clue why.

| Resend shows | GoDaddy Name field |
|---|---|
| `send.championshipfantasy.com` | `send` |
| `resend._domainkey.championshipfantasy.com` | `resend._domainkey` |
| the root domain itself | `@` |

Other GoDaddy notes:

- MX records need **Priority 10**. GoDaddy has a separate field for it.
- Leave **TTL** on the default hour.
- The DKIM value is a very long string. Paste it in one go, no line breaks, no
  quote marks around it.
- Ignore any existing GoDaddy parked page or "Domain Ownership Verification"
  records. They do no harm.
- If you ever add GoDaddy email, its MX sits on `@` while Resend's sits on
  `send`, so the two do not collide.

**3. Verify**

Back in Resend, hit **Verify**. Usually a few minutes, occasionally an hour.
If it sticks, the cause is almost always the Name field problem above.

**4. Now create the API key**

Resend → **API Keys → Create API Key**. Name it `supabase`, permission
**Sending access**, domain `championshipfantasy.com`. Copy the key beginning
`re_`. It is shown once and never again.

**5. Wire it into Supabase**

**Authentication → Emails → SMTP Settings**, enable custom SMTP:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your `re_...` key |
| Sender email | `hello@championshipfantasy.com` |
| Sender name | Championship Fantasy |

Port 465 uses implicit TLS. If it is blocked, 587 also works.

**6. Raise the rate limit**

**Authentication → Rate Limits**, change the email limit from 2 an hour to 30.
Custom SMTP does not lift Supabase's own throttle, so skipping this leaves you
capped at 2 an hour with a perfectly good mail provider attached. This is the
most commonly missed step of the lot.

### A note on replies

Sending does not need a mailbox, but anyone who replies to
`hello@championshipfantasy.com` will bounce. Either set up forwarding at
GoDaddy, or use `no-reply@` as the sender so nobody tries.

Send yourself a magic link afterwards. Check it lands in the inbox rather than
spam, and that it comes from your domain rather than `supabase.io`.

### Watching it

Resend's dashboard shows every send, whether it bounced and whether it was
opened. When a manager says "I never got the email", look there first. Usually
it arrived and went to spam.

---

## 2. Put the code on GitHub, then Vercel

Step by step, written for your machine, in **GITHUB.md**.

The short version: `git init`, check `git status` does not list `.env.local`,
commit, create a **private** repo on GitHub, push, then import it into Vercel
with your seven environment variables.

## 3. Deploy to Vercel

1. [vercel.com](https://vercel.com), sign in with GitHub, **Add New → Project**,
   pick the repo.
2. Before clicking Deploy, open **Environment Variables** and add all six from
   your `.env.local`:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FOOTBALL_DATA_TOKEN`
   - `ADMIN_EMAILS`
   - `CRON_SECRET`

3. Deploy. You get a URL like `fcs-abc123.vercel.app`.

---

## 4. Point Supabase at the live URL

Sign in will fail until you do this.

**Authentication → URL Configuration:**

- **Site URL**: `https://championshipfantasy.com`
- **Redirect URLs**: add `https://championshipfantasy.com/**`, your
  `https://*.vercel.app/**` preview URL, and keep `http://localhost:3000/**`
  so local development still works

Do this after step 3a below, once the domain actually points at Vercel.

### 3a. Point the domain at Vercel

In Vercel: **Project → Settings → Domains → Add** `championshipfantasy.com`.
Vercel gives you either an A record or a CNAME. Add it in GoDaddy the same way
as before, using `@` for the root and `www` for the www version. Vercel issues
the HTTPS certificate itself once DNS resolves.

---

## 5. Check it end to end

On the live site, in a private window:

1. Sign up with an address that is **not** in `ADMIN_EMAILS`
2. Build a squad, save it
3. Make a transfer
4. Create a league, copy the invite, open it in another browser
5. Confirm `/admin` refuses that account

If all five work, you can share the link.

---

## Before you tell anyone about it

**~~A domain.~~** Done: `championshipfantasy.com`.

**A privacy notice.** You are collecting email addresses from people in the UK,
so you need one. It can be a single page saying what you store, why, and how to
get it deleted. Link it in the footer.

**Decide who is entering stats.** The weekly loop is still `npm run
sync:fixtures`, then stat entry in `/admin`, then `npm run process:gw N`, all
from your machine. That is fine for one person, but if you are away one Saturday
nobody gets their points. Worth adding a second admin email.

---

## Running the season

Each week, after the games:

```bash
npm run sync:fixtures     # pulls the scorelines
# enter minutes, goals, assists, saves, cards in /admin
npm run process:gw 7      # scores everyone, applies price changes
```

Roughly 45 minutes a gameweek at first, less once you get quick at it.

---

## Costs

| | Free tier | When you outgrow it |
|---|---|---|
| Vercel | Hobby, plenty for hundreds of managers | £16/mo |
| Supabase | 500MB database, 50k monthly users | £20/mo |
| Resend | 3,000/month, 100/day, one domain | £16/mo for 50k |
| football-data.org | Fixtures and results | €29/mo for squads and lineups |
| Domain | | ~£10/yr |

Nothing to pay until this gets genuinely popular. The football-data upgrade is
the one worth buying first, because it removes most of the weekly stat entry.
