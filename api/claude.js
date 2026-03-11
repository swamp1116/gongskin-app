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

        // 1. Scrape the URL content (Direct Fetch on Backend)
        let parsedInfo = {
            title: '',
            price: '',
            description: '',
            rawText: ''
        };

        try {
            // Fetch directly from the server (bypassing browser CORS) 
            // Mocking User-Agent helps bypass basic bot protections like Naver SmartStore
            const pageRes = await fetch(productUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            const html = await pageRes.text();

            // 1) Extract Meta Tags (og:title, og:description)
            const getMeta = (name) => {
                const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
                const match = html.match(regex);
                return match ? match[1] : '';
            };

            parsedInfo.title = getMeta('og:title') || getMeta('twitter:title');
            if (!parsedInfo.title) {
                const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch) parsedInfo.title = titleMatch[1].trim();
            }

            parsedInfo.description = getMeta('og:description') || getMeta('twitter:description');
            parsedInfo.price = getMeta('product:price:amount'); // Standard e-commerce meta tag

            // 2) Extract JSON-LD (Schema.org) for accurate product info (Price, Name, etc)
            const ldJsonRegex = /<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
            let ldMatch;
            while ((ldMatch = ldJsonRegex.exec(html)) !== null) {
                try {
                    const ldData = JSON.parse(ldMatch[1]);
                    const items = Array.isArray(ldData) ? ldData : [ldData];
                    for (const item of items) {
                        if (item.name && !parsedInfo.title) parsedInfo.title = item.name;
                        if (item.description && !parsedInfo.description) parsedInfo.description = item.description;
                        if (item.offers && item.offers.price) {
                            parsedInfo.price = item.offers.price;
                        } else if (item.offers && item.offers[0] && item.offers[0].price) {
                            parsedInfo.price = item.offers[0].price;
                        }
                    }
                } catch(e) {
                    // Ignore JSON parsing errors for individual blocks
                }
            }

            // 3) Extract raw text from body as fallback for Ingredients / Detailed features
            let bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            let bodyHtml = bodyMatch ? bodyMatch[1] : html;
            
            bodyHtml = bodyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
            bodyHtml = bodyHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
            bodyHtml = bodyHtml.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ');
            
            let text = bodyHtml.replace(/<[^>]+>/g, ' '); // Strip all remaining tags
            parsedInfo.rawText = text.replace(/\s+/g, ' ').trim().substring(0, 3000); // 3000 chars

        } catch (scrapeErr) {
            console.error("Scrape warning:", scrapeErr);
        }

        const pageContext = `
[파싱된 웹페이지 정보]
- 상품명: ${parsedInfo.title || '알 수 없음'}
- 가격: ${parsedInfo.price ? parsedInfo.price + '원' : '알 수 없음'}
- 상품설명(메타): ${parsedInfo.description || '없음'}
- 상세 텍스트(성분/특징 유추용): ${parsedInfo.rawText || '가져올 수 없음'}
        `.trim();

        // 2. Prepare Claude Prompt
        const systemPrompt = `당신은 공스킨 전용 콘텐츠 AI입니다. 
포지셔닝: 성분 좋은 화장품을 말도 안 되는 가격에.
톤: 직접적, 가격 먼저, 옆집 언니 느낌.
절대 쓰지 말 것: 럭셔리, 프리미엄, 기적, 완벽.

제공된 '[파싱된 웹페이지 정보]'를 바탕으로 제품의 이름, 가격, 성분, 특징을 정확히 추출하여 콘텐츠를 작성하세요.
만약 성분이 없는 제품(일반 생수, 향수 등)이라면 성분 대신 '주요 특징'이나 '활용 용도'를 강조해서 콘텐츠를 생성하세요.

사용자가 제품 URL을 제공하면, 반드시 아래 JSON 형식으로만 응답하세요. (마크다운 백틱 없이 순수 JSON만 반환)
{
    "kakao": "카카오 채널 메시지 (2~3줄, 가격 먼저)",
    "instagram": "인스타그램 캡션 + 해시태그 20개",
    "shortform": "숏폼 스크립트 15초 버전"
}`;

        const userPrompt = `제품 URL: ${productUrl}\n\n${pageContext}\n\n위 제품 정보를 바탕으로 마케팅 콘텐츠를 작성해주세요.`;

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
        
        // Robust JSON extraction
        // Find the first '{' and the last '}' to extract only the JSON object
        let jsonString = textContent;
        const startIndex = textContent.indexOf('{');
        const endIndex = textContent.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            jsonString = textContent.substring(startIndex, endIndex + 1);
        } else {
            // Clean markdown backticks as a fallback
            jsonString = textContent.replace(/```json/gi, '').replace(/```/g, '').trim();
        }

        try {
            const resultJson = JSON.parse(jsonString);
            res.status(200).json(resultJson);
        } catch (parseError) {
            console.error("Claude JSON Parse Error:", parseError, "Raw Response:", textContent);
            res.status(500).json({ 
                error: 'Claude가 반환한 결과를 처리할 수 없습니다.',
                details: parseError.message,
                rawResponse: textContent
            });
        }

    } catch (err) {
        console.error("Vercel API Error:", err);
        res.status(500).json({ error: err.message });
    }
}
