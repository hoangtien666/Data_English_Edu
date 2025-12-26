# BaitapTracNghiem Crawler

This small Node.js script fetches the exercise list from:

https://baitaptracnghiem.com/danh-sach-bai-tap/bai-tap-tieng-anh

It scans the page for exercise links, visits each exercise page, finds a `form` element (if present), and auto-submits it via POST to get the response. Responses are saved into `responses.json`.

Usage

1. Install deps:

```bash
cd "$(pwd)"
npm install
```

2. Run the crawler (default URL is the English exercises list):

```bash
node index.js
```

Or provide a custom list URL and limit number of links:

```bash
node index.js "https://baitaptracnghiem.com/danh-sach-bai-tap/bai-tap-tieng-anh" 
# optionally set LIMIT env var: LIMIT=20 node index.js
```

Output

- `responses.json` will contain an array of objects with the URL, action, method, status, and a short snippet of the response.

Notes

- This script uses heuristics to find exercise links and forms; you may need to adapt selectors if the site structure differs.
- Respect the site's robots and terms of service. Use responsibly and avoid aggressive crawling.
