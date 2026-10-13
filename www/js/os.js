// Clock
setInterval(() => {
  const now = new Date();
  document.getElementById('clock').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 1000);

let installedApps = {};

function showLoading(text = "Loading...") {
  document.getElementById('loadingText').innerText = text;
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function toggleNotificationPanel() {
  document.getElementById('notificationPanel').classList.toggle('active');
}

// OS Initialization & Boot
async function initOS() {
  showLoading("Booting Web OS...");
  installedApps = {};

  // 1. Load Inbuilt Apps from apps/ folder
  const inbuiltAppFolders = ['flappynyan']; 
  for (let folderName of inbuiltAppFolders) {
    try {
      const res = await fetch(`apps/${folderName}/app.json`);
      if (res.ok) {
        const manifest = await res.json();
        installedApps[manifest.id] = {
          ...manifest,
          type: 'inbuilt',
          iconUrl: `apps/${folderName}/${manifest.icon || 'icon.png'}`,
          entryUrl: `apps/${folderName}/${manifest.entry || 'index.html'}`
        };
      }
    } catch (err) {
      console.log(`Could not load inbuilt app: ${folderName}`);
    }
  }

  // 2. Load User Installed Zips from Permanent LocalStorage
  let savedZips = JSON.parse(localStorage.getItem('webos_installed_zips') || '{}');
  for (let id in savedZips) {
    let base64Data = savedZips[id];
    let zipFile = base64ToFile(base64Data, id + ".zip");
    await processAndInstallZip(zipFile, false, id);
  }

  renderApps();
  setTimeout(hideLoading, 500);
}

// Render Desktop App Grid
function renderApps() {
  const grid = document.getElementById('appGrid');
  grid.innerHTML = `
    <div class="app-icon" onclick="document.getElementById('zipInput').click()">
      <img src="assets/icons/install.png" alt="Install">
      <span>Install App</span>
    </div>
  `;

  Object.keys(installedApps).forEach(id => {
    const app = installedApps[id];
    const iconSrc = app.iconUrl || 'assets/icons/default-app.png';
    const div = document.createElement('div');
    div.className = 'app-icon';
    div.innerHTML = `<img src="${iconSrc}" alt="${app.name}"><span>${app.name}</span>`;
    div.onclick = () => launchApp(id);
    grid.appendChild(div);
  });
}

// Process and Extract ZIP Packages
async function processAndInstallZip(file, showAlert = true, forcedId = null) {
  try {
    const zip = await JSZip.loadAsync(file);
    let appId = forcedId || ('app_' + Date.now() + Math.random().toString(36).substring(2, 7));
    
    let manifest = { 
      id: appId, 
      name: file.name.replace('.zip', ''), 
      entry: 'index.html',
      icon: null
    };

    let manifestFileKey = Object.keys(zip.files).find(k => k === 'app.json' || k.endsWith('/app.json'));
    if (manifestFileKey) {
      try {
        const manifestText = await zip.file(manifestFileKey).async("string");
        const parsed = JSON.parse(manifestText);
        manifest = { ...manifest, ...parsed };
      } catch(e) {
        console.warn("Invalid app.json, using defaults.");
      }
    }

    const files = {};
    for (let relativePath in zip.files) {
      if (!zip.files[relativePath].dir) {
        const arrayBuffer = await zip.files[relativePath].async("arraybuffer");
        
        let mimeType = "text/plain";
        if (relativePath.endsWith(".html")) mimeType = "text/html";
        else if (relativePath.endsWith(".css")) mimeType = "text/css";
        else if (relativePath.endsWith(".js")) mimeType = "application/javascript";
        else if (relativePath.endsWith(".png")) mimeType = "image/png";
        else if (relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg")) mimeType = "image/jpeg";
        else if (relativePath.endsWith(".svg")) mimeType = "image/svg+xml";

        const blob = new Blob([arrayBuffer], { type: mimeType });
        files[relativePath] = URL.createObjectURL(blob);
      }
    }

    let targetEntry = manifest.entry || 'index.html';
    let entryKey = Object.keys(files).find(k => k === targetEntry || k.endsWith('/' + targetEntry));
    if (!entryKey) {
      entryKey = Object.keys(files).find(k => k.endsWith('.html'));
    }

    if (!entryKey) {
      if (showAlert) alert(`Error: No valid HTML file found in ${file.name}!`);
      return false;
    }
    manifest.entryKey = entryKey;

    if (manifest.icon) {
      let iconKey = Object.keys(files).find(k => k === manifest.icon || k.endsWith('/' + manifest.icon));
      if (iconKey) manifest.iconUrl = files[iconKey];
    }
    if (!manifest.iconUrl) {
      let imgKey = Object.keys(files).find(k => /\.(png|jpg|jpeg|gif|svg)\$/i.test(k));
      if (imgKey) manifest.iconUrl = files[imgKey];
    }

    manifest.files = files;
    manifest.type = 'user';
    installedApps[manifest.id] = manifest;

    // Permanent Save in LocalStorage
    if (!forcedId) {
      let base64 = await fileToBase64(file);
      let savedZips = JSON.parse(localStorage.getItem('webos_installed_zips') || '{}');
      savedZips[manifest.id] = base64;
      localStorage.setItem('webos_installed_zips', JSON.stringify(savedZips));
    }
    
    if (showAlert) alert(`App "${manifest.name}" Installed Successfully!`);
    return true;
  } catch (err) {
    console.error(err);
    if (showAlert) alert('Failed to parse ZIP file!');
    return false;
  }
}

async function handleZipUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  showLoading("Installing App...");
  await processAndInstallZip(file, true);
  renderApps();
  hideLoading();
  e.target.value = '';
}

// App Launcher
function launchApp(id) {
  const app = installedApps[id];
  if (!app) return;

  let entryFile = app.type === 'inbuilt' ? app.entryUrl : app.files[app.entryKey];
  if (!entryFile) {
    alert('Could not find entry point to launch app!');
    return;
  }

  showLoading("Launching " + app.name + "...");
  document.getElementById('appTitle').innerText = app.name;
  document.getElementById('windowBody').innerHTML = `<iframe id="appIframe" src="${entryFile}"></iframe>`;
  document.getElementById('appWindow').classList.add('active');
  setTimeout(hideLoading, 400);
}

// Settings App & System Management
function openSettings() {
  document.getElementById('appTitle').innerText = 'Settings';
  
  let appsHtml = '';
  const appIds = Object.keys(installedApps);
  
  if (appIds.length === 0) {
    appsHtml = '<p style="color:#888; text-align:center; padding:15px;">No apps found.</p>';
  } else {
    appIds.forEach(id => {
      const app = installedApps[id];
      const uninstallBtn = app.type === 'user' ? `<button class="delete-btn" onclick="uninstallApp('${id}')">Uninstall</button>` : `<span style="color:#666; font-size:12px;">System App</span>`;
      appsHtml += `
        <div class="settings-item">
          <div>
            <strong>${app.name}</strong><br>
            <small style="color:#aaa; font-size:11px;">Type: ${app.type}</small>
          </div>
          ${uninstallBtn}
        </div>
      `;
    });
  }

  document.getElementById('windowBody').innerHTML = `
    <div class="settings-content">
      <h3 style="margin-bottom:10px; color:#fff; font-size:16px;">System Management</h3>
      <div class="settings-section">
        <div class="settings-item">
          <div><strong>Backup System</strong><br><small style="color:#aaa;">Export all user apps to JSON</small></div>
          <button class="action-btn" onclick="exportBackup()">Backup</button>
        </div>
        <div class="settings-item">
          <div><strong>Restore System</strong><br><small style="color:#aaa;">Import apps from backup file</small></div>
          <button class="action-btn" onclick="document.getElementById('restoreInput').click()">Restore</button>
        </div>
      </div>

      <h3 style="margin:20px 0 10px 0; color:#fff; font-size:16px;">Manage Apps</h3>
      <div class="settings-section">
        ${appsHtml}
      </div>
    </div>
  `;
  document.getElementById('appWindow').classList.add('active');
}

function uninstallApp(id) {
  if (confirm('Are you sure you want to uninstall this app?')) {
    delete installedApps[id];
    let savedZips = JSON.parse(localStorage.getItem('webos_installed_zips') || '{}');
    delete savedZips[id];
    localStorage.setItem('webos_installed_zips', JSON.stringify(savedZips));
    renderApps();
    openSettings();
  }
}

function closeApp() {
  document.getElementById('appWindow').classList.remove('active');
  document.getElementById('windowBody').innerHTML = `<iframe id="appIframe"></iframe>`;
}

// --- 3-Button Navigation Bar Actions ---
function navBack() {
  const appWindow = document.getElementById('appWindow');
  if (appWindow.classList.contains('active')) {
    try {
      const iframe = document.getElementById('appIframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.history.back();
      } else {
        closeApp();
      }
    } catch (e) {
      closeApp();
    }
  }
}

function navHome() {
  closeApp();
  document.getElementById('notificationPanel').classList.remove('active');
}

function navRecents() {
  // Recents button opens Settings as a task management overview
  openSettings();
}

// Helpers for Storage & Backup
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

function base64ToFile(base64, filename) {
  let arr = base64.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--){
      u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, {type:mime});
}

function exportBackup() {
  showLoading("Generating Backup...");
  let savedZips = localStorage.getItem('webos_installed_zips') || '{}';
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(savedZips);
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `webos_backup_${Date.now()}.json`);
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();
  hideLoading();
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  showLoading("Restoring System...");
  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      localStorage.setItem('webos_installed_zips', event.target.result);
      hideLoading();
      alert('System Restored Successfully! Reloading...');
      location.reload();
    } catch (err) {
      hideLoading();
      alert('Invalid Backup File!');
    }
  };
  reader.readAsText(file);
    }
