const $ = (id) => document.getElementById(id);
let state = {
  installDir: '',
  dataDir: '',
  launchPath: '',
  logsVisible: false,
  logs: [],
};

function show(id) {
  for (const step of ['stepWelcome', 'stepLocation', 'stepProgress', 'stepDone']) {
    $(step).classList.toggle('hidden', step !== id);
  }
}

function setProgress(pct, message) {
  const value = Math.max(0, Math.min(100, Number(pct) || 0));
  $('barFill').style.width = `${value}%`;
  $('progressPct').textContent = `${Math.round(value)}%`;
  if (message) $('progressText').textContent = message;
}

function appendLog(line) {
  if (!line) return;
  state.logs.push(String(line));
  if (state.logs.length > 400) state.logs = state.logs.slice(-400);
  $('logText').textContent = state.logs.join('\n');
  const drawer = $('logDrawer');
  drawer.scrollTop = drawer.scrollHeight;
}

async function boot() {
  const d = await window.setup.defaults();
  state.installDir = d.installDir;
  state.dataDir = d.dataDir;
  $('installDir').value = d.installDir;
}

window.setup.onProgress((payload = {}) => {
  if (typeof payload.pct === 'number') setProgress(payload.pct, payload.message);
  else if (payload.message) $('progressText').textContent = payload.message;
  if (payload.log) appendLog(payload.log);
});

$('toLocation').addEventListener('click', () => show('stepLocation'));
$('backWelcome').addEventListener('click', () => show('stepWelcome'));

$('browseInstall').addEventListener('click', async () => {
  const p = await window.setup.pickInstallDir(state.installDir);
  if (p) {
    state.installDir = p;
    $('installDir').value = p;
  }
});

$('toggleLogs').addEventListener('click', () => {
  state.logsVisible = !state.logsVisible;
  $('logDrawer').classList.toggle('hidden', !state.logsVisible);
  $('toggleLogs').textContent = state.logsVisible ? 'Hide logs' : 'Show logs';
});

$('toInstall').addEventListener('click', async () => {
  state.logs = [];
  state.logsVisible = false;
  $('logText').textContent = '';
  $('logDrawer').classList.add('hidden');
  $('toggleLogs').textContent = 'Show logs';
  show('stepProgress');
  setProgress(4, 'Setting things up...');
  try {
    const result = await window.setup.install({
      installDir: state.installDir,
      dataDir: state.dataDir,
      startMenu: $('startMenu').checked,
      desktop: $('desktop').checked,
    });
    setProgress(100, 'Finished');
    state.launchPath = result.launchPath;
    state.installDir = result.installDir || state.installDir;
    $('donePath').textContent = state.installDir;
    await new Promise((r) => setTimeout(r, 350));
    show('stepDone');
  } catch (e) {
    appendLog(e.message || String(e));
    state.logsVisible = true;
    $('logDrawer').classList.remove('hidden');
    $('toggleLogs').textContent = 'Hide logs';
    $('progressText').textContent = 'Something went wrong';
    // Stay on progress so logs are visible; offer back via location after alert-less UX
    setTimeout(() => show('stepLocation'), 1200);
  }
});

$('launchMaster').addEventListener('click', async () => {
  try {
    await window.setup.launch(state.launchPath);
    window.close();
  } catch (e) {
    appendLog(e.message || String(e));
  }
});

$('openFolder').addEventListener('click', () => {
  window.setup.openPath(state.installDir);
});

boot().catch((e) => {
  appendLog(e.message || String(e));
});
