// =========================================================================
// KHAI BÁO HÀM CHUYỂN BÀI TIÊU CHUẨN LÊN ĐẦU FILE - SỬA SẠCH LỖI HỆ THỐNG
// =========================================================================
function handleIframeAutoNext() {
    if (isTrackChanging || currentTrackIndex === -1) return;
    executeNextTrackLogic();
}

function nextTrack() { 
    executeNextTrackLogic(); 
}

function prevTrack() {
    if (masterFlatSongsList.length === 0) return;
    var prevIndex = currentTrackIndex - 1;
    if (prevIndex < 0) prevIndex = masterFlatSongsList.length - 1;
    playTrack(prevIndex, true, true); 
}

// Cấu hình đường dẫn danh sách file JSON trong thư mục json1
var PLAYLIST_FILES = [
    '1.json', 
    '2.json', 
    '3.json', 
    '4.json', 
    '5.json', 
    '6.json'
]; 

// CẤU HÌNH SỐ LƯỢNG BÀI HÁT TRÊN MỖI TRANG
var SONGS_PER_PAGE = 100;

// Kho lưu trữ gốc cố định bảo toàn dữ liệu 100%
var masterPlaylistData = {}; 
var masterFlatSongsList = []; 

// Biến hoạt động động dành riêng cho giao diện hiển thị
var playlistData = {}; 
var flatSongsList = []; 
var currentTrackIndex = -1; 
var isTrackChanging = false; 

// Biến theo dõi trạng thái hoạt động phát nhạc toàn cục để đồng bộ nút bấm tổng
var isTrackPlaying = false; 

// Lưu trữ trạng thái trang hiện tại của từng thư mục
var folderPages = {};

// === ÉP BUỘC MẶC ĐỊNH LUÔN LUÔN HIỆN SỐ BÀI KHI VỪA BẬT TRANG WEB ===
var showSongCount = true;

var favoriteIds = JSON.parse(localStorage.getItem('drive_player_favorites')) || [];

var player = document.getElementById('audio-player');
var titleElement = document.getElementById('song-title');
var wrapperElement = document.getElementById('playlist-wrapper');
var statusElement = document.getElementById('status-msg');

// =========================================================================
// LOGIC HỆ THỐNG PHÁT NHẠC CHÍNH TỪ GOOGLE DRIVE PHÍA DƯỚI
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

// === TỐI ƯU HÓA TĂNG TỐC ĐỘ NẠP FILE JSON QUA CACHE TRÌNH DUYỆT ===
async function fetchLocalPlaylist() {
    setRandomBackground();
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
        restoreLastPlayedTrack();

        // Cấu hình lắng nghe phím Enter chống zoom điện thoại
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
        var oldWave = lists[i].querySelector('.wave-container');
        if (oldWave) oldWave.remove();
    }
}

function createFolderDOM(folderName, songs, isFavSection) {
    var titleDiv = document.createElement('div');
    titleDiv.className = isFavSection ? 'folder-section-title favorites-heading' : 'folder-section-title collapsed'; 
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
    titleDiv.onclick = function() { titleDiv.classList.toggle('collapsed'); };
    
    var currentPage = folderPages[folderName] || 1;
    var totalPages = Math.ceil(songs.length / SONGS_PER_PAGE);
    
    if (!isFavSection && totalPages > 1) {
        var liPagination = document.createElement('li');
        liPagination.className = 'pagination-row';
        liPagination.style.cssText = "display:flex; flex-wrap:wrap; gap:6px; padding:12px 15px; background:rgba(255,255,255,0.25); border-bottom:1px solid rgba(0,0,0,0.05); cursor:default; pointer-events:auto; border-radius:8px; margin:4px 0;";
        liPagination.onclick = function(e) { e.stopPropagation(); };
        
        var label = document.createElement('span');
        label.innerText = "Chọn trang:";
        label.style.cssText = "color:#444; font-weight:bold; align-self:center; margin-right:5px; font-size:11px;";
        liPagination.appendChild(label);
        
        var createPageClick = function(pNumber) {
            return function(e) {
                e.stopPropagation();
                folderPages[folderName] = pNumber;
                var expandedNames = [];
                wrapperElement.querySelectorAll('.folder-section-title:not(.collapsed)').forEach(function(el) {
                    var attrName = el.getAttribute('data-name');
                    if (attrName) expandedNames.push(attrName);
                });
                renderGroupedPlaylist(playlistData);
                wrapperElement.querySelectorAll('.folder-section-title').forEach(function(el) {
                    var attrName = el.getAttribute('data-name');
                    if (expandedNames.includes(attrName) || attrName === folderName) {
                        el.classList.remove('collapsed');
                    }
                });
            };
        };
        
        for (var p = 1; p <= totalPages; p++) {
            var pageBtn = document.createElement('button');
            pageBtn.innerText = p;
            pageBtn.style.cssText = "border:1px solid rgba(0,0,0,0.15); padding:4px 10px; border-radius:20px; cursor:pointer; font-weight:bold; font-size:11px; transition:all 0.2s;";
            if (p === currentPage) {
                pageBtn.style.background = "#2196f3";
                pageBtn.style.color = "#fff";
                pageBtn.style.borderColor = "#2196f3";
            } else {
                pageBtn.style.background = "rgba(255,255,255,0.6)";
                pageBtn.style.color = "#1d4ed8";
            }
            pageBtn.onclick = createPageClick(p);
            liPagination.appendChild(pageBtn);
        }
        ul.appendChild(liPagination);
    }
    
    var songsToRender = songs;
    if (!isFavSection && totalPages > 1) {
        var startIndex = (currentPage - 1) * SONGS_PER_PAGE;
var endIndex = startIndex + SONGS_PER_PAGE;
songsToRender = songs.slice(startIndex, endIndex);
}
var fragment = document.createDocumentFragment();
songsToRender.forEach(function(song) {
var li = document.createElement('li');
li.setAttribute('id', (isFavSection ? 'fav-' : 'song-') + song.id);
var textSpan = document.createElement('span');
textSpan.innerText = cleanSongName(song.name);
li.appendChild(textSpan);
var heartSpan = document.createElement('span');
heartSpan.className = 'fav-heart';
heartSpan.innerText = '♥';
if (favoriteIds.includes(song.id)) heartSpan.classList.add('active');
heartSpan.onclick = function(e) {
e.stopPropagation();
toggleFavorite(song.id, heartSpan);
};
li.appendChild(heartSpan);
li.onclick = function() {
var globalIndex = masterFlatSongsList.findIndex(function(s) { return s.id === song.id; });
// Click vào danh mục bài hát -> Ép buộc truyền trạng thái phát nhạc tự động
playTrack(globalIndex, true, false);
};
fragment.appendChild(li);
});
ul.appendChild(fragment);
wrapperElement.appendChild(ul);
}
// Tối ưu hóa render DOM bằng DocumentFragment tăng tốc độ hiển thị giao diện
function renderGroupedPlaylist(groupedData) {
if (!wrapperElement) return;
wrapperElement.innerHTML = '';
var favoriteSongs = masterFlatSongsList.filter(function(song) {
return favoriteIds.includes(song.id);
});
if (favoriteSongs.length > 0) {
createFolderDOM("💖 Bài Hát Yêu Thích", favoriteSongs, true);
}
for (var folderName in groupedData) {
var songs = groupedData[folderName];
if (songs.length === 0) continue;
createFolderDOM(folderName, songs, false);
}
if (currentTrackIndex !== -1) highlightCurrentSong();
}
function toggleFavorite(songId, heartElement) {
var index = favoriteIds.indexOf(songId);
if (index > -1) {
favoriteIds.splice(index, 1);
heartElement.classList.remove('active');
} else {
favoriteIds.push(songId);
heartElement.classList.add('active');
}
localStorage.setItem('drive_player_favorites', JSON.stringify(favoriteIds));
playlistData = {};
for (var fName in masterPlaylistData) {
playlistData[fName] = masterPlaylistData[fName].slice();
}
renderGroupedPlaylist(playlistData);
}
// =========================================================================
// HÀM KHỞI CHẠY BÀI HÁT - ĐÃ SỬA LỖI ĐỒNG BỘ PLAY VỚI THẺ AUDIO-PLAYER
// =========================================================================
function playTrack(index, autoPlay, isNextPrevAction) {
// Sửa lỗi: Nhắm mục tiêu chuẩn xác vào biến biến player đã khai báo ở trên đầu file
if (!player) {
player = document.getElementById('audio-player') || document.querySelector('iframe');
}
if (index < 0 || index >= masterFlatSongsList.length || !player) return;
isTrackChanging = true;
currentTrackIndex = index;
var currentSong = masterFlatSongsList[currentTrackIndex];
var currentFolderName = "Danh mục nhạc";
for (var folder in masterPlaylistData) {
var found = masterPlaylistData[folder].some(function(s) { return s.id === currentSong.id; });
if (found) {
currentFolderName = folder;
break;
}
}
if (statusElement) statusElement.innerText = currentFolderName;
if (titleElement) titleElement.innerText = cleanSongName(currentSong.name);
var p1 = "https://", p2 = "drive.", p3 = "google.com", p4 = "/file/d/";
// ĐỒNG BỘ BIẾN HOẠT ĐỘNG: Cập nhật biểu tượng và màu sắc của nút Play tổng ở đỉnh trang
var mainPlayButton = document.getElementById('main-play-btn');
if (autoPlay) {
isTrackPlaying = true;
if (mainPlayButton) {
mainPlayButton.innerText = "⏸";
mainPlayButton.classList.add('active');
}
}
// ĐỒNG BỘ BẮT BUỘC TRÊN GOOGLE DRIVE: Luôn nạp tham số autoplay=1 khi có tương tác chọn bài
var p5 = "/preview?autoplay=" + (autoPlay ? "1" : "1");
var embedUrl = p1 + p2 + p3 + p4 + currentSong.id + p5;
player.removeAttribute('src');
player.src = embedUrl;
highlightCurrentSong();
localStorage.setItem('drive_player_last_track_id', currentSong.id);
if (isNextPrevAction) {
syncPageAndExpandFolder(currentSong.id, currentFolderName);
setTimeout(function() {
var activeLi = document.getElementById('song-' + currentSong.id) || document.getElementById('fav-' + currentSong.id);
if (activeLi) {
activeLi.scrollIntoView({
behavior: 'smooth',
block: 'center'
});
}
}, 250);
} else {
window.scrollTo({
top: 0,
behavior: 'smooth'
});
}
setTimeout(function() { isTrackChanging = false; }, 3000);
}
function executeNextTrackLogic() {
if (masterFlatSongsList.length === 0) return;
var nextIndex = currentTrackIndex + 1;
if (nextIndex >= masterFlatSongsList.length) nextIndex = 0;
playTrack(nextIndex, true, true);
}
function restoreLastPlayedTrack() {
var lastTrackId = localStorage.getItem('drive_player_last_track_id');
if (lastTrackId) {
var savedIndex = masterFlatSongsList.findIndex(function(s) { return s.id === lastTrackId; });
// Khởi tạo trang web nạp lại bài cũ nhưng không tự phát tự động (autoPlay = false)
if (savedIndex !== -1) playTrack(savedIndex, false, true);
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
firstTitle.scrollIntoView({
behavior: 'smooth',
block: 'center'
});
}, 100);
}
}
function highlightCurrentSong() {
borderReset();
var currentSong = masterFlatSongsList[currentTrackIndex];
if (currentSong) {
var activeLiNormal = document.getElementById('song-' + currentSong.id);
var activeLiFav = document.getElementById('fav-' + currentSong.id);
var createWaveDOM = function() {
var waveDiv = document.createElement('div');
waveDiv.className = 'wave-container';
for (var i = 0; i < 4; i++) {
var bar = document.createElement('span');
bar.className = 'wave-bar';
waveDiv.appendChild(bar);
}
return waveDiv;
};
if (activeLiNormal) {
activeLiNormal.classList.add('active');
var heartN = activeLiNormal.querySelector('.fav-heart');
if (heartN) activeLiNormal.insertBefore(createWaveDOM(), heartN);
}
if (activeLiFav) {
activeLiFav.classList.add('active');
var heartF = activeLiFav.querySelector('.fav-heart');
if (heartF) activeLiFav.insertBefore(createWaveDOM(), heartF);
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
var expandedNames = [];
wrapperElement.querySelectorAll('.folder-section-title:not(.collapsed)').forEach(function(el) {
var attrName = el.getAttribute('data-name');
if (attrName) expandedNames.push(attrName);
});
renderGroupedPlaylist(playlistData);
wrapperElement.querySelectorAll('.folder-section-title').forEach(function(el) {
var attrName = el.getAttribute('data-name');
if (expandedNames.includes(attrName) || attrName === folderName) {
el.classList.remove('collapsed');
}
});
}
}
var targetUl = wrapperElement.querySelector('ul[data-folder-name="' + folderName + '"]');
if (targetUl) {
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
if (totalFoldersEl) {
totalFoldersEl.innerText = fCount;
}
if (totalSongsEl) {
if (showSongCount && masterFlatSongsList && masterFlatSongsList.length > 0) {
totalSongsEl.innerText = masterFlatSongsList.length.toLocaleString('en-US') + " bài";
} else {
totalSongsEl.innerText = "Đang ẩn";
}
}
}
function exportPlaylistToTxt() {
if (!masterPlaylistData || Object.keys(masterPlaylistData).length === 0) {
alert("Chưa có dữ liệu bài hát để xuất!");
return;
}
var content = "==================================================\n";
content += "        DANH SÁCH TOÀN BỘ BÀI HÁT HỆ THỐNG\n";
content += "==================================================\n\n";
var folderIndex = 1;
for (var folderName in masterPlaylistData) {
var songs = masterPlaylistData[folderName];
if (!songs || songs.length === 0) continue;
content += folderIndex + ". DANH MỤC: " + folderName.toUpperCase() + " (" + songs.length + " bài)\n";
content += "--------------------------------------------------\n";
songs.forEach(function(song, index) {
content += "  [" + (index + 1) + "] " + cleanSongName(song.name) + "\n";
});
content += "\n";
folderIndex++;
}
content += "==================================================\n";
content += "Tổng cộng: " + Object.keys(masterPlaylistData).length + " danh mục | " + masterFlatSongsList.length.toLocaleString('en-US') + " bài hát.\n";
var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
var link = document.createElement("a");
link.href = URL.createObjectURL(blob);
link.download = "Danh_Sach_" + new Date().toISOString().slice(0,10) + ".txt";
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
}
function handleHomeClickWithDelay() {
window.scrollTo({
top: 0,
behavior: 'smooth'
});
setTimeout(function() {
window.location.reload();
}, 500);
}
// =========================================================================
// LOGIC ĐIỀU KHIỂN ĐỒNG BỘ NÚT PLAY TỔNG VỚI PLAYER GOOGLE DRIVE
// =========================================================================
function toggleMasterPlayPause() {
if (!player) {
player = document.getElementById('audio-player') || document.querySelector('iframe');
}
var mainPlayButton = document.getElementById('main-play-btn');
if (currentTrackIndex === -1 && masterFlatSongsList.length > 0) {
currentTrackIndex = 0;
}
var currentSong = masterFlatSongsList[currentTrackIndex];
if (!currentSong || !player) return;
var p1 = "https://", p2 = "drive.", p3 = "google.com", p4 = "/file/d/";
if (!isTrackPlaying) {
// --- KÍCH HOẠT LỆNH PHÁT NHẠC ĐỒNG BỘ ---
isTrackPlaying = true;
var embedUrl = p1 + p2 + p3 + p4 + currentSong.id + "/preview?autoplay=1";
player.src = embedUrl;
if (mainPlayButton) {
mainPlayButton.innerText = "⏸";
mainPlayButton.classList.add('active');
}
highlightCurrentSong();
} else {
// --- KÍCH HOẠT LỆNH TẠM DỪNG ĐỒNG BỘ ---
isTrackPlaying = false;
var embedUrl = p1 + p2 + p3 + p4 + currentSong.id + "/preview?autoplay=0";
player.src = embedUrl;
if (mainPlayButton) {
mainPlayButton.innerText = "▶";
mainPlayButton.classList.remove('active');
}
}
}
// Lắng nghe nút bấm tổng bằng cơ chế gán trực tiếp để tránh xung đột tải trang
function initMasterPlayClick() {
var mainPlayButton = document.getElementById('main-play-btn');
if (mainPlayButton) {
mainPlayButton.onclick = function(e) {
e.stopPropagation();
toggleMasterPlayPause();
};
}
}
// Khởi chạy kích hoạt liên kết nút bấm ngay khi nạp kịch bản
initMasterPlayClick();
setTimeout(initMasterPlayClick, 1000); // Kích hoạt dự phòng phòng trường hợp phần tử DOM chưa tải xong
window.onload = fetchLocalPlaylist;