const $ = (id) => document.getElementById(id);
let state = {
  installDir: '',
  dataDir: '',
  launchPath: '',
};

function show(id) {
  for (const step of ['stepWelcome', 'stepLocation', 'stepProgress', 'stepDone']) {
    $(step).classList.toggle('hidden', step !== id);
  }
}

async function boot() {
  const d = await window.setup.defaults();
  state.installDir = d.installDir;
  state.dataDir = d.dataDir;
  $('installDir').value = d.installDir;
}

$('toLocation').addEventListener('click', () => show('stepLocation'));
$('backWelcome').addEventListener('click', () => show('stepWelcome'));

$('browseInstall').addEventListener('click', async () => {
  const p = await window.setup.pickInstallDir(state.installDir);
  if (p) {
    state.installDir = p;
    $('installDir').value = p;
  }
});

$('toInstall').addEventListener('click', async () => {
  show('stepProgress');
  $('progressText').textContent = 'Copying Master files...';
  $('barFill').style.width = '35%';
  try {
    await new Promise((r) => setTimeout(r, 250));
    $('barFill').style.width = '70%';
    $('progressText').textContent = 'Creating shortcuts...';
    const result = await window.setup.install({
      installDir: state.installDir,
      dataDir: state.dataDir,
      startMenu: $('startMenu').checked,
      desktop: $('desktop').checked,
    });
    $('barFill').style.width = '100%';
    state.launchPath = result.launchPath;
    $('donePath').textContent = result.installDir;
    await new Promise((r) => setTimeout(r, 300));
    show('stepDone');
  } catch (e) {
    alert(e.message || String(e));
    show('stepLocation');
  }
});

$('launchMaster').addEventListener('click', async () => {
  try {
    await window.setup.launch(state.launchPath);
    window.close();
  } catch (e) {
    alert(e.message || String(e));
  }
});

$('openFolder').addEventListener('click', () => {
  window.setup.openPath(state.installDir);
});

boot().catch((e) => {
  alert(e.message || String(e));
});
