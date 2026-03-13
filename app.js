document.addEventListener('DOMContentLoaded', () => {
    
    // Elements
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const apiModalOverlay = document.getElementById('apiModalOverlay');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    
    const productForm = document.getElementById('productForm');
    const generateBtn = document.getElementById('generateBtn');
    const btnText = generateBtn.querySelector('.btn-text');
    const spinner = document.getElementById('mainSpinner');
    const loadingText = document.getElementById('loadingText');
    
    const emptyState = document.getElementById('emptyState');
    const resultsContainer = document.getElementById('resultsContainer');
    
    const snsStrategyCard = document.getElementById('snsStrategyCard');
    const snsStrategyResult = document.getElementById('snsStrategyResult');

    const soguPointsCard = document.getElementById('soguPointsCard');
    const soguResult = document.getElementById('soguResult');

    const kakaoResult = document.getElementById('kakaoResult');
    const instagramResult = document.getElementById('instagramResult');
    const shortformResult = document.getElementById('shortformResult');
    const copyBtns = document.querySelectorAll('.copy-btn');
    const toast = document.getElementById('toast');

    const STORAGE_KEY = 'gongskin_claude_api_key';

    // Initialize Modal and API Key
    const savedKey = localStorage.getItem(STORAGE_KEY);
    
    if (!savedKey) {
        // Show modal on first load if no key
        apiModalOverlay.classList.add('active');
    } else {
        apiKeyInput.value = savedKey;
    }

    openSettingsBtn.addEventListener('click', () => {
        apiKeyInput.value = localStorage.getItem(STORAGE_KEY) || '';
        apiModalOverlay.classList.add('active');
    });

    closeModalBtn.addEventListener('click', () => {
        apiModalOverlay.classList.remove('active');
    });

    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem(STORAGE_KEY, key);
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

        try {
            const content = await generateMarketingContent(apiKey, productUrl);
            displayResults(content);
        } catch (error) {
            console.error('Error:', error);
            alert(`오류가 발생했습니다: ${error.message}\nAPI 키가 올바른지 확인해주세요.`);
        } finally {
            setLoadingState(false);
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
            loadingText.style.display = 'inline-block';
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
            loadingText.style.display = 'none';
        }
    }

    function displayResults(content) {
        if(emptyState) emptyState.style.display = 'none';
        if(resultsContainer) resultsContainer.style.display = 'flex';
        
        // Render 5 Elements
        if(snsStrategyResult) snsStrategyResult.textContent = content.sns_strategy || '결과 없음';
        if(soguResult) soguResult.textContent = content.sogu_points || '결과 없음';
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
                showToast('복사됨!');
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
