# Domain Migration Guide: Namecheap to Vercel

This guide walks you through the process of connecting your Namecheap domain to your SkyPilot dashboard hosted on Vercel.

## Step 1: Add your Domain in Vercel
First, you need to tell Vercel which domain you intend to use.

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Select your **SkyPilot Webapp** project.
3. Navigate to **Settings** > **Domains** in the top menu.
4. Type your domain name (e.g., `yourdomain.com`) into the input field and click **Add**.
5. Vercel will likely suggest adding the `www` version as well (e.g., `www.yourdomain.com`). We recommend accepting this to ensure both versions work.

### Record Values
Once added, Vercel will show an "Invalid Configuration" status. This is normal. Take note of the **Values** it provides for the A and CNAME records.

## Step 2: Configure Namecheap DNS
Now you need to tell Namecheap to point your domain to Vercel's servers.

1. Log in to your [Namecheap Account](https://www.namecheap.com/).
2. Go to **Domain List** > **Manage** > **Advanced DNS**.
3. In the **Host Records** section, add/update these records:

### A Record
- **Type**: A Record
- **Host**: @
- **Value**: `76.76.21.21` (Verify this against what Vercel shows)
- **TTL**: Automatic

### CNAME Record
- **Type**: CNAME Record
- **Host**: www
- **Value**: `cname.vercel-dns.com.`
- **TTL**: Automatic

## Step 3: Verification
1. Go back to your **Vercel Domains** page and click **Refresh**.
2. Once the status turns green, your dashboard is live on your custom domain!
