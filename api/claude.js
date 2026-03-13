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

        // 1. Scrape the URL content (Deep Crawling)
        let parsedInfo = {
            title: '',
            price: '',
            fullText: ''
        };

        try {
            const pageRes = await fetch(productUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            const html = await pageRes.text();

            // Extract basic meta tags
            const getMeta = (name) => {
                const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
                const match = html.match(regex);
                return match ? match[1] : '';
            };

            parsedInfo.title = getMeta('og:title') || html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || '';
            parsedInfo.price = getMeta('product:price:amount') || '';

            // Deep text extraction including alt tags
            let bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            let bodyHtml = bodyMatch ? bodyMatch[1] : html;
            
            // Remove scripts and styles
            bodyHtml = bodyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
            bodyHtml = bodyHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
            
            // Extract alt tags from images before stripping tags to preserve image context
            const altRegex = /<img[^>]*alt=["']([^"']+)["'][^>]*>/gi;
            let altTexts = [];
            let altMatch;
            while ((altMatch = altRegex.exec(bodyHtml)) !== null) {
                if (altMatch[1].trim()) altTexts.push(altMatch[1].trim());
            }

            // Strip remaining HTML
            let text = bodyHtml.replace(/<[^>]+>/g, ' '); 
            
            // Combine visible text + ALT text (which often contains the detailed long-image copy)
            let combinedText = text + "\n[이미지 텍스트 정보]\n" + altTexts.join(" ");
            parsedInfo.fullText = combinedText.replace(/\s+/g, ' ').trim().substring(0, 15000); // 15,000 chars for deep context

        } catch (scrapeErr) {
            console.error("Scrape error:", scrapeErr);
        }

        const pageContext = `
[웹페이지 정보 수집본]
- 상품명 추출: ${parsedInfo.title}
- 가격 추출: ${parsedInfo.price}
- 전체 상세페이지 내용 (성분/효능/용량/사용법 포함):
${parsedInfo.fullText}
        `.trim();

        // 2. Prepare Claude Prompt
        const systemPrompt = `당신은 10년 경력의 뷰티 MD입니다.
올리브영, 쿠팡, 네이버 스마트스토어의 유사 제품들을 분석하고
이 제품의 시장 포지셔닝과 SNS 전략을 수립합니다.
경쟁사 대비 이 제품이 이길 수 있는 포인트를 찾아내고,
실제 MD가 바이어에게 설명하듯 구체적이고 날카롭게 분석해주세요.
당신은 공스킨(GONGSKIN) 전용 콘텐츠 AI이기도 합니다.
포지셔닝: 성분 좋은 화장품을 말도 안 되는 가격에.
톤: 직접적, 가격 먼저, 옆집 언니 느낌.
절대 쓰지 말 것: 럭셔리, 프리미엄, 기적, 완벽

[수행 지시사항]
제공된 [웹페이지 정보 수집본]을 심층 분석하여 아래 5가지 결과물을 작성하세요.

1. SNS 콘텐츠 전략
형식:
[시장분석] 유사 제품 3개와 비교 (가격대/성분/포지셔닝)
[MD 한줄평] 이 제품의 진짜 경쟁력
[타겟페르소나] 구체적 인물 묘사 (나이/직업/고민/소비패턴)
[추천채널 + 이유] 채널별 전략 근거
[주간스케줄] 월~일 콘텐츠 플랜
[승부수] 경쟁제품 대비 SNS에서 이길 수 있는 핵심 전략 1가지

2. 소구포인트 3가지
형식:
소구포인트 1: [제목] - [설명]
소구포인트 2: [제목] - [설명]
소구포인트 3: [제목] - [설명]

3. 카카오 채널 메시지
- 2~3줄, 가격 먼저, 이모지 1~2개

4. 인스타그램 캡션
- 본문 + 해시태그 5개

5. 숏폼 스크립트
촬영 경험 없는 사람도 따라할 수 있게:

[0-3초] 훅
- 대사: "..."
- 구도: ...
- 연출: ...

[3-8초] 제품 소개
- 대사: "..."
- 구도: ...
- 연출: ...

[8-13초] 효능/소구
- 대사: "..."
- 구도: ...
- 연출: ...

[13-15초] CTA
- 대사: "..."
- 구도: ...
- 연출: ...

반드시 아래 JSON 형식으로만 응답하세요.
{
  "sns_strategy": "결과물 1 내용 (줄바꿈 포함)",
  "sogu_points": "결과물 2 내용 (줄바꿈 포함)",
  "kakao": "결과물 3 내용 (줄바꿈 포함)",
  "instagram": "결과물 4 내용 (줄바꿈 포함)",
  "shortform": "결과물 5 내용 (줄바꿈 포함)"
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
