import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST' || req.method === 'GET') {
    const data = req.method === 'POST' ? req.body : req.query;
    const { title, text, url } = data;
    
    // Combine fields to find the URL (apps behave differently)
    const combinedContent = `${title || ''} ${text || ''} ${url || ''}`;

    // Extract URL from text (TikTok shares often: "Check this out: https://vm.tiktok.com/..." )
    const urlMatch = combinedContent.match(/https?:\/\/[^\s]+/);
    const targetUrl = urlMatch ? urlMatch[0] : '';

    if (targetUrl) {
      res.redirect(303, `/?share_url=${encodeURIComponent(targetUrl)}`);
    } else {
      // If no URL found, just go home, or maybe handle error
      res.redirect(303, '/');
    }
  } else {
    res.status(405).end();
  }
}
