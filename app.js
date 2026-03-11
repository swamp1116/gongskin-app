document.addEventListener('DOMContentLoaded', () => {
    
    // Elements
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const apiModalOverlay = document.getElementById('apiModalOverlay');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const googleApiKeyInput = document.getElementById('googleApiKeyInput');
    
    const productForm = document.getElementById('productForm');
    const generateBtn = document.getElementById('generateBtn');
    const btnText = generateBtn.querySelector('.btn-text');
    const spinner = generateBtn.querySelector('.spinner');
    
    const generateImageBtn = document.getElementById('generateImageBtn');
    const imgBtnText = generateImageBtn.querySelector('.btn-text');
    const imgSpinner = document.querySelector('.spinner-img');
    
    const emptyState = document.getElementById('emptyState');
    const resultsContainer = document.getElementById('resultsContainer');
    
    const soguPointsCard = document.getElementById('soguPointsCard');
    const soguResult = document.getElementById('soguResult');

    const kakaoResult = document.getElementById('kakaoResult');
    const instagramResult = document.getElementById('instagramResult');
    const shortformResult = document.getElementById('shortformResult');
    const copyBtns = document.querySelectorAll('.copy-btn');
    const toast = document.getElementById('toast');

    const imageResultContainer = document.getElementById('imageResultContainer');
    const generatedImage = document.getElementById('generatedImage');

    const STORAGE_KEY = 'gongskin_claude_api_key';
    const GOOGLE_STORAGE_KEY = 'gongskin_google_api_key';

    // To store context for image generation
    let currentProductContext = '';

    // Initialize Modal and API Key
    const savedKey = localStorage.getItem(STORAGE_KEY);
    const savedGoogleKey = localStorage.getItem(GOOGLE_STORAGE_KEY);
    
    if (!savedKey) {
        // Show modal on first load if no key
        apiModalOverlay.classList.add('active');
    } else {
        apiKeyInput.value = savedKey;
        googleApiKeyInput.value = savedGoogleKey || '';
    }

    openSettingsBtn.addEventListener('click', () => {
        apiKeyInput.value = localStorage.getItem(STORAGE_KEY) || '';
        googleApiKeyInput.value = localStorage.getItem(GOOGLE_STORAGE_KEY) || '';
        apiModalOverlay.classList.add('active');
    });

    closeModalBtn.addEventListener('click', () => {
        apiModalOverlay.classList.remove('active');
    });

    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const googleKey = googleApiKeyInput.value.trim();
        if (key) {
            localStorage.setItem(STORAGE_KEY, key);
            
            if (googleKey) {
                localStorage.setItem(GOOGLE_STORAGE_KEY, googleKey);
            }
            
            apiModalOverlay.classList.remove('active');
            showToast('API 키 설정이 저장되었습니다.');
        } else {
            alert('Claude API 키는 필수입니다.');
        }
    });

    // Form Submit handling
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const apiKey = localStorage.getItem(STORAGE_KEY);
        if (!apiKey) {
            alert('설정 메뉴(우측 상단 톱니바퀴)에서 API 키를 먼저 설정해주세요.');
            apiModalOverlay.classList.add('active');
            return;
        }

        const productUrl = document.getElementById('productUrl').value.trim();

        setLoadingState(true);
        generateImageBtn.disabled = true;

        try {
            const content = await generateMarketingContent(apiKey, productUrl);
            currentProductContext = content.kakao + " " + content.instagram;
            displayResults(content);
            generateImageBtn.disabled = false;
        } catch (error) {
            console.error('Error:', error);
            alert(`오류가 발생했습니다: ${error.message}\nAPI 키가 올바른지 확인해주세요.`);
        } finally {
            setLoadingState(false);
        }
    });

    // Handle Image Generation
    generateImageBtn.addEventListener('click', async () => {
        const googleKey = localStorage.getItem(GOOGLE_STORAGE_KEY);
        if (!googleKey) {
            alert('설정 메뉴(우측 상단 톱니바퀴)에서 Google Gemini API 키를 먼저 설정해주세요.');
            apiModalOverlay.classList.add('active');
            return;
        }

        const productUrl = document.getElementById('productUrl').value.trim();
        
        setImageLoadingState(true);

        try {
            const response = await fetch('/api/image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-google-api-key': googleKey
                },
                body: JSON.stringify({ 
                    productUrl: productUrl,
                    productContext: currentProductContext 
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `이미지 서버 오류 (${response.status})`);
            }

            const data = await response.json();
            
            let base64Image = '';
            
            // Handle Imagen 3 predict API format
            if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
                 base64Image = data.predictions[0].bytesBase64Encoded;
            } else {
                 throw new Error('API 응답에 이미지 데이터가 없습니다.');
            }

            // Display Image
            imageResultContainer.style.display = 'flex';
            generatedImage.style.display = 'block';
            generatedImage.src = `data:image/jpeg;base64,${base64Image}`;

            showToast('이미지가 성공적으로 생성되었습니다!');
            
        } catch (error) {
            console.error('Image Error:', error);
            alert(`이미지 생성 실패: ${error.message}`);
        } finally {
            setImageLoadingState(false);
        }
    });

    // Generate Marketing Content via Claude API with CORS Proxy
    async function generateMarketingContent(apiKey, productUrl) {
        
        const response = await fetch('/api/claude', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({ productUrl })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `서버 오류가 발생했습니다. (${response.status})`);
        }

        const data = await response.json();
        return data;
    }

    function setLoadingState(isLoading) {
        generateBtn.disabled = isLoading;
        if (isLoading) {
            btnText.style.display = 'none';
            spinner.style.display = 'inline-block';
            emptyState.style.display = 'flex';
            resultsContainer.style.display = 'none';
            // Re-trigger animations
            const cards = document.querySelectorAll('.result-card');
            cards.forEach(card => {
                card.style.animation = 'none';
                card.offsetHeight; // trigger reflow
                card.style.animation = null; 
            });
        } else {
            btnText.style.display = 'inline-block';
            spinner.style.display = 'none';
        }
    }

    function setImageLoadingState(isLoading) {
        generateImageBtn.disabled = isLoading;
        if (isLoading) {
            imgBtnText.style.display = 'none';
            imgSpinner.style.display = 'inline-block';
            // Also enforce class for rotation just in case
            imgSpinner.classList.add('spinner'); 
        } else {
            imgBtnText.style.display = 'inline-block';
            imgSpinner.style.display = 'none';
            imgSpinner.classList.remove('spinner');
        }
    }

    function displayResults(content) {
        if(emptyState) emptyState.style.display = 'none';
        if(resultsContainer) resultsContainer.style.display = 'flex';
        
        // Render Sogu Points
        if (soguResult && content.sogu_points && Array.isArray(content.sogu_points)) {
            const soguText = content.sogu_points.map(sp => `소구포인트 ${sp.id}: [${sp.title}] - ${sp.desc}`).join('\n');
            soguResult.textContent = soguText;
            soguPointsCard.style.display = 'block';
        } else if (soguPointsCard) {
            soguPointsCard.style.display = 'none';
        }

        if(kakaoResult) kakaoResult.textContent = content.kakao || '결과 없음';
        if(instagramResult) instagramResult.textContent = content.instagram || '결과 없음';
        if(shortformResult) shortformResult.textContent = content.shortform || '결과 없음';
    }

    // Copy to Clipboard
    copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const element = document.getElementById(targetId);
            const textToCopy = element.textContent;
            
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast('텍스트가 클립보드에 복사되었습니다!');
            }).catch(err => {
                console.error('Copy failed', err);
                alert('복사에 실패했습니다.');
            });
        });
    });

    // Toast Notification
    let toastTimeout;
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

});
