/* ============================================
   Xem Phim Cùng Xám - Application Logic
   ============================================ */

// ====== MULTI-SOURCE CONFIG ======
const SOURCES = {
    nguonc: {
        name: 'Chu Hun Xu lu gi',
        api: 'https://phim.nguonc.com/api',
        imgDomain: '',
        type: 'v2', // NguonC schema
        logo: 'https://tinhlagi.pro/home/nguonC.png'
    },
    ophim: {
        name: 'Người lỳ hợp tính',
        api: 'https://ophim1.com',
        imgDomain: 'https://img.ophim.live/uploads/movies/',
        type: 'v1', // Ophim schema
        logo: 'https://tinhlagi.pro/home/ophim.ico'
    },
    kkphim: {
        name: 'Người tình hợp lý',
        api: 'https://phimapi.com',
        imgDomain: 'https://phimimg.com/',
        type: 'v1', // PhimAPI schema
        logo: 'https://tinhlagi.pro/home/kkphim.png'
    }
};

let currentSource = localStorage.getItem('xpcx_source') || 'nguonc';
if (!SOURCES[currentSource]) currentSource = 'nguonc';
let currentConfig = SOURCES[currentSource];

window._currentParam = null;
window._currentExtra = null;

// --- State ---
let currentPage = 'home';
let heroInterval = null;
let searchTimeout = null;

// --- Utility Functions ---
function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }

/**
 * Fix poster/thumb URL from API.
 */
function getImgUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    
    const cdn = currentConfig.imgDomain;
    if (!cdn) return url;
    
    if (cdn.endsWith('/') && url.startsWith('/')) return cdn + url.substring(1);
    if (!cdn.endsWith('/') && !url.startsWith('/')) return cdn + '/' + url;
    return cdn + url;
}

function truncate(str, len = 150) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

function showToast(message, icon = '✓') {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>${icon}</span> ${message}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// --- Source Switcher UI ---
function renderSourcePicker() {
    const container = $('sourcePicker');
    if (!container) return;
    
    let html = '';
    for (const [key, config] of Object.entries(SOURCES)) {
        html += `<button class="source-btn ${key === currentSource ? 'active' : ''}" onclick="setSource('${key}')">
            <img src="${config.logo}" alt="${config.name}" onerror="this.src='https://placehold.co/16x16/222/FFF?text=${config.name.charAt(0)}'">
            ${config.name}
        </button>`;
    }
    container.innerHTML = html;
}

function setSource(srcKey) {
    if (!SOURCES[srcKey] || srcKey === currentSource) return;
    currentSource = srcKey;
    currentConfig = SOURCES[srcKey];
    localStorage.setItem('xpcx_source', srcKey);
    renderSourcePicker();
    // Reload the current page
    navigateTo(currentPage, window._currentParam, window._currentExtra);
}

// --- API Fetching ---
async function fetchAPI(path) {
    try {
        const res = await fetch(`${currentConfig.api}${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        return null;
    }
}

// Unified List Normalization wrapper for v1/v2 endpoints
function normalizeList(res) {
    if (!res) return null;
    // v1 generic lists inside data.items
    if (res.data && res.data.items) return res; 
    // v2 or root lists
    if (!res.items) return null;
    
    // Fallback pagination extraction
    const totalPages = res.paginate?.total_page || res.pagination?.totalPages || 1;
    const currentPageInfo = res.paginate?.current_page || res.pagination?.currentPage || 1;
    
    return { data: { items: res.items, params: { pagination: { totalPages: totalPages, currentPage: currentPageInfo } } } };
}

// Path Builder functions based on config
async function fetchMovieList(page = 1) {
    const path = currentConfig.type === 'v1' ? `/danh-sach/phim-moi-cap-nhat?page=${page}` : `/films/phim-moi-cap-nhat?page=${page}`;
    return fetchAPI(path);
}

async function fetchMovieDetail(slug) {
    const path = currentConfig.type === 'v1' ? `/phim/${slug}` : `/film/${slug}`;
    const data = await fetchAPI(path);
    return data;
}

async function searchMovies(keyword, page = 1) {
    const path = currentConfig.type === 'v1' ? `/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=24&page=${page}` : `/films/search?keyword=${encodeURIComponent(keyword)}&page=${page}`;
    return normalizeList(await fetchAPI(path));
}

async function fetchByGenre(slug, page = 1) {
    const path = currentConfig.type === 'v1' ? `/v1/api/the-loai/${slug}?limit=24&page=${page}` : `/films/the-loai/${slug}?page=${page}`;
    return normalizeList(await fetchAPI(path));
}

async function fetchByCountry(slug, page = 1) {
    const path = currentConfig.type === 'v1' ? `/v1/api/quoc-gia/${slug}?limit=24&page=${page}` : `/films/quoc-gia/${slug}?page=${page}`;
    return normalizeList(await fetchAPI(path));
}

async function fetchCategory(type, page = 1) {
    const path = currentConfig.type === 'v1' ? `/v1/api/danh-sach/${type}?limit=24&page=${page}` : `/films/danh-sach/${type}?page=${page}`;
    return normalizeList(await fetchAPI(path));
}

// --- Favorites Manager ---
const Favorites = {
    KEY: 'xpcx_favorites',
    getAll() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
    add(movie) {
        const favs = this.getAll();
        if (!favs.find(f => f.slug === movie.slug)) {
            favs.unshift({ slug: movie.slug, name: movie.name, origin_name: movie.origin_name || '', poster_url: movie.poster_url, thumb_url: movie.thumb_url, year: movie.year, quality: movie.quality || '', lang: movie.lang || '', episode_current: movie.episode_current || '' });
            localStorage.setItem(this.KEY, JSON.stringify(favs));
            showToast('Đã thêm vào yêu thích!', '❤️');
        }
    },
    remove(slug) {
        const favs = this.getAll().filter(f => f.slug !== slug);
        localStorage.setItem(this.KEY, JSON.stringify(favs));
        showToast('Đã xóa khỏi yêu thích', '💔');
    },
    has(slug) { return this.getAll().some(f => f.slug === slug); },
    toggle(movie) {
        if (this.has(movie.slug)) { this.remove(movie.slug); return false; }
        else { this.add(movie); return true; }
    }
};

// --- Watch History Manager ---
const History = {
    KEY: 'xpcx_history',
    MAX: 50,
    getAll() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
    add(movie, episode = '') {
        let hist = this.getAll().filter(h => h.slug !== movie.slug);
        hist.unshift({ slug: movie.slug, name: movie.name, poster_url: movie.poster_url, episode: episode, time: Date.now() });
        if (hist.length > this.MAX) hist = hist.slice(0, this.MAX);
        localStorage.setItem(this.KEY, JSON.stringify(hist));
    },
    remove(slug) { const hist = this.getAll().filter(h => h.slug !== slug); localStorage.setItem(this.KEY, JSON.stringify(hist)); }
};

// --- Theme ---
function initTheme() {
    const saved = localStorage.getItem('xpcx_theme');
    if (saved === 'light') document.documentElement.classList.remove('dark');
    else document.documentElement.classList.add('dark');
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('xpcx_theme', isDark ? 'dark' : 'light');
}

// --- Search ---
function toggleSearch() {
    const box = $('searchBox');
    const results = $('searchResults');
    box.classList.toggle('active');
    if (box.classList.contains('active')) {
        $('searchInput').focus();
    } else {
        $('searchInput').value = '';
        results.classList.remove('active');
        results.innerHTML = '';
    }
}

function initSearch() {
    const input = $('searchInput');
    if (!input) return;
    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = input.value.trim();
        if (q.length < 2) { $('searchResults').classList.remove('active'); return; }
        searchTimeout = setTimeout(async () => {
            const data = await searchMovies(q);
            renderSearchResults(data);
        }, 400);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleSearch();
        if (e.key === 'Enter') {
            const q = input.value.trim();
            if (q.length >= 1) { 
                toggleSearch(); 
                navigateTo('search', q); 
            }
        }
    });
    // Close search when clicking outside
    document.addEventListener('click', (e) => {
        const wrapper = $('searchWrapper');
        if (wrapper && !wrapper.contains(e.target) && $('searchBox').classList.contains('active')) {
            toggleSearch();
        }
    });
}

function renderSearchResults(data) {
    const container = $('searchResults');
    if (!data || !data.data || !data.data.items || data.data.items.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px"><p>Không tìm thấy kết quả</p></div>';
        container.classList.add('active');
        return;
    }
    const items = data.data.items.slice(0, 8);
    container.innerHTML = items.map(m => {
        const poster = getImgUrl(m.poster_url);
        return `
        <div class="search-result-item" onclick="toggleSearch(); navigateTo('detail', '${m.slug}')">
            <img src="${poster}" alt="${m.name}" onerror="this.outerHTML='<div class=\\'img-error\\' style=\\'width:60px;height:80px;font-size:24px\\'>🎬</div>'">
            <div class="search-result-info">
                <h4>${m.name}</h4>
                <p>${m.original_name || m.origin_name || ''} ${m.year ? '• ' + m.year : ''}</p>
            </div>
        </div>`;
    }).join('');
    container.classList.add('active');
}

// --- Mobile Menu ---
function toggleMobileMenu() {
    $('mobileMenu').classList.toggle('active');
    $('mobileMenuOverlay').classList.toggle('active');
    document.body.style.overflow = $('mobileMenu').classList.contains('active') ? 'hidden' : '';
}

// --- Navigation ---
function navigateTo(page, param = '', extra = '') {
    currentPage = page;
    window._currentParam = param;
    window._currentExtra = extra;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $$('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-link[data-page="${param || page}"]`);
    if (activeLink) activeLink.classList.add('active');
    if (heroInterval) { clearInterval(heroInterval); heroInterval = null; }
    switch(page) {
        case 'home': renderHomePage(); break;
        case 'detail': renderDetailPage(param); break;
        case 'category': renderCategoryPage(param, parseInt(extra) || 1); break;
        case 'genre': renderGenrePage(param, parseInt(extra) || 1); break;
        case 'country': renderCountryPage(param, parseInt(extra) || 1); break;
        case 'search': renderSearchPage(param, parseInt(extra) || 1); break;
        case 'favorites': renderFavoritesPage(); break;
        case 'history': renderHistoryPage(); break;
    }
}

// --- Movie Card HTML ---
function movieCardHTML(movie) {
    const posterUrl = getImgUrl(movie.poster_url);
    const isFav = Favorites.has(movie.slug);
    const quality = movie.quality || '';
    const lang = movie.lang || '';
    const episode = movie.current_episode || movie.episode_current || '';
    const origin_name = movie.original_name || movie.origin_name || '';
    const movieData = JSON.stringify({slug:movie.slug,name:movie.name,origin_name:origin_name,poster_url:movie.poster_url,thumb_url:movie.thumb_url||'',year:movie.year,quality:quality,lang:lang,episode_current:episode}).replace(/"/g, '&quot;');

    return `
    <div class="movie-card" onclick="navigateTo('detail', '${movie.slug}')">
        <div class="movie-poster">
            <img src="${posterUrl}" alt="${movie.name}" loading="lazy"
                 onerror="this.outerHTML='<div class=\\'img-error\\'>🎬</div>'">
            <div class="movie-badges">
                ${quality ? `<span class="movie-badge quality">${quality}</span>` : ''}
                ${episode ? `<span class="movie-badge episode">${episode}</span>` : ''}
            </div>
            <div class="movie-overlay">
                <div class="play-btn-overlay">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
            </div>
            <button class="movie-fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFav(this, ${movieData})" title="${isFav ? 'Bỏ yêu thích' : 'Yêu thích'}">
                <svg viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>
            </button>
        </div>
        <div class="movie-info">
            <div class="movie-title">${movie.name}</div>
            <div class="movie-meta">
                ${movie.year ? `<span>📅 ${movie.year}</span>` : ''}
                ${lang ? `<span>${lang}</span>` : ''}
            </div>
        </div>
    </div>`;
}

function toggleFav(btn, movie) {
    const isNowFav = Favorites.toggle(movie);
    btn.classList.toggle('active', isNowFav);
}

function skeletonGrid(count = 12) {
    return `<div class="movie-grid">${Array(count).fill('<div class="skeleton skeleton-card"></div>').join('')}</div>`;
}

// --- Pagination ---
function paginationHTML(current, total, onClick) {
    if (total <= 1) return '';
    let pages = [];
    const maxShow = 5;
    let start = Math.max(1, current - Math.floor(maxShow / 2));
    let end = Math.min(total, start + maxShow - 1);
    if (end - start < maxShow - 1) start = Math.max(1, end - maxShow + 1);
    pages.push(`<button class="page-btn" ${current <= 1 ? 'disabled' : ''} onclick="${onClick}(${current - 1})">‹</button>`);
    if (start > 1) {
        pages.push(`<button class="page-btn" onclick="${onClick}(1)">1</button>`);
        if (start > 2) pages.push(`<span class="page-btn" style="border:none;cursor:default">…</span>`);
    }
    for (let i = start; i <= end; i++) {
        pages.push(`<button class="page-btn ${i === current ? 'active' : ''}" onclick="${onClick}(${i})">${i}</button>`);
    }
    if (end < total) {
        if (end < total - 1) pages.push(`<span class="page-btn" style="border:none;cursor:default">…</span>`);
        pages.push(`<button class="page-btn" onclick="${onClick}(${total})">${total}</button>`);
    }
    pages.push(`<button class="page-btn" ${current >= total ? 'disabled' : ''} onclick="${onClick}(${current + 1})">›</button>`);
    return `<div class="pagination">${pages.join('')}</div>`;
}

// ============ PAGE RENDERERS ============

// --- HOME ---
async function renderHomePage() {
    const main = $('mainContent');
    main.innerHTML = `
        <div class="hero-banner"><div class="hero-slider" id="heroSlider"></div><div class="hero-dots" id="heroDots"></div></div>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">🔥</span> Phim Mới Cập Nhật</h2></div>
        ${skeletonGrid(12)}`;

    const data = await fetchMovieList(1);
    if (!data || !data.items) {
        main.innerHTML = '<div class="empty-state"><div class="empty-icon">😵</div><h3>Không thể tải dữ liệu</h3><p>Vui lòng thử lại sau</p></div>';
        return;
    }

    const heroMovies = data.items.slice(0, 5);
    const gridHTML = data.items.map(m => movieCardHTML(m)).join('');

    main.innerHTML = `
        <div class="hero-banner"><div class="hero-slider" id="heroSlider"></div><div class="hero-dots" id="heroDots"></div></div>
        <div class="section-header">
            <h2 class="section-title"><span class="title-icon">🔥</span> Phim Mới Cập Nhật</h2>
            <a href="#" class="section-more" onclick="navigateTo('category', 'phim-moi-cap-nhat'); return false;">Xem thêm →</a>
        </div>
        <div class="movie-grid">${gridHTML}</div>`;

    renderHero(heroMovies);
}

function renderHero(movies) {
    const slider = $('heroSlider');
    const dots = $('heroDots');
    if (!slider || !dots || !movies.length) return;

    slider.innerHTML = movies.map((m, i) => `
        <div class="hero-slide ${i === 0 ? 'active' : ''}" onclick="navigateTo('detail', '${m.slug}')">
            <div class="hero-slide-bg" style="background-image: url('${getImgUrl(m.thumb_url || m.poster_url)}')"></div>
            <div class="hero-slide-content">
                <div class="hero-info">
                    <div class="hero-badges">
                        ${m.quality ? `<span class="hero-badge badge-quality">${m.quality}</span>` : ''}
                        ${m.lang ? `<span class="hero-badge badge-lang">${m.lang}</span>` : ''}
                        ${m.year ? `<span class="hero-badge badge-year">${m.year}</span>` : ''}
                        ${(m.episode_current || m.current_episode) ? `<span class="hero-badge badge-episode">${m.episode_current || m.current_episode}</span>` : ''}
                    </div>
                    <h2 class="hero-title">${m.name}</h2>
                    <p class="hero-subtitle">${m.original_name || m.origin_name || ''}</p>
                    <div class="hero-btns">
                        <button class="btn btn-primary" onclick="event.stopPropagation(); navigateTo('detail', '${m.slug}')">
                            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            Xem Ngay
                        </button>
                    </div>
                </div>
            </div>
        </div>`).join('');

    dots.innerHTML = movies.map((_, i) => `<div class="hero-dot ${i === 0 ? 'active' : ''}" onclick="slideHero(${i})"></div>`).join('');

    let current = 0;
    if (heroInterval) clearInterval(heroInterval);
    heroInterval = setInterval(() => { current = (current + 1) % movies.length; slideHero(current); }, 5000);
}

function slideHero(index) {
    $$('.hero-slide').forEach((s, i) => s.classList.toggle('active', i === index));
    $$('.hero-dot').forEach((d, i) => d.classList.toggle('active', i === index));
}

// --- CATEGORY ---
async function renderCategoryPage(type, page = 1) {
    const main = $('mainContent');
    const typeNames = { 'phim-bo': 'Phim Bộ', 'phim-le': 'Phim Lẻ', 'hoat-hinh': 'Hoạt Hình', 'tv-shows': 'TV Shows', 'phim-chieu-rap': 'Chiếu Rạp', 'phim-moi-cap-nhat': 'Phim Mới' };
    const title = typeNames[type] || type;

    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span class="current">${title}</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">📺</span> ${title}</h2></div>
        ${skeletonGrid(18)}`;

    let data;
    if (type === 'phim-moi-cap-nhat') {
        data = await fetchMovieList(page);
        if (data) data = normalizeList(data);
    } else {
        const path = currentConfig.type === 'v1' ? `/v1/api/danh-sach/${type}?limit=24&page=${page}` : `/films/danh-sach/${type}?page=${page}`;
        data = normalizeList(await fetchAPI(path));
    }

    if (!data || !data.data || !data.data.items) {
        main.innerHTML = '<div class="empty-state"><div class="empty-icon">😵</div><h3>Không thể tải dữ liệu</h3></div>';
        return;
    }

    const items = data.data.items;
    const pagination = data.data.params?.pagination || {};
    const totalPages = pagination.totalPages || 1;
    const currentPg = pagination.currentPage || page;

    window._catPage = (p) => navigateTo('category', type, p);

    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span class="current">${title}</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">📺</span> ${title}</h2></div>
        <div class="movie-grid">${items.map(m => movieCardHTML(m)).join('')}</div>
        ${paginationHTML(currentPg, totalPages, '_catPage')}`;
}

// --- GENRE ---
async function renderGenrePage(slug, page = 1) {
    const genreNames = {
        'hanh-dong':'Hành Động','co-trang':'Cổ Trang','chien-tranh':'Chiến Tranh',
        'vien-tuong':'Viễn Tưởng','kinh-di':'Kinh Dị','tai-lieu':'Tài Liệu',
        'bi-an':'Bí Ẩn','tinh-cam':'Tình Cảm','tam-ly':'Tâm Lý',
        'the-thao':'Thể Thao','phieu-luu':'Phiêu Lưu','am-nhac':'Âm Nhạc',
        'gia-dinh':'Gia Đình','hoc-duong':'Học Đường','hai-huoc':'Hài Hước',
        'hinh-su':'Hình Sự','vo-thuat':'Võ Thuật','khoa-hoc':'Khoa Học',
        'than-thoai':'Thần Thoại','chinh-kich':'Chính Kịch','kinh-dien':'Kinh Điển'
    };
    const title = genreNames[slug] || slug;
    const main = $('mainContent');

    const filterTags = Object.entries(genreNames).map(([s, n]) =>
        `<button class="filter-tag ${s === slug ? 'active' : ''}" onclick="navigateTo('genre', '${s}')">${n}</button>`
    ).join('');

    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span>Thể Loại</span><span class="separator">›</span><span class="current">${title}</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">🎭</span> Thể Loại: ${title}</h2></div>
        <div class="filter-tags">${filterTags}</div>
        ${skeletonGrid(18)}`;

    const data = await fetchByGenre(slug, page);
    if (!data || !data.data || !data.data.items || data.data.items.length === 0) {
        main.innerHTML = `
            <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span>Thể Loại</span><span class="separator">›</span><span class="current">${title}</span></nav>
            <div class="section-header"><h2 class="section-title"><span class="title-icon">🎭</span> Thể Loại: ${title}</h2></div>
            <div class="filter-tags">${filterTags}</div>
            <div class="empty-state"><div class="empty-icon">🎬</div><h3>Không tìm thấy phim</h3></div>`;
        return;
    }

    const items = data.data.items;
    const pagination = data.data.params?.pagination || {};
    const totalPages = pagination.totalPages || 1;
    const currentPg = pagination.currentPage || page;

    window._genrePage = (p) => navigateTo('genre', slug, p);

    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span>Thể Loại</span><span class="separator">›</span><span class="current">${title}</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">🎭</span> Thể Loại: ${title}</h2></div>
        <div class="filter-tags">${filterTags}</div>
        <div class="movie-grid">${items.map(m => movieCardHTML(m)).join('')}</div>
        ${paginationHTML(currentPg, totalPages, '_genrePage')}`;
}

// --- COUNTRY ---
async function renderCountryPage(slug, page = 1) {
    const countryNames = {
        'trung-quoc':'Trung Quốc','han-quoc':'Hàn Quốc','nhat-ban':'Nhật Bản',
        'thai-lan':'Thái Lan','au-my':'Âu Mỹ','dai-loan':'Đài Loan',
        'hong-kong':'Hồng Kông','an-do':'Ấn Độ','anh':'Anh',
        'phap':'Pháp','canada':'Canada','duc':'Đức',
        'tho-nhi-ky':'Thổ Nhĩ Kỳ','nga':'Nga','viet-nam':'Việt Nam',
        'indonesia':'Indonesia','brazil':'Brazil','philippines':'Philippines',
        'tay-ban-nha':'Tây Ban Nha'
    };
    const title = countryNames[slug] || slug;
    const main = $('mainContent');

    const filterTags = Object.entries(countryNames).map(([s, n]) =>
        `<button class="filter-tag ${s === slug ? 'active' : ''}" onclick="navigateTo('country', '${s}')">${n}</button>`
    ).join('');

    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span>Quốc Gia</span><span class="separator">›</span><span class="current">${title}</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">🌍</span> Quốc Gia: ${title}</h2></div>
        <div class="filter-tags">${filterTags}</div>
        ${skeletonGrid(18)}`;

    const data = await fetchByCountry(slug, page);
    if (!data || !data.data || !data.data.items || data.data.items.length === 0) {
        main.innerHTML = `
            <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span>Quốc Gia</span><span class="separator">›</span><span class="current">${title}</span></nav>
            <div class="section-header"><h2 class="section-title"><span class="title-icon">🌍</span> Quốc Gia: ${title}</h2></div>
            <div class="filter-tags">${filterTags}</div>
            <div class="empty-state"><div class="empty-icon">🌍</div><h3>Không tìm thấy phim</h3></div>`;
        return;
    }

    const items = data.data.items;
    const pagination = data.data.params?.pagination || {};
    const totalPages = pagination.totalPages || 1;
    const currentPg = pagination.currentPage || page;

    window._countryPage = (p) => navigateTo('country', slug, p);

    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span>Quốc Gia</span><span class="separator">›</span><span class="current">${title}</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">🌍</span> Quốc Gia: ${title}</h2></div>
        <div class="filter-tags">${filterTags}</div>
        <div class="movie-grid">${items.map(m => movieCardHTML(m)).join('')}</div>
        ${paginationHTML(currentPg, totalPages, '_countryPage')}`;
}

// --- SEARCH ---
async function renderSearchPage(keyword, page = 1) {
    const main = $('mainContent');
    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span class="current">Tìm kiếm: "${keyword}"</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">🔍</span> Kết quả: "${keyword}"</h2></div>
        ${skeletonGrid(12)}`;

    const data = await searchMovies(keyword, page);
    if (!data || !data.data || !data.data.items || data.data.items.length === 0) {
        main.innerHTML = `
            <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span class="current">Tìm kiếm</span></nav>
            <div class="empty-state"><div class="empty-icon">🔍</div><h3>Không tìm thấy kết quả cho "${keyword}"</h3><p>Hãy thử từ khóa khác nhé!</p></div>`;
        return;
    }

    const items = data.data.items;
    const pagination = data.data.params?.pagination || {};
    const totalPages = pagination.totalPages || 1;
    const currentPg = pagination.currentPage || page;

    window._searchPage = (p) => navigateTo('search', keyword, p);

    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span class="current">Tìm kiếm: "${keyword}"</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">🔍</span> Kết quả: "${keyword}" (${pagination.totalItems || items.length} phim)</h2></div>
        <div class="movie-grid">${items.map(m => movieCardHTML(m)).join('')}</div>
        ${paginationHTML(currentPg, totalPages, '_searchPage')}`;
}

// --- DETAIL ---
async function renderDetailPage(slug) {
    const main = $('mainContent');
    main.innerHTML = `<div style="padding:60px 0; text-align:center;"><div class="loader-ring" style="margin:0 auto 16px;width:40px;height:40px;border:3px solid var(--border-color);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite"></div><p style="color:var(--text-muted)">Đang tải thông tin phim...</p></div>`;

    const data = await fetchMovieDetail(slug);
    if (!data || !data.movie) {
        main.innerHTML = '<div class="empty-state"><div class="empty-icon">😵</div><h3>Không tìm thấy phim</h3><p>Phim này có thể đã bị xóa hoặc đường dẫn không hợp lệ.</p></div>';
        return;
    }

    const m = data.movie;
    const episodes = m.episodes || data.episodes || [];
    History.add(m);

    const isFav = Favorites.has(m.slug);
    let categoriesList = [];
    let countriesList = [];
    
    // NguonC group format parsing
    if (m.category && !Array.isArray(m.category) && typeof m.category === 'object') {
        Object.values(m.category).forEach(cat => {
            if (cat.group?.name === 'Thể loại') categoriesList = cat.list || [];
            if (cat.group?.name === 'Quốc gia') countriesList = cat.list || [];
        });
    } else {
        // PhimAPI array format fallback
        categoriesList = m.category || [];
        countriesList = m.country || [];
    }

    const categories = categoriesList.map(c => `<a href="#" onclick="navigateTo('genre', '${c.slug}'); return false;">${c.name}</a>`).join(', ');
    const countries = countriesList.map(c => `<a href="#" onclick="navigateTo('country', '${c.slug}'); return false;">${c.name}</a>`).join(', ');
    const actors = Array.isArray(m.actor) ? m.actor.join(', ') : (m.actor || m.casts || '');
    const directors = Array.isArray(m.director) ? m.director.join(', ') : (m.director || '');

    const origin_name = m.original_name || m.origin_name || '';
    const episode_current = m.current_episode || m.episode_current || '';
    const favData = JSON.stringify({slug:m.slug,name:m.name,origin_name:origin_name,poster_url:m.poster_url,thumb_url:m.thumb_url,year:m.year,quality:m.quality,lang:m.lang,episode_current:episode_current}).replace(/"/g,'&quot;');

    let episodeHTML = '';
    if (episodes.length > 0) {
        episodes.forEach(server => {
            const epList = server.server_data || server.items || [];
            if (epList.length === 0) return;
            episodeHTML += `
                <div class="episode-section">
                    <h3>📺 Danh Sách Tập</h3>
                    <div class="episode-server-name">Server: ${server.server_name}</div>
                    <div class="episode-grid">
                        ${epList.map(ep => `
                            <button class="episode-btn"
                                    data-embed="${ep.link_embed || ep.embed || ''}"
                                    data-m3u8="${ep.link_m3u8 || ep.m3u8 || ''}"
                                    data-name="${ep.name}"
                                    onclick="playEpisode(this, '${m.slug}', '${ep.name}')">
                                ${ep.name}
                            </button>`).join('')}
                    </div>
                </div>`;
        });
    }

    main.innerHTML = `
        <div class="detail-page">
            <div class="detail-backdrop" style="background-image: url('${getImgUrl(m.thumb_url || m.poster_url)}')"></div>
            <div class="detail-main">
                <div class="detail-poster">
                    <img src="${getImgUrl(m.poster_url)}" alt="${m.name}" onerror="this.outerHTML='<div class=\\'img-error\\' style=\\'height:360px\\'>🎬</div>'">
                </div>
                <div class="detail-content">
                    <h1 class="detail-title">${m.name}</h1>
                    <p class="detail-origin-name">${m.original_name || m.origin_name || ''}</p>
                    <div class="detail-badges">
                        ${m.quality ? `<span class="detail-badge" style="background:var(--badge-fhd)">${m.quality}</span>` : ''}
                        ${m.lang ? `<span class="detail-badge" style="background:var(--gradient-cool)">${m.lang}</span>` : ''}
                        ${m.year ? `<span class="detail-badge" style="background:rgba(255,255,255,0.15);border:1px solid var(--border-color)">${m.year}</span>` : ''}
                        ${(m.episode_current || m.current_episode) ? `<span class="detail-badge" style="background:var(--gradient-warm)">${m.episode_current || m.current_episode}</span>` : ''}
                        ${m.status === 'ongoing' ? `<span class="detail-badge" style="background:var(--accent-3)">Đang chiếu</span>` : ''}
                        ${m.status === 'completed' ? `<span class="detail-badge" style="background:var(--badge-fhd)">Hoàn tất</span>` : ''}
                    </div>
                    <div class="detail-actions">
                        <button class="btn btn-primary" onclick="document.querySelector('.episode-btn')?.click()">
                            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            Xem Phim
                        </button>
                        <button class="btn btn-ghost" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color)"
                                onclick="const isFav = Favorites.toggle(${favData}); this.innerHTML = isFav ? '❤️ Đã Yêu Thích' : '🤍 Yêu Thích'">
                            ${isFav ? '❤️ Đã Yêu Thích' : '🤍 Yêu Thích'}
                        </button>
                        ${m.trailer_url ? `<a href="${m.trailer_url}" target="_blank" rel="noopener" class="btn btn-ghost" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color)">🎬 Trailer</a>` : ''}
                    </div>
                    <table class="detail-table">
                        ${(m.episode_current || m.current_episode) ? `<tr><td>Tình trạng</td><td>${m.episode_current || m.current_episode}${m.episode_total ? ' / ' + m.episode_total + ' tập' : ''}</td></tr>` : ''}
                        ${(m.time || m.time_per_episode) ? `<tr><td>Thời lượng</td><td>${m.time || m.time_per_episode}</td></tr>` : ''}
                        ${categories ? `<tr><td>Thể loại</td><td>${categories}</td></tr>` : ''}
                        ${countries ? `<tr><td>Quốc gia</td><td>${countries}</td></tr>` : ''}
                        ${directors ? `<tr><td>Đạo diễn</td><td>${directors}</td></tr>` : ''}
                        ${actors ? `<tr><td>Diễn viên</td><td>${actors}</td></tr>` : ''}
                    </table>
                </div>
            </div>
            <div class="player-container" id="playerContainer">
                <div class="player-placeholder">
                    <svg fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span>Chọn tập phim để xem</span>
                </div>
            </div>
            ${m.content ? `<div class="detail-synopsis"><h3>📖 Nội Dung Phim</h3><p>${m.content}</p></div>` : ''}
            ${episodeHTML}
        </div>`;
}

function playEpisode(btn, slug, episodeName) {
    $$('.episode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const embedUrl = btn.dataset.embed;
    const m3u8Url = btn.dataset.m3u8;

    if (!embedUrl && !m3u8Url) {
        showToast('Không tìm thấy link phim', '❌');
        return;
    }

    const player = $('playerContainer');
    // Cuộn tới player ngay lập tức
    player.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const createManualFallbackBtn = (type, currentUrl) => {
        const label = type === 'iframe' ? '📺 Thử mã nhúng (Nếu HLS lỗi)' : '⚡ Thử Luồng HLS (Khuyên dùng)';
        const otherType = type === 'iframe' ? 'embed' : 'hls';
        return `<div style="text-align:center; padding:10px; opacity:0.6;">
                    <button class="btn btn-sm" style="font-size:12px;" onclick="forcePlay('${otherType}', '${m3u8Url}', '${embedUrl}', '${episodeName}', '${slug}')">
                        ${label}
                    </button>
                </div>`;
    };

    if (m3u8Url && m3u8Url !== 'undefined') {
        player.innerHTML = `
            <video id="videoPlayer" controls autoplay playsinline style="width:100%; height:100%; background:#000; border-radius:8px;"></video>
            <div id="playerStatus" style="position:absolute; top:10px; right:10px; font-size:10px; color:#fff; pointer-events:none;">⚡ HLS Native</div>
            ${createManualFallbackBtn('iframe', embedUrl)}
        `;
    const video = document.getElementById('videoPlayer');
    let autoNextShown = false;

    // Helper to trigger next episode
    const playNextEpisode = () => {
        const nextBtn = btn.nextElementSibling;
        if (nextBtn && nextBtn.classList.contains('episode-btn')) {
            nextBtn.click();
        }
    };

    video.ontimeupdate = () => {
        const timeLeft = video.duration - video.currentTime;
        
        // Skip Intro Button (Show only in first 5 mins - 300s)
        let skipBtn = document.getElementById('skipIntroBtn');
        if (video.currentTime > 5 && video.currentTime < 300) {
            if (!skipBtn) {
                const btnHtml = `<button id="skipIntroBtn" class="skip-intro-btn">⏭️ Bỏ qua giới thiệu</button>`;
                player.insertAdjacentHTML('beforeend', btnHtml);
                skipBtn = document.getElementById('skipIntroBtn');
                skipBtn.onclick = () => { video.currentTime += 90; skipBtn.remove(); };
            }
        } else if (skipBtn && (video.currentTime >= 300 || video.currentTime < 5)) {
            skipBtn.remove();
        }

        // Auto Next Countdown (Show in last 12 seconds)
        if (timeLeft > 0 && timeLeft < 12 && !autoNextShown) {
            const nextBtn = btn.nextElementSibling;
            if (nextBtn && nextBtn.classList.contains('episode-btn')) {
                autoNextShown = true;
                const nextName = nextBtn.textContent.trim();
                const overlayHtml = `
                    <div id="autoNextOverlay" class="auto-next-overlay">
                        <div class="auto-next-header">Tập tiếp theo sau <span id="autoNextTimer">10</span>s</div>
                        <div class="auto-next-title">${nextName}</div>
                        <div class="auto-next-controls">
                            <button class="auto-next-btn" onclick="this.closest('.auto-next-overlay').remove(); document.querySelector('.episode-btn.active').nextElementSibling.click();">
                                🎬 Xem Ngay
                            </button>
                            <button class="auto-next-cancel" onclick="this.closest('.auto-next-overlay').remove();" title="Hủy">✕</button>
                        </div>
                    </div>`;
                player.insertAdjacentHTML('beforeend', overlayHtml);
                
                let count = 10;
                const timerInt = setInterval(() => {
                    const overlay = document.getElementById('autoNextOverlay');
                    if (!overlay) { clearInterval(timerInt); return; } // User closed it
                    
                    count--;
                    const timerEl = document.getElementById('autoNextTimer');
                    if (timerEl) timerEl.textContent = count;
                    
                    if (count <= 0) {
                        clearInterval(timerInt);
                        overlay.remove();
                        playNextEpisode();
                    }
                }, 1000);
            }
        }
    };

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            const hls = new Hls({ startLevel: -1 });
            hls.loadSource(m3u8Url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                video.play().catch(e => console.log('Autoplay blocked:', e));
            });
            hls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal && embedUrl) {
                    console.warn('HLS stream lỗi, tự động chuyển sang Iframe embed...');
                    hls.destroy();
                    forcePlay('embed', m3u8Url, embedUrl, episodeName, slug);
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) { // Safari native
            video.src = m3u8Url;
            video.addEventListener('loadedmetadata', function() { video.play(); showToast(`Đang phát: ${episodeName}`, '▶️'); });
        } else if (embedUrl) {
            forcePlay('embed', m3u8Url, embedUrl, episodeName, slug);
        }
    } else if (embedUrl) {
        forcePlay('embed', m3u8Url, embedUrl, episodeName, slug);
    }

    History.add({ slug, name: document.querySelector('.detail-title')?.textContent || '', poster_url: '' }, episodeName);
    showToast(`Đang phát: ${episodeName}`, '▶️');
}

// Global helper for forced player switching
window.forcePlay = function(type, m3u8, embed, epName, slug) {
    const player = $('playerContainer');
    if (type === 'embed') {
        let cleanEmbed = embed;
        if (!cleanEmbed.includes('autoplay=1')) {
            cleanEmbed += (cleanEmbed.includes('?') ? '&' : '?') + 'autoplay=1';
        }
        player.innerHTML = `
            <iframe src="${cleanEmbed}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture; fullscreen" style="width:100%; height:100%; border:none;"></iframe>
            <div id="playerStatus" style="position:absolute; top:10px; right:10px; font-size:10px; color:#fff; pointer-events:none;">📺 Embed Mode</div>
            ${m3u8 ? `<div style="text-align:center; padding:10px; opacity:0.6;"><button class="btn btn-sm" style="font-size:12px;" onclick="forcePlay('hls', '${m3u8}', '${embed}', '${epName}', '${slug}')">⚡ Quay lại Luồng HLS</button></div>` : ''}
        `;
    } else {
        const fakeBtn = { dataset: { m3u8, embed }, classList: { remove: ()=>{}, add: ()=>{} } };
        playEpisode(fakeBtn, slug, epName);
    }
}

// --- FAVORITES ---
function renderFavoritesPage() {
    const main = $('mainContent');
    const favs = Favorites.getAll();
    if (favs.length === 0) {
        main.innerHTML = `
            <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span class="current">Yêu Thích</span></nav>
            <div class="empty-state"><div class="empty-icon">💜</div><h3>Chưa có phim yêu thích</h3><p>Nhấn vào biểu tượng ❤️ trên poster phim để lưu vào mục yêu thích nhé!</p><button class="btn btn-primary" style="margin-top:16px" onclick="navigateTo('home')">Khám Phá Phim</button></div>`;
        return;
    }
    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span class="current">Yêu Thích</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">❤️</span> Phim Yêu Thích (${favs.length})</h2></div>
        <div class="movie-grid">${favs.map(m => movieCardHTML(m)).join('')}</div>`;
}

// --- HISTORY ---
function renderHistoryPage() {
    const main = $('mainContent');
    const hist = History.getAll();
    if (hist.length === 0) {
        main.innerHTML = `
            <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span class="current">Lịch Sử Xem</span></nav>
            <div class="empty-state"><div class="empty-icon">🕐</div><h3>Chưa có lịch sử xem</h3><p>Phim bạn đã xem sẽ được lưu tự động ở đây.</p><button class="btn btn-primary" style="margin-top:16px" onclick="navigateTo('home')">Khám Phá Phim</button></div>`;
        return;
    }
    const histHTML = hist.map(h => {
        const timeAgo = getTimeAgo(h.time);
        return `
        <div class="history-item" onclick="navigateTo('detail', '${h.slug}')">
            <div class="history-item-poster"><img src="${getImgUrl(h.poster_url)}" alt="${h.name}" onerror="this.outerHTML='<div class=\\'img-error\\' style=\\'font-size:24px\\'>🎬</div>'"></div>
            <div class="history-item-info">
                <h4>${h.name}</h4>
                ${h.episode ? `<p>Đã xem: ${h.episode}</p>` : ''}
                <p style="margin-top:4px; font-size:12px;">${timeAgo}</p>
            </div>
            <button class="history-item-remove" onclick="event.stopPropagation(); History.remove('${h.slug}'); renderHistoryPage(); showToast('Đã xóa', '🗑️')" title="Xóa">✕</button>
        </div>`;
    }).join('');

    main.innerHTML = `
        <nav class="breadcrumb"><a href="#" onclick="navigateTo('home'); return false;">Trang Chủ</a><span class="separator">›</span><span class="current">Lịch Sử Xem</span></nav>
        <div class="section-header"><h2 class="section-title"><span class="title-icon">🕐</span> Lịch Sử Xem (${hist.length})</h2></div>
        ${histHTML}`;
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Vừa xong';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    return `${Math.floor(days / 30)} tháng trước`;
}

// --- Scroll Effects ---
function initScrollEffects() {
    window.addEventListener('scroll', () => {
        $('mainHeader')?.classList.toggle('scrolled', window.scrollY > 10);
        $('backToTop')?.classList.toggle('visible', window.scrollY > 500);
    }, { passive: true });
}

// --- Keyboard Shortcuts ---
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); toggleSearch(); }
        if (e.key === 'Escape') {
            if ($('searchBox')?.classList.contains('active')) toggleSearch();
            if ($('mobileMenu')?.classList.contains('active')) toggleMobileMenu();
        }
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSearch();
    initScrollEffects();
    initKeyboard();
    renderSourcePicker();
    navigateTo('home');
});
