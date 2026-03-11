export default async function handler(req, res) {
    // 1. CORS Headers for Vercel Serverless Functions
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-google-api-key'
    );

    // Preflight request handling
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
        return;
    }

    try {
        const apiKey = req.headers['x-google-api-key'] || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            res.status(401).json({ error: 'Missing Google API Key in headers or environment.' });
            return;
        }

        const { productUrl, productContext } = req.body;
        if (!productContext) {
            res.status(400).json({ error: 'Missing product context for image generation.' });
            return;
        }

        // Using Gemini API (nanobanana) for image generation
        // Construct the prompt based on Korean SNS aesthetics
        const imagePrompt = `A high-quality, professional product photography for Instagram of a Korean cosmetic product. 
Context: ${productContext}
Style: bright, clean, minimalistic, k-beauty aesthetic, soft natural lighting, aesthetic props, white or pastel background, highly detailed, 4k resolution.`;

        // Direct fetch to Google Gemini REST API
        // Endpoint structure typical for Gemini Models:
        const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateImages?key=${apiKey}`;

        // Note: The structure requires 'instances' with 'prompt'
        const geminiRes = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instances: [
                    {
                        prompt: imagePrompt
                    }
                ],
                parameters: {
                    sampleCount: 1,
                    // Square format for Instagram
                    aspectRatio: "1:1"
                }
            })
        });

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            res.status(geminiRes.status).json({ error: `Gemini API Error: ${errText}` });
            return;
        }

        const geminiData = await geminiRes.json();
        
        // Return the predictions payload which contains the image data
        res.status(200).json(geminiData);

    } catch (err) {
        console.error("Vercel Image API Error:", err);
        res.status(500).json({ error: err.message });
    }
}
