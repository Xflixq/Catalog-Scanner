const $ = (id) => document.getElementById(id);
const TIMEOUT_MS = 30_000;
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

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after 30s`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function boot() {
  const d = await withTimeout(window.setup.defaults(), 'Startup');
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
  try {
    const p = await withTimeout(window.setup.pickInstallDir(state.installDir), 'Folder picker');
    if (p) {
      state.installDir = p;
      $('installDir').value = p;
    }
  } catch (e) {
    appendLog(e.message || String(e));
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
    const result = await withTimeout(
      window.setup.install({
        installDir: state.installDir,
        dataDir: state.dataDir,
        startMenu: $('startMenu').checked,
        desktop: $('desktop').checked,
      }),
      'Install',
    );
    setProgress(100, 'Finished');
    state.launchPath = result.launchPath;
    state.installDir = result.installDir || state.installDir;
    $('donePath').textContent = state.installDir;
    await new Promise((r) => setTimeout(r, 250));
    show('stepDone');
  } catch (e) {
    const msg = e.message || String(e);
    appendLog(msg);
    state.logsVisible = true;
    $('logDrawer').classList.remove('hidden');
    $('toggleLogs').textContent = 'Hide logs';
    $('progressText').textContent = msg.includes('EPERM') || msg.includes('not permitted')
      ? 'Permission blocked - choose a user folder'
      : 'Something went wrong';
    setTimeout(() => show('stepLocation'), 900);
  }
});

$('launchMaster').addEventListener('click', async () => {
  try {
    await withTimeout(window.setup.launch(state.launchPath), 'Launch');
    window.close();
  } catch (e) {
    appendLog(e.message || String(e));
    state.logsVisible = true;
    $('logDrawer').classList.remove('hidden');
    $('toggleLogs').textContent = 'Hide logs';
  }
});

$('openFolder').addEventListener('click', () => {
  window.setup.openPath(state.installDir);
});

boot().catch((e) => {
  appendLog(e.message || String(e));
});
