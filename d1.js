// =========================================================================
// KHAI BÁO HÀM CHUYỂN BÀI TIÊU CHUẨN LÊN ĐẦU FILE - CHẠY LOCALHOST MƯỢT MÀ
// =========================================================================
function nextTrack() { 
    resetRepeatMode();
    executeNextTrackLogic(true); 
}

function prevTrack() {
    if (masterFlatSongsList.length === 0) return;
    resetRepeatMode();
    var prevIndex = currentTrackIndex - 1;
    if (prevIndex < 0) prevIndex = masterFlatSongsList.length - 1;
    playTrack(prevIndex, true, true); 
}

var PLAYLIST_FILES = [
    '1a.json',
    '1b.json',
    '1c.json',
    '1d.json'
]; 

// ✔️ ĐÃ CẬP NHẬT: Cấu hình 1 trang chỉ hiển thị tối đa 50 bài hát giúp web tải siêu tốc
var SONGS_PER_PAGE = 50; 

var masterPlaylistData = {}; 
var masterFlatSongsList = []; 
var playlistData = {}; 
var flatSongsList = []; 
var currentTrackIndex = -1; 
var isTrackChanging = false; 
var isTrackPlaying = false; 
var folderPages = {};
var showSongCount = true;
var currentPlayMode = 'all'; 

var player = document.getElementById('audio-player');
var titleElement = document.getElementById('song-title');
var wrapperElement = document.getElementById('playlist-wrapper');
var statusElement = document.getElementById('status-msg');

// =========================================================================
// ☁️ NGUỒN NHẠC GOOGLE DRIVE (thay cho thư mục cục bộ 1CKMH/)
// =========================================================================
// Google API Key (Drive API) - nên giới hạn theo tên miền web trong Google Cloud Console
var DRIVE_API_KEY = 'AIzaSyDqfq8rh6qBQcoBhhqc26L8g34dhW6c3dc';

var audioSources = [];
var audioSourceIndex = 0;
var audioLoadTimer = null;
var lastAutoPlay = false;
var consecutiveFailures = 0;

function driveAudioSources(id) {
    var list = [];
    if (DRIVE_API_KEY) {
        list.push('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media&key=' + DRIVE_API_KEY);
    }
    list.push('https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t');
    list.push('https://drive.google.com/uc?export=download&confirm=t&id=' + id);
    return list;
}

// Hiện trạng thái ngắn cạnh tên danh mục (chỉ khi đang tải hoặc lỗi)
function setPlayStatus(msg) {
    if (!statusElement) return;
    statusElement.innerText = statusElement.innerText.split(' • ')[0] + (msg ? ' • ' + msg : '');
}

function applyAudioSource() {
    clearTimeout(audioLoadTimer);
    player.src = audioSources[audioSourceIndex];
    player.load();
    setPlayStatus('Đang tải...');
    // Quá 15 giây chưa nhận được dữ liệu -> coi như nguồn này hỏng
    audioLoadTimer = setTimeout(function () {
        if (player.readyState < 1) handleAudioFailure();
    }, 15000);
}

function loadDriveSource(song, autoPlay) {
    lastAutoPlay = !!autoPlay;
    player.dataset.songId = song.id;
    audioSources = driveAudioSources(song.id);
    audioSourceIndex = 0;
    applyAudioSource();
}

function handleAudioFailure() {
    clearTimeout(audioLoadTimer);
    var song = masterFlatSongsList[currentTrackIndex];
    if (!song || player.dataset.songId !== song.id) return;
    console.warn('Nguồn audio lỗi #' + audioSourceIndex, player.error ? player.error.code : 'timeout');

    // Thử nguồn dự phòng kế tiếp
    if (audioSourceIndex + 1 < audioSources.length) {
        audioSourceIndex++;
        applyAudioSource();
        if (lastAutoPlay) {
            var p = player.play();
            if (p && p.catch) p.catch(function () {});
        }
        return;
    }

    // Hết nguồn: bỏ qua bài lỗi, tối đa 3 bài liên tiếp để không chạy vòng vô tận
    consecutiveFailures++;
    if (lastAutoPlay && consecutiveFailures < 3) {
        setPlayStatus('Bài này lỗi, đang chuyển bài kế...');
        var failedId = song.id;
        setTimeout(function () {
            var cur = masterFlatSongsList[currentTrackIndex];
            if (cur && cur.id === failedId) executeNextTrackLogic(true);
        }, 1200);
    } else {
        setPlayStatus('Không phát được - kiểm tra API key / quyền chia sẻ Drive');
        isTrackPlaying = false;
        var stopBtn = document.getElementById('custom-play-pause-btn');
        if (stopBtn) stopBtn.innerText = "▶ Phát";
    }
}

// Thư mục Drive "VideoNen" chứa video equalizer (phải để chế độ "Bất kỳ ai có đường liên kết")
var VIDEO_FOLDER_ID = '103jIRIh4-bsGQSBrZcJ5bcIoBKq9z6JJ';
var equalizerVideosList = [];                       // sẽ được nạp từ Drive
var LOCAL_VIDEOS_FALLBACK = ['1.mp4', '2.mp4', '3.mp4']; // dùng nếu không đọc được Drive
var equalizerListReady = false;   // đã xác định xong danh sách video chưa
var videoLoadScheduled = false;   // video chỉ bắt đầu nạp SAU khi nhạc đã chạy
var failedVideos = [];

// Bọc play()/load() của video: lỗi gì cũng nuốt, không bao giờ ảnh hưởng tới nhạc
function hardenEqualizerVideo() {
    var v = document.getElementById('equalizer-video');
    if (!v || v.dataset.hardened) return;
    v.dataset.hardened = '1';
    var rawPlay = v.play.bind(v);
    var rawLoad = v.load.bind(v);
    v.play = function () {
        try {
            var p = rawPlay();
            return (p && p.catch) ? p.catch(function () {}) : Promise.resolve();
        } catch (e) { return Promise.resolve(); }
    };
    v.load = function () { try { rawLoad(); } catch (e) {} };
    v.addEventListener('error', onEqualizerVideoError);
}

// Video lỗi -> thử video khác; hết video thì ẩn khung, nhạc vẫn phát bình thường
function onEqualizerVideoError() {
    var v = document.getElementById('equalizer-video');
    if (!v) return;
    var failed = v.getAttribute('src');
    if (!failed) return;
    if (failedVideos.indexOf(failed) === -1) failedVideos.push(failed);
    var all = equalizerVideosList.length ? equalizerVideosList : LOCAL_VIDEOS_FALLBACK;
    var remaining = all.filter(function (u) { return failedVideos.indexOf(u) === -1; });
    if (remaining.length === 0) {
        console.warn('Không tải được video nền nào, ẩn khung video (nhạc vẫn phát).');
        if (v.parentNode) v.parentNode.style.display = 'none';
        return;
    }
    v.src = remaining[Math.floor(Math.random() * remaining.length)];
    v.load();
    if (player && !player.paused) v.play();
}

function startEqualizerVideoLoad() {
    if (videoLoadScheduled) return;
    videoLoadScheduled = true;
    loadEqualizerVideosFromDrive();
}

async function loadEqualizerVideosFromDrive() {
    try {
        var q = "'" + VIDEO_FOLDER_ID + "' in parents and trashed=false and mimeType contains 'video/'";
        var url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
                  '&fields=files(id,name)&orderBy=name&pageSize=50&key=' + DRIVE_API_KEY;
        var res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        equalizerVideosList = (data.files || []).map(function (f) {
            return 'https://www.googleapis.com/drive/v3/files/' + f.id + '?alt=media&key=' + DRIVE_API_KEY;
        });
    } catch (err) {
        console.warn('Không đọc được thư mục video trên Drive, dùng video cục bộ:', err);
    }
    equalizerListReady = true;
    // Nạp video đầu tiên để khung equalizer có hình
    var eqVideo = document.getElementById('equalizer-video');
    if (eqVideo && !eqVideo.getAttribute('src')) {
        var list = equalizerVideosList.length ? equalizerVideosList : LOCAL_VIDEOS_FALLBACK;
        eqVideo.src = list[0];
        eqVideo.load();
        if (player && !player.paused) eqVideo.play();
    }
}
var isVideoListenerAttached = false; 

function changeToRandomVideo() {
    var eqVideo = document.getElementById('equalizer-video');
    if (!eqVideo || !equalizerListReady) return;
    var list = equalizerVideosList.length ? equalizerVideosList : LOCAL_VIDEOS_FALLBACK;
    list = list.filter(function (u) { return failedVideos.indexOf(u) === -1; });
    if (list.length === 0) return;
    var randomIndex = Math.floor(Math.random() * list.length);
    var selectedVideo = list[randomIndex];
    eqVideo.src = selectedVideo;
    eqVideo.load();
    initVideoClickControl();
}

function syncEqualizerVideoState() {
    var eqVideo = document.getElementById('equalizer-video');
    if (!eqVideo) return;
    
    if (!isVideoListenerAttached) {
        eqVideo.onended = function() {
            changeToRandomVideo();
            if (player && !player.paused) {
                eqVideo.play().catch(function(e) { console.log(e); });
            }
        };
        isVideoListenerAttached = true;
    }
    
    if (player && !player.paused) {
        eqVideo.play().catch(function(e) {
            console.log("Trình duyệt chờ tương tác để phát video nền:", e);
        });
    } else {
        eqVideo.pause();
    }
}

function initVideoClickControl() {
    var eqVideo = document.getElementById('equalizer-video');
    if (eqVideo) {
        eqVideo.style.pointerEvents = "auto";
        eqVideo.style.cursor = "pointer";
        
        eqVideo.onclick = function(e) {
            e.stopPropagation();
            e.preventDefault();
            toggleMasterPlayPause(); 
        };
    }
}

// =========================================================================
// LOGIC HỆ THỐNG PHÁT NHẠC LOCALHOST CỤC BỘ
// =========================================================================

function cleanSongName(name) {
    if (!name) return "";
    var cleaned = name.trim();
    if (cleaned.toLowerCase().endsWith('.mp3')) {
        cleaned = cleaned.slice(0, -4).trim();
    }
    while (cleaned.endsWith(',') || cleaned.endsWith(' ') || cleaned.endsWith('.') || cleaned.endsWith('_') || cleaned.endsWith('-')) {
        cleaned = cleaned.slice(0, -1).trim();
    }
    return cleaned;
}

function removeVietnameseTones(str) {
    if (!str) return "";
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỉ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function setRandomBackground() {
    var backgrounds = ['bg1.jpg', 'bg2.jpg', 'bg3.jpg'];
    var randomIndex = Math.floor(Math.random() * backgrounds.length);
    var selectedBg = backgrounds[randomIndex];
    if (document.body) {
        document.body.style.backgroundImage = "url('" + selectedBg + "')";
    }
}

async function fetchLocalPlaylist() {
    setRandomBackground();
    hardenEqualizerVideo();
    setTimeout(startEqualizerVideoLoad, 6000); // nếu chưa phát nhạc, 6 giây sau mới nạp video
    if (statusElement) statusElement.innerText = "Đang nạp danh sách nhạc từ hệ thống...";
    
    try {
        masterPlaylistData = {};
        masterFlatSongsList = [];
        folderPages = {}; 
        var folderCount = 0;
        var seenSongIds = new Set(); 

        var fetchPromises = PLAYLIST_FILES.map(async function(fileName) {
            try {
                var response = await fetch(fileName, { cache: "force-cache" });
                if (!response.ok) return null;
                return await response.json();
            } catch (err) {
                console.error("Lỗi nạp file dữ liệu: " + fileName, err);
                return null;
            }
        });

        var allPlaylistsResults = await Promise.all(fetchPromises);

        allPlaylistsResults.forEach(function(localData) {
            if (!localData) return;

            for (var folderName in localData) {
                var songs = localData[folderName];
                if (songs && songs.length > 0) {
                    if (!masterPlaylistData[folderName]) {
                        masterPlaylistData[folderName] = [];
                        folderCount++;
                        folderPages[folderName] = 1; 
                    }
                    
                    songs.forEach(function(song) {
                        if (!seenSongIds.has(song.id)) {
                            seenSongIds.add(song.id);
                            masterPlaylistData[folderName].push(song);
                            masterFlatSongsList.push(song);
                        }
                    });
                }
            }
        });

        playlistData = {};
        for (var fName in masterPlaylistData) {
            playlistData[fName] = masterPlaylistData[fName].slice();
        }
        flatSongsList = masterFlatSongsList.slice();

        if (flatSongsList.length === 0) {
            if (statusElement) statusElement.innerText = "Không tìm thấy dữ liệu bài hát.";
            return;
        }

        if (statusElement) statusElement.innerText = "";
        
        updateGlobalCountUI(folderCount);
        renderGroupedPlaylist(playlistData);
        initAudioPlayerEvents();
        restoreLastPlayedTrack();
        initRepeatButtonUI(); 
        initVideoClickControl(); 

        var inputEl = document.getElementById('search-input');
        if (inputEl) {
            inputEl.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    filterSongsDirect();     
                    inputEl.blur();          
                }
            });
        }

    } catch (error) {
        if (statusElement) statusElement.innerText = "Lỗi hệ thống khởi tạo: " + error.message;
    }
}

function borderReset() {
    if (!wrapperElement) return;
    var lists = wrapperElement.getElementsByTagName('li');
    for (var i = 0; i < lists.length; i++) {
        lists[i].classList.remove('active');
    }
}

// =========================================================================
// 📊 HÀM TẠO THƯ MỤC CÓ PHÂN TRANG 50 BÀI & TỰ ĐỘNG THU GỌN MỤC KHÁC
// =========================================================================
function createFolderDOM(folderName, songs) {
    var titleDiv = document.createElement('div');
    titleDiv.className = 'folder-section-title collapsed';
    titleDiv.setAttribute('data-name', folderName);
    if (showSongCount) {
        var formattedCount = songs.length.toLocaleString('en-US');
        titleDiv.innerText = folderName + " (" + formattedCount + " bài)";
    } else {
        titleDiv.innerText = folderName;
    }
    wrapperElement.appendChild(titleDiv);
    var ul = document.createElement('ul');
    ul.className = 'playlist';
    ul.setAttribute('data-folder-name', folderName);
    
    // ✔️ FIX MỚI: Khi click mở mục này, tự động đóng toàn bộ các mục còn lại (Accordion Mode)
    titleDiv.onclick = function() {
        var isCurrentlyCollapsed = titleDiv.classList.contains('collapsed');
        if (isCurrentlyCollapsed) {
            // Đóng tất cả các thư mục khác lại trước
            wrapperElement.querySelectorAll('.folder-section-title').forEach(function(el) {
                el.classList.add('collapsed');
            });
            // Mở duy nhất thư mục hiện tại ra
            titleDiv.classList.remove('collapsed');
        } else {
            // Nếu đang mở thì click vào sẽ đóng lại bình thường
            titleDiv.classList.add('collapsed');
        }
    };
    
    var currentPage = folderPages[folderName] || 1;
    var totalPages = Math.ceil(songs.length / SONGS_PER_PAGE);
    var songsToRender = songs;
    if (totalPages > 1) {
        var startIndex = (currentPage - 1) * SONGS_PER_PAGE;
        var endIndex = startIndex + SONGS_PER_PAGE;
        songsToRender = songs.slice(startIndex, endIndex);
    }
    var fragment = document.createDocumentFragment();
    songsToRender.forEach(function(song) {
        var li = document.createElement('li');
        li.setAttribute('id', 'song-' + song.id);
        var textSpan = document.createElement('span');
        textSpan.innerText = cleanSongName(song.name);
        li.appendChild(textSpan);
        li.onclick = function(e) {
            e.stopPropagation();
            var globalIndex = masterFlatSongsList.findIndex(function(s) { return s.id === song.id; });
            playTrack(globalIndex, true, false);
        };
        fragment.appendChild(li);
    });
    ul.appendChild(fragment);
    wrapperElement.appendChild(ul);
    
    // Tự động sinh dải nút điều hướng nếu có từ 2 trang trở lên (50 bài/trang)
    if (totalPages > 1) {
        var paginationRow = document.createElement('div');
        paginationRow.className = 'pagination-row';
paginationRow.style.cssText = "display:flex; justify-content:center; align-items:center; gap:5px; padding:12px; flex-wrap:wrap; background:rgba(255,255,255,0.4); border-radius:0 0 10px 10px; margin-top:-1px; border:1px solid rgba(13,71,161,0.09); border-top:none;";
// Nút lùi trang ◀
var btnPrevPage = document.createElement('button');
btnPrevPage.innerText = "◀";
btnPrevPage.disabled = (currentPage === 1);
btnPrevPage.style.cssText = "padding:5px 10px; font-size:12px; cursor:pointer; border-radius:5px; border:1px solid rgba(0,0,0,0.15); background:#fff; font-weight:bold;";
btnPrevPage.onclick = function(e) {
e.stopPropagation();
if (currentPage > 1) {
folderPages[folderName] = currentPage - 1;
refreshFolderAfterPageChange(folderName);
}
};
paginationRow.appendChild(btnPrevPage);
// Hiển thị tối đa 5 nút số trang xoay quanh trang hiện tại để không bị tràn màn hình mobile
var startPage = Math.max(1, currentPage - 2);
var endPage = Math.min(totalPages, startPage + 4);
if (endPage - startPage < 4) {
startPage = Math.max(1, endPage - 4);
}
for (var i = startPage; i <= endPage; i++) {
(function(pageNumber) {
var btnNum = document.createElement('button');
btnNum.innerText = pageNumber;
btnNum.style.cssText = "padding:5px 10px; font-size:12px; cursor:pointer; border-radius:5px; border:1px solid rgba(0,0,0,0.15); font-weight:bold; transition:all 0.2s;";
if (pageNumber === currentPage) {
btnNum.style.background = "#F39C12";
btnNum.style.color = "#fff";
btnNum.style.borderColor = "#F39C12";
} else {
btnNum.style.background = "#fff";
btnNum.style.color = "#333";
}
btnNum.onclick = function(e) {
e.stopPropagation();
if (folderPages[folderName] !== pageNumber) {
folderPages[folderName] = pageNumber;
refreshFolderAfterPageChange(folderName);
}
};
paginationRow.appendChild(btnNum);
})(i);
}
// Nút tiến trang ▶
var btnNextPage = document.createElement('button');
btnNextPage.innerText = "▶";
btnNextPage.disabled = (currentPage === totalPages);
btnNextPage.style.cssText = "padding:5px 10px; font-size:12px; cursor:pointer; border-radius:5px; border:1px solid rgba(0,0,0,0.15); background:#fff; font-weight:bold;";
btnNextPage.onclick = function(e) {
e.stopPropagation();
if (currentPage < totalPages) {
folderPages[folderName] = currentPage + 1;
refreshFolderAfterPageChange(folderName);
}
};
paginationRow.appendChild(btnNextPage);
// Văn bản hiển thị số lượng trang thực tế (Ví dụ: Trang 1/100)
var pageInfo = document.createElement('span');
pageInfo.innerText = "Trang " + currentPage + "/" + totalPages;
pageInfo.style.cssText = "font-size:11px; color:#555; margin-left:8px; font-weight:600;";
paginationRow.appendChild(pageInfo);
wrapperElement.appendChild(paginationRow);
}
}
// Làm mới giao diện sau khi bấm chuyển số trang
function refreshFolderAfterPageChange(targetFolderName) {
// Chỉ giữ lại trạng thái mở của đúng danh mục đang thao tác phân trang
renderGroupedPlaylist(playlistData);
wrapperElement.querySelectorAll('.folder-section-title').forEach(function(el) {
var attrName = el.getAttribute('data-name');
if (attrName === targetFolderName) {
el.classList.remove('collapsed');
} else {
el.classList.add('collapsed');
}
});
}
function renderGroupedPlaylist(groupedData) {
if (!wrapperElement) return;
wrapperElement.innerHTML = '';
for (var folderName in groupedData) {
var songs = groupedData[folderName];
if (songs.length === 0) continue;
createFolderDOM(folderName, songs);
}
if (currentTrackIndex !== -1) highlightCurrentSong();
}



// =========================================================================
// HÀM KHỞI CHẠY BÀI HÁT - ĐÃ SỬA LỖI ĐỒNG BỘ PLAY VỚI THẺ AUDIO-PLAYER
// =========================================================================
function playTrack(index, autoPlay, isNextPrevAction) {
if (!player) {
player = document.getElementById('audio-player');
}
if (index < 0 || !masterFlatSongsList || index >= masterFlatSongsList.length || !player) return;
isTrackChanging = true;
currentTrackIndex = index;
var currentSong = masterFlatSongsList[currentTrackIndex];
var currentFolderName = "🎵 Nhạc Tổng Hợp";
for (var folder in masterPlaylistData) {
var found = masterPlaylistData[folder].some(function(s) { return s.id === currentSong.id; });
if (found) {
currentFolderName = folder;
break;
}
}
if (statusElement) statusElement.innerText = currentFolderName;
if (titleElement) titleElement.innerText = cleanSongName(currentSong.name);
loadDriveSource(currentSong, autoPlay);
highlightCurrentSong();
localStorage.setItem('drive_player_last_track_id', currentSong.id);
var mainPlayButton = document.getElementById('main-play-btn');
var customPlayBtn = document.getElementById('custom-play-pause-btn');
var eqVideo = document.getElementById('equalizer-video');
if (autoPlay) {
isTrackPlaying = true;
if (mainPlayButton) {
mainPlayButton.innerText = "⏸";
mainPlayButton.classList.add('active');
}
if (customPlayBtn) {
customPlayBtn.innerText = "⏸ Dừng";
}
var playPromise = player.play();
if (playPromise !== undefined) {
playPromise.then(function() {
try {
changeToRandomVideo();
syncEqualizerVideoState();
if (eqVideo) eqVideo.play();
} catch (videoErr) { console.warn('Video nền lỗi (bỏ qua):', videoErr); }
}).catch(function(error) {
// Đổi nguồn/thử nguồn khác: handleAudioFailure đang xử lý, không đổi giao diện sang "dừng"
if (error && (error.name === 'AbortError' || error.name === 'NotSupportedError')) return;
console.log("iPhone yêu cầu chạm tay kích hoạt:", error);
isTrackPlaying = false;
if (mainPlayButton) {
mainPlayButton.innerText = "▶";
mainPlayButton.classList.remove('active');
}
if (customPlayBtn) {
customPlayBtn.innerText = "▶ Phát";
}
if (eqVideo) eqVideo.pause();
});
}
} else {
isTrackPlaying = false;
if (mainPlayButton) {
mainPlayButton.innerText = "▶";
mainPlayButton.classList.remove('active');
}
if (customPlayBtn) {
customPlayBtn.innerText = "▶ Phát";
}
syncEqualizerVideoState();
if (eqVideo) eqVideo.pause();
}
if (isNextPrevAction) {
syncPageAndExpandFolder(currentSong.id, currentFolderName);
setTimeout(function() {
var activeLi = document.getElementById('song-' + currentSong.id);
if (activeLi) {
activeLi.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
}, 250);
} else {
window.scrollTo({ top: 0, behavior: 'smooth' });
}
setTimeout(function() { isTrackChanging = false; }, 500);
}
function executeNextTrackLogic(isManualAction) {
if (!masterFlatSongsList || masterFlatSongsList.length === 0) return;
if (currentPlayMode === 'one' && !isManualAction) {
playTrack(currentTrackIndex, true, true);
return;
}
var nextIndex = currentTrackIndex + 1;
if (nextIndex >= masterFlatSongsList.length) {
nextIndex = 0;
}
playTrack(nextIndex, true, true);
}
function initAudioPlayerEvents() {
if (!player) player = document.getElementById('audio-player');
if (player) {
player.preload = 'auto';
player.addEventListener('error', handleAudioFailure);
player.addEventListener('canplay', function() { clearTimeout(audioLoadTimer); });
player.addEventListener('playing', function() {
clearTimeout(audioLoadTimer);
consecutiveFailures = 0;
setPlayStatus('');
startEqualizerVideoLoad();
});
player.addEventListener('waiting', function() { setPlayStatus('Đang tải...'); });
player.onended = function() {
executeNextTrackLogic(false);
};
player.onplay = function() {
isTrackPlaying = true;
syncEqualizerVideoState();
var customPlayBtn = document.getElementById('custom-play-pause-btn');
if (customPlayBtn) {
customPlayBtn.innerText = "⏸ Dừng";
}
var eqVideo = document.getElementById('equalizer-video');
if (eqVideo) eqVideo.play().catch(function(e){});
};
player.onpause = function() {
isTrackPlaying = false;
syncEqualizerVideoState();
var customPlayBtn = document.getElementById('custom-play-pause-btn');
if (customPlayBtn) {
customPlayBtn.innerText = "▶ Phát";
}
var eqVideo = document.getElementById('equalizer-video');
if (eqVideo) eqVideo.pause();
};
}
}
function resetRepeatMode() {
currentPlayMode = 'all';
localStorage.setItem('drive_player_mode', 'all');
var btnRepeat = document.getElementById('repeat-one-btn');
if (btnRepeat) {
btnRepeat.className = "control-sub-btn mode-all";
btnRepeat.innerText = "🔁 Lặp";
}
}
function initRepeatButtonUI() {
currentPlayMode = localStorage.getItem('drive_player_mode') || 'all';
var targetAnchor = document.getElementById('song-title');
if (!targetAnchor) return;
if (document.getElementById('custom-control-bar')) return;
if (player) {
player.style.display = "none";
}
var controlBar = document.createElement('div');
controlBar.id = 'custom-control-bar';
controlBar.className = 'custom-player-wrapper';
var buttonRow = document.createElement('div');
buttonRow.className = 'player-btn-row';
var btnPrev = document.createElement('button');
btnPrev.className = 'control-main-btn btn-prev-track';
btnPrev.innerText = "⏪ Lùi";
btnPrev.onclick = function(e) { e.stopPropagation(); prevTrack(); };
var btnPlayPause = document.createElement('button');
btnPlayPause.id = 'custom-play-pause-btn';
btnPlayPause.className = 'control-main-btn btn-play-pause';
btnPlayPause.innerText = (player && !player.paused) ? "⏸ Dừng" : "▶ Phát";
btnPlayPause.onclick = function(e) { e.stopPropagation(); toggleMasterPlayPause(); };
var btnNext = document.createElement('button');
btnNext.className = 'control-main-btn btn-next-track';
btnNext.innerText = "⏩ Tiến";
btnNext.onclick = function(e) { e.stopPropagation(); nextTrack(); };
var btnRepeat = document.createElement('button');
btnRepeat.id = 'repeat-one-btn';
if (currentPlayMode === 'one') {
btnRepeat.className = "control-sub-btn mode-one";
btnRepeat.innerText = "🔂 Lặp";
} else {
btnRepeat.className = "control-sub-btn mode-all";
btnRepeat.innerText = "🔁 Lặp";
}
btnRepeat.onclick = function(e) {
e.stopPropagation();
if (currentPlayMode === 'all') {
currentPlayMode = 'one';
btnRepeat.className = "control-sub-btn mode-one";
btnRepeat.innerText = "🔂 Lặp";
} else {
currentPlayMode = 'all';
btnRepeat.className = "control-sub-btn mode-all";
btnRepeat.innerText = "🔁 Lặp";
}
localStorage.setItem('drive_player_mode', currentPlayMode);
};
buttonRow.appendChild(btnPrev);
buttonRow.appendChild(btnPlayPause);
buttonRow.appendChild(btnNext);
buttonRow.appendChild(btnRepeat);
controlBar.appendChild(buttonRow);
var progressRow = document.createElement('div');
progressRow.className = 'player-progress-row';
var timeCurrent = document.createElement('span');
timeCurrent.id = 'track-time-current';
timeCurrent.innerText = "0:00";
var progressBar = document.createElement('input');
progressBar.id = 'track-progress-bar';
progressBar.type = 'range';
progressBar.value = 0;
progressBar.min = 0;
progressBar.max = 100;
var timeTotal = document.createElement('span');
timeTotal.id = 'track-time-total';
timeTotal.innerText = "0:00";
progressRow.appendChild(timeCurrent);
progressRow.appendChild(progressBar);
progressRow.appendChild(timeTotal);
controlBar.appendChild(progressRow);
if (targetAnchor.parentNode) {
targetAnchor.parentNode.insertBefore(controlBar, targetAnchor.nextSibling);
}
if (player) {
function formatTime(secs) {
if (isNaN(secs)) return "0:00";
var m = Math.floor(secs / 60);
var s = Math.floor(secs % 60);
return m + ":" + (s < 10 ? "0" : "") + s;
}
player.addEventListener('timeupdate', function() {
if (player.duration && !progressBar.matches(':focus')) {
var value = (player.currentTime / player.duration) * 100;
progressBar.value = value;
timeCurrent.innerText = formatTime(player.currentTime);
timeTotal.innerText = formatTime(player.duration);
}
});
player.addEventListener('loadedmetadata', function() {
timeTotal.innerText = formatTime(player.duration);
});
progressBar.addEventListener('input', function() {
if (player.duration) {
var newTime = (progressBar.value / 100) * player.duration;
player.currentTime = newTime;
timeCurrent.innerText = formatTime(newTime);
}
});
}
}
function filterSongsDirect() {
var searchInput = document.getElementById('search-input');
if (!searchInput) return;
var rawKeyword = searchInput.value.toLowerCase().trim();
var keyword = removeVietnameseTones(rawKeyword);
if (keyword === "") {
playlistData = {};
for (var fName in masterPlaylistData) {
playlistData[fName] = masterPlaylistData[fName].slice();
}
renderGroupedPlaylist(playlistData);
return;
}
var searchResultsArray = [];
for (var folderName in masterPlaylistData) {
masterPlaylistData[folderName].forEach(function(song) {
var songNameNoTone = removeVietnameseTones(song.name.toLowerCase());
if (songNameNoTone.includes(keyword)) {
var isExisted = searchResultsArray.some(function(s) { return s.id === song.id; });
if (!isExisted) {
searchResultsArray.push(song);
}
}
});
}
var filteredData = {};
if (searchResultsArray.length > 0) {
filteredData["🔍 Kết Quả Tìm Kiếm (" + searchResultsArray.length + " bài)"] = searchResultsArray;
} else {
filteredData["❌ Không tìm thấy bài hát nào khớp"] = [];
}
playlistData = filteredData;
renderGroupedPlaylist(playlistData);
var firstTitle = wrapperElement.querySelector('.folder-section-title');
if (firstTitle) {
if (firstTitle.classList.contains('collapsed')) {
firstTitle.classList.remove('collapsed');
}
setTimeout(function() {
firstTitle.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, 100);
}
}
function highlightCurrentSong() {
borderReset();
var currentSong = masterFlatSongsList[currentTrackIndex];
if (currentSong) {
var activeLiNormal = document.getElementById('song-' + currentSong.id);
if (activeLiNormal) {
activeLiNormal.classList.add('active');
}
}
}
function syncPageAndExpandFolder(songId, folderName) {
var songsInFolder = masterPlaylistData[folderName];
if (!songsInFolder) return;
var songIndexInFolder = songsInFolder.findIndex(function(s) { return s.id === songId; });
if (songIndexInFolder !== -1) {
var targetPage = Math.floor(songIndexInFolder / SONGS_PER_PAGE) + 1;
if (folderPages[folderName] !== targetPage) {
folderPages[folderName] = targetPage;
// Render lại playlist, Accordion Mode sẽ tự thu gọn các mục khác
renderGroupedPlaylist(playlistData);
wrapperElement.querySelectorAll('.folder-section-title').forEach(function(el) {
var attrName = el.getAttribute('data-name');
if (attrName === folderName) {
el.classList.remove('collapsed');
} else {
el.classList.add('collapsed');
}
});
}
}
var targetUl = wrapperElement.querySelector('ul[data-folder-name="' + folderName + '"]');
if (targetUl) {
// Đóng các mục khác khi chuyển bài tự động bằng phím Tiến/Lùi
wrapperElement.querySelectorAll('.folder-section-title').forEach(function(el) {
// ✔️ ĐÃ FIX LỖI: Đổi el.add('collapsed') thành el.classList.add('collapsed')
el.classList.add('collapsed');
});
var titleDiv = targetUl.previousElementSibling;
if (titleDiv && titleDiv.classList.contains('folder-section-title')) {
titleDiv.classList.remove('collapsed');
}
}
}
function toggleSongCountDisplay() {
showSongCount = !showSongCount;
localStorage.setItem('drive_player_show_count', showSongCount ? 'true' : 'false');
var currentFolderCount = 0;
if (masterPlaylistData) {
currentFolderCount = Object.keys(masterPlaylistData).length;
}
updateGlobalCountUI(currentFolderCount);
var expandedNames = [];
wrapperElement.querySelectorAll('.folder-section-title:not(.collapsed)').forEach(function(el) {
var attrName = el.getAttribute('data-name');
if (attrName) expandedNames.push(attrName);
});
renderGroupedPlaylist(playlistData);
wrapperElement.querySelectorAll('.folder-section-title').forEach(function(el) {
var attrName = el.getAttribute('data-name');
if (expandedNames.includes(attrName)) {
el.classList.remove('collapsed');
}
});
}
function updateGlobalCountUI(fCount) {
var totalFoldersEl = document.getElementById('total-folders');
var totalSongsEl = document.getElementById('total-songs');
if (totalFoldersEl) totalFoldersEl.innerText = fCount;
if (totalSongsEl) {
if (showSongCount && masterFlatSongsList && masterFlatSongsList.length > 0) {
totalSongsEl.innerText = masterFlatSongsList.length.toLocaleString('en-US') + " bài";
} else {
totalSongsEl.innerText = "Đang ẩn";
}
}
}
function restoreLastPlayedTrack() {
var lastTrackId = localStorage.getItem('drive_player_last_track_id');
if (lastTrackId) {
var savedIndex = masterFlatSongsList.findIndex(function(s) { return s.id === lastTrackId; });
if (savedIndex !== -1) {
playTrack(savedIndex, false, true);
}
}
}
function toggleMasterPlayPause() {
if (!player) {
player = document.getElementById('audio-player');
var playBox = document.querySelector('.player-search-box-style');
if (playBox) playBox.classList.add('playing-now');
}
var mainPlayButton = document.getElementById('main-play-btn');
var customPlayBtn = document.getElementById('custom-play-pause-btn');
var eqVideo = document.getElementById('equalizer-video');
if (currentTrackIndex === -1 && masterFlatSongsList.length > 0) {
currentTrackIndex = 0;
playTrack(currentTrackIndex, true, false);
return;
}
if (!player.src || player.src.includes('undefined')) {
playTrack(currentTrackIndex !== -1 ? currentTrackIndex : 0, true, false);
return;
}
if (player.paused) {
isTrackPlaying = true;
player.play().then(function() {
syncEqualizerVideoState();
if (eqVideo) eqVideo.play().catch(function(e){});
}).catch(function(e) { console.log(e); });
if (mainPlayButton) {
mainPlayButton.innerText = "⏸";
mainPlayButton.classList.add('active');
}
if (customPlayBtn) {
customPlayBtn.innerText = "⏸ Dừng";
}
highlightCurrentSong();
} else {
isTrackPlaying = false;
player.pause();
syncEqualizerVideoState();
if (eqVideo) eqVideo.pause();
if (mainPlayButton) {
mainPlayButton.innerText = "▶";
mainPlayButton.classList.remove('active');
}
if (customPlayBtn) {
customPlayBtn.innerText = "▶ Phát";
}
}
}
function initMasterPlayClick() {
var mainPlayButton = document.getElementById('main-play-btn');
if (mainPlayButton) {
mainPlayButton.onclick = function(e) {
e.stopPropagation();
toggleMasterPlayPause();
};
}
}
initMasterPlayClick();
setTimeout(initMasterPlayClick, 1000);
window.onload = fetchLocalPlaylist;
function handleHomeClickWithDelay() {
var searchInput = document.getElementById('search-input');
if (searchInput) {
searchInput.value = "";
}
playlistData = {};
for (var fName in masterPlaylistData) {
playlistData[fName] = masterPlaylistData[fName].slice();
}
renderGroupedPlaylist(playlistData);
setTimeout(function() {
window.scrollTo({
top: 0,
behavior: 'smooth'
});
}, 150);
}