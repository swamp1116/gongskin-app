export default async function handler(req, res) {
    // 1. CORS Headers for Vercel Serverless Functions
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key'
    );

    // Preflight request handling
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST requests for this endpoint
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
        return;
    }

    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            res.status(401).json({ error: 'Missing x-api-key in headers' });
            return;
        }

        const { productUrl } = req.body;
        if (!productUrl) {
            res.status(400).json({ error: 'Missing productUrl in body' });
            return;
        }

        // 1. Scrape the URL content
        let pageText = "페이지 내용을 가져올 수 없습니다. URL 주소만 참고하여 특징을 유추해주세요.";
        try {
            const fetchUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(productUrl)}`;
            const pageRes = await fetch(fetchUrl);
            const pageData = await pageRes.json();
            
            if (pageData.contents) {
                // In Node.js environment without JSDOM, we use simple regex to strip tags
                // This is a lightweight Serverless safe way to extract text
                let html = pageData.contents;
                
                // Remove script and style blocks entirely
                html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
                html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
                
                // Remove all remaining HTML tags
                let text = html.replace(/<[^>]+>/g, ' ');

                // Clean up whitespace
                pageText = text.replace(/\s+/g, ' ').trim().substring(0, 5000);
            }
        } catch (scrapeErr) {
            console.error("Scrape warning:", scrapeErr);
            // Non-fatal, proceed with default pageText
        }

        // 2. Prepare Claude Prompt
        const systemPrompt = `당신은 공스킨 전용 콘텐츠 AI입니다. 
포지셔닝: 성분 좋은 화장품을 말도 안 되는 가격에.
톤: 직접적, 가격 먼저, 옆집 언니 느낌.
절대 쓰지 말 것: 럭셔리, 프리미엄, 기적, 완벽.

URL에서 제품 정보를 먼저 분석하고, 성분이 없는 제품(생수, 향수 등)은 성분 대신 특징/용도로 대체해서 콘텐츠 생성.

사용자가 제품 URL을 제공하면, 반드시 아래 JSON 형식으로만 응답하세요. (마크다운 백틱 없이 순수 JSON만 반환)
{
    "kakao": "카카오 채널 메시지 (2~3줄, 가격 먼저)",
    "instagram": "인스타그램 캡션 + 해시태그 20개",
    "shortform": "숏폼 스크립트 15초 버전"
}`;

        const userPrompt = `제품 URL: ${productUrl}\n\n제품 페이지 내용(일부):\n${pageText}\n\n위 제품 정보를 바탕으로 마케팅 콘텐츠를 작성해주세요.`;

        // 3. Call Anthropic API Support 
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 1500,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        if (!claudeRes.ok) {
            const errText = await claudeRes.text();
            res.status(claudeRes.status).json({ error: `Anthropic API Error: ${errText}` });
            return;
        }

        const claudeData = await claudeRes.json();
        const textContent = claudeData.content?.[0]?.text || '';
        
        // Clean markdown backticks if Claude returns them
        const cleanedText = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
        const resultJson = JSON.parse(cleanedText);
        
        res.status(200).json(resultJson);

    } catch (err) {
        console.error("Vercel API Error:", err);
        res.status(500).json({ error: err.message });
    }
}
