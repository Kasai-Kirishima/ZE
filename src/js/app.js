import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import JSZip from 'jszip';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `ze-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const fmtSize = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const safeName = value => String(value || 'asset').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);
const extensions = {
  model: ['glb','gltf','fbx','obj','stl','ply'],
  texture: ['png','jpg','jpeg','webp','gif','bmp','tga'],
  script: ['zs'],
  zerobox: ['zbox'],
  audio: ['mp3','wav','ogg','m4a','aac'],
  scene: ['zescene']
};
const extOf = name => String(name).split('.').pop().toLowerCase();
const typeOf = name => {
  const ext = extOf(name);
  if (extensions.model.includes(ext)) return 'model';
  if (extensions.texture.includes(ext)) return 'texture';
  if (extensions.script.includes(ext)) return 'script';
  if (extensions.zerobox.includes(ext)) return 'zerobox';
  if (extensions.audio.includes(ext)) return 'audio';
  if (extensions.scene.includes(ext)) return 'scene';
  if (ext === 'mtl') return 'material';
  if (ext === 'bin') return 'binary';
  if (ext === 'json') return 'json';
  return 'file';
};
const iconFor = type => ({model:'📦',texture:'🖼️',script:'〈〉',zerobox:'◇',audio:'🎵',scene:'🎬',json:'{}',material:'🎨',binary:'📄',file:'📄',folder:'📁',primitive:'◈',camera:'📷',player:'♟',spawn:'⌖',light:'💡',skybox:'🌌'})[type] || '📄';
const DEFAULT_SCENE = () => ({ id: uid(), name: 'Main Scene', background: '#171717', grid: true, objects: [], skyboxAssetId: null });

let db = null;
let currentProject = null;
let currentTab = 'assets';
let assetFolderFilter = 'All';
let selectedId = null;
let selectedAssetId = null;
let sceneObjects = new Map();
let objectUrls = new Map();
let renderer, scene, editorCamera, orbit, transform, raycaster, pointer;
let gridHelper, axesHelper;
let selectedConnectionId = null;
let zeroCanvasPanActive = false;
let editorReady = false;
let isPlaying = false;
let previewCamera = null;
let playSnapshot = null;
let selectedBlockIds = new Set();
let zeroBlockClipboard = null;
let pendingZeroPort = null;
let zeroNodeDrag = null;
let activeZeroBoxCanvas = null;
let collisionHelpers = new Map();
let animationMixers = new Map();
let workbenchMode = null;
let selectedZeroBoxId = null;
let selectedBlockId = null;
let selectedUIElementId = null;
let uiKeyCaptureId = null;
let ignoreKeyUpCode = null;
let activeCustomAnimations = new Map();
let previewLook = { yaw: 0, pitch: 0, sensitivity: 0.0025 };
let previewMouseDrag = null;
let heldKeys = new Set();
let heldButtonTick = 0;
let runtimeGameSpeed = 1;
let joystickState = { x: 0, y: 0 };
let activeSpatialEditorDispose = null;
let lastFrame = performance.now();
let fpsFrames = 0, fpsStarted = performance.now();
let undoStack = [], redoStack = [];
let saveTimer = null;
let isRestoring = false;
let dragDepth = 0;

// ---------- Appearance ----------
function applyTheme(theme = 'dark') {
  const safe = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = safe;
  try { localStorage.setItem('zeroengine-theme', safe); } catch {}
  const label = safe === 'dark' ? '☼ Светлая тема' : '◐ Тёмная тема';
  ['#theme-toggle-home','#theme-toggle-editor'].forEach(selector => {
    const button = $(selector); if (button) button.textContent = label;
  });
}
function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
}

// ---------- Local project storage ----------
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступен в этом браузере'));
    const request = indexedDB.open('ZeroEngineDB', 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('projects')) database.createObjectStore('projects', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть хранилище'));
  });
}
function dbRequest(mode, action) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Локальное хранилище не готово'));
    const transaction = db.transaction('projects', mode);
    const store = transaction.objectStore('projects');
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const getAllProjects = () => dbRequest('readonly', store => store.getAll());
const putProject = project => dbRequest('readwrite', store => store.put(project));
const deleteProjectRecord = id => dbRequest('readwrite', store => store.delete(id));

function makeProject(name, description) {
  const sceneData = DEFAULT_SCENE();
  return {
    id: uid(), name: name.trim(), description: description.trim(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    activeSceneId: sceneData.id, scenes: [{ id: sceneData.id, name: sceneData.name, data: sceneData }],
    assets: [], scripts: [], assetFolders: [], zeroBoxes: [], uiElements: [], variables: [{id:uid(),name:'Value',type:'Number',value:0,system:true}]
  };
}
function activeScene() { return currentProject?.scenes.find(item => item.id === currentProject.activeSceneId) || currentProject?.scenes[0]; }
function activeSceneData() { return activeScene()?.data; }
function normalizeProject(project) {
  if (!project.scenes?.length) {
    const data = project.scene || DEFAULT_SCENE();
    project.scenes = [{ id: data.id || uid(), name: data.name || 'Main Scene', data }];
    project.activeSceneId = project.scenes[0].id;
  }
  project.scenes.forEach(item => {
    item.data ||= { ...DEFAULT_SCENE(), id: item.id, name: item.name, objects: [] };
    item.data.objects ||= [];
    // Clean up legacy editor starter lights, but preserve user-created lights.
    const legacyLightNames = new Set(['ambient light','default light','startup light','key light']);
    item.data.objects = item.data.objects.filter(entity => !(entity.type === 'light' && (entity.editorDefault === true || legacyLightNames.has(String(entity.name||'').trim().toLowerCase()))));
  });
  project.assets ||= [];
  project.scripts ||= [];
  project.assetFolders ||= [];
  project.zeroBoxes ||= [];
  project.uiElements ||= [];
  project.variables ||= [];
  project.variables.forEach(v => { if (v.type === 'Numericarray') v.value = Number(v.value) || 0; });
  if (!project.variables.some(v => v.name === 'Value')) project.variables.unshift({id:uid(),name:'Value',type:'Number',value:0,system:true});
  project.zeroBoxes.forEach(box => { box.blocks ||= []; box.variables ||= []; box.connections ||= []; box.zoom = Number.isFinite(box.zoom) ? Math.max(.15, Math.min(3, box.zoom)) : 1; box.blocks.forEach((block,index)=>{ block.config ||= {...ZEROBOX_DEFAULTS}; if(block.type==='Walking'){block.type='Moving';block.config.movementMode='direction';block.config.direction=block.config.side||'Forward';block.config.amount=Number(block.config.amount??block.config.speed)||1;delete block.config.side;} if(!Number.isFinite(block.x)) block.x=360+(index%3)*330; if(!Number.isFinite(block.y)) block.y=130+Math.floor(index/3)*250; }); box.blocks=box.blocks.filter(block=>block.type!=='Side'); box.connections=box.connections.filter(c=>box.blocks.some(b=>b.id===c.from?.nodeId)&&box.blocks.some(b=>b.id===c.to?.nodeId)); });
  project.scenes.forEach(sceneItem => (sceneItem.data.objects || []).forEach(entity => {
    if (entity.type === 'camera') entity.camera ||= { mode: 'isometric', fov: 60, zoom: 14, sensitivity: .0025 };
    if (entity.type === 'skybox') entity.skyboxAssetId ??= sceneItem.data.skyboxAssetId || null;
    if (entity.type === 'player' && !entity.cameraMount) { if (entity.name === 'Player Start') { entity.type = 'spawn'; entity.gameVisible = false; } else entity.cameraMount = { mode: 'head', offset: [0, 1.6, 0] }; }
    if (entity.type === 'playerStart') entity.type = 'spawn';
    if (entity.type === 'spawn' && entity.gameVisible == null) entity.gameVisible = false;
    if (entity.type === 'model' && entity.unitScaleApplied == null) entity.unitScaleApplied = false;
    if (!entity.collision) entity.collision = entity.type === 'player' ? { enabled: true, shape: 'capsule', size: [.6,1.8,.6], offset: [0,.9,0], isTrigger: false } : ['primitive','model'].includes(entity.type) ? { enabled: true, shape: 'box', size: [1,1,1], offset: [0,0,0], isTrigger: false, autoFit: entity.type === 'model' } : { enabled: false, shape: 'box', size: [1,1,1], offset: [0,0,0], isTrigger: false };
    if (entity.type === 'player' && !entity.playerCollisionDefaultsApplied) {
      entity.collision.enabled = true; entity.collision.shape = 'capsule';
      entity.collision.size ||= [.6,1.8,.6]; entity.collision.offset ||= [0,.9,0];
      entity.playerCollisionDefaultsApplied = true;
    }
    entity.collision.isTrigger ??= false;
    if (entity.type === 'player' && !entity.physics) entity.physics = { enabled: true, useGravity: true, mass: 1, velocity: [0,0,0], linearDamping: .05 };
    if (entity.physics) { entity.physics.velocity ||= [0,0,0]; entity.physics.useGravity ??= true; entity.physics.mass = Math.max(.01, Number(entity.physics.mass)||1); }
  }));
  // One-time upgrade: old primitive/model colliders were disabled 1x1x1 placeholders by default.
  // Enable only untouched default placeholders; custom collider settings remain unchanged.
  if (!project.collisionDefaultsMigratedV060) {
    const primitiveSizes = { plane:[4,.05,4], sphere:[1.4,1.4,1.4], cylinder:[1.1,1.2,1.1], cone:[1.4,1.35,1.4], capsule:[.84,1.54,.84] };
    for (const sceneItem of project.scenes) for (const entity of sceneItem.data.objects || []) {
      const collider = entity.collision;
      if (!collider || !['primitive','model'].includes(entity.type) || collider.userConfigured) continue;
      const defaultSize = (collider.size || []).length === 3 && collider.size.every(value => Math.abs(Number(value)-1)<1e-6);
      const defaultOffset = (collider.offset || [0,0,0]).every(value => Math.abs(Number(value)||0)<1e-6);
      if (collider.enabled === false && collider.shape === 'box' && defaultSize && defaultOffset && !collider.isTrigger) {
        collider.enabled = true;
        if (entity.type === 'primitive') collider.size = primitiveSizes[entity.primitive] || [1.2,1.2,1.2];
        if (entity.type === 'model') { collider.autoFit = true; collider.autoFitApplied = false; }
      }
    }
    project.collisionDefaultsMigratedV060 = true;
  }
  return project;
}

// ---------- Home / projects ----------
async function renderProjectList() {
  const list = $('#project-list');
  try {
    const projects = (await getAllProjects()).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    $('#project-count').textContent = `${projects.length} ${projects.length === 1 ? 'проект' : projects.length < 5 ? 'проекта' : 'проектов'}`;
    if (!projects.length) {
      list.innerHTML = '<div class="empty-projects"><div class="empty-icon">▱</div><strong>Пока нет проектов</strong><span>Создай новый проект или импортируй существующий ZIP.</span></div>';
      return;
    }
    list.innerHTML = projects.map(project => `
      <article class="project-card" data-open-project="${project.id}">
        <div class="project-card-top"><span class="project-symbol">◈</span><button class="delete-project" data-delete-project="${project.id}" title="Удалить проект">×</button></div>
        <h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.description || 'Без описания')}</p>
        <div class="project-card-foot"><span>${(project.assets || []).length} ASSETS</span><span>${new Date(project.updatedAt).toLocaleDateString('ru-RU')}</span></div>
      </article>`).join('');
    $$('[data-open-project]', list).forEach(card => card.addEventListener('click', event => {
      if (event.target.closest('[data-delete-project]')) return;
      const project = projects.find(item => item.id === card.dataset.openProject);
      if (project) openProject(project);
    }));
    $$('[data-delete-project]', list).forEach(button => button.addEventListener('click', async event => {
      event.stopPropagation();
      const id = button.dataset.deleteProject;
      const project = projects.find(item => item.id === id);
      if (!project || !confirm(`Удалить проект «${project.name}» из браузера?`)) return;
      await deleteProjectRecord(id);
      renderProjectList();
      toast('Проект удалён из браузера', 'success');
    }));
  } catch (error) {
    list.innerHTML = '<div class="empty-projects"><strong>Не удалось прочитать проекты</strong><span>Проверь, что браузер разрешает локальное хранилище.</span></div>';
    console.error(error);
  }
}
function showHome() {
  stopPlayMode();
  $('#editor-screen').classList.add('hidden');
  $('#home-screen').classList.remove('hidden');
  closeAllPanels();
  currentProject = null;
  selectedId = null;
  releaseObjectUrls();
  renderProjectList();
}
function createProjectModal() {
  showModal(`
    <div class="modal-header"><div><span class="panel-kicker">NEW WORKSPACE</span><h2 id="modal-title">Создать проект</h2><p>Задай название и короткое описание своего игрового проекта.</p></div><button class="modal-close" data-close-modal>×</button></div>
    <form id="create-project-form"><div class="modal-body">
      <label class="field-label">Название проекта<input class="field-input" id="new-project-name" maxlength="48" placeholder="Например, My First World" required /></label>
      <label class="field-label">Описание<textarea class="field-textarea" id="new-project-description" maxlength="240" placeholder="О чём будет твой проект? (необязательно)"></textarea></label>
      <div class="modal-note">Проект будет сохранён в локальном хранилище этого браузера. В любой момент его можно экспортировать в ZIP.</div>
    </div><div class="modal-footer"><button type="button" class="button button-quiet" data-close-modal>Отмена</button><button class="button button-primary" type="submit">Создать проект</button></div></form>`);
  $('#create-project-form').addEventListener('submit', async event => {
    event.preventDefault();
    const name = $('#new-project-name').value.trim();
    if (!name) return;
    const project = makeProject(name, $('#new-project-description').value);
    await putProject(project);
    closeModal();
    openProject(project);
  });
  $('#new-project-name').focus();
}
async function openProject(project) {
  currentProject = normalizeProject(project);
  selectedId = null;
  selectedBlockId = null; selectedBlockIds = new Set(); pendingZeroPort = null;
  selectedAssetId = null;
  currentTab = 'assets'; assetFolderFilter = 'All';
  undoStack = []; redoStack = [];
  releaseObjectUrls();
  $('#home-screen').classList.add('hidden');
  $('#editor-screen').classList.remove('hidden');
  $('#editor-project-name').textContent = currentProject.name;
  $('#active-scene-name').textContent = activeScene()?.name || 'Main Scene';
  $('#viewport-scene-name').textContent = activeScene()?.name || 'Main Scene';
  init3DEditor();
  await loadSceneIntoViewport();
  renderHierarchy();
  renderAssetPanel();
  renderInspector();
  updateViewportHint();
  await saveProject(false);
}
function scheduleSave() {
  if (!currentProject || isRestoring || isPlaying) return;
  $('#save-indicator').textContent = 'Есть несохранённые изменения…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProject(false), 700);
}
async function saveProject(showToast = true) {
  if (!currentProject || isPlaying) return;
  try {
    currentProject.updatedAt = new Date().toISOString();
    await putProject(currentProject);
    $('#save-indicator').textContent = 'Все изменения сохранены';
    if (showToast) toast('Проект сохранён в браузере', 'success');
  } catch (error) {
    console.error(error);
    $('#save-indicator').textContent = 'Ошибка локального сохранения';
    toast('Не удалось сохранить проект. Экспортируй ZIP.', 'error');
  }
}

// ---------- ZIP project import/export ----------
async function exportProjectZip() {
  if (!currentProject) return;
  if (!isPlaying) await saveProject(false);
  const exportingProject = isPlaying && playSnapshot ? playSnapshot : currentProject;
  const zip = new JSZip();
  const projectJson = {
    format: 'ZeroEngineProject', version: 1,
    id: exportingProject.id, name: exportingProject.name, description: exportingProject.description,
    createdAt: exportingProject.createdAt, updatedAt: exportingProject.updatedAt,
    activeSceneId: exportingProject.activeSceneId,
    scenes: exportingProject.scenes.map(({id,name,data}) => ({id,name,data})),
    scripts: exportingProject.scripts,
    zeroBoxes: exportingProject.zeroBoxes || [], uiElements: exportingProject.uiElements || [], variables: exportingProject.variables || [], assetFolders: exportingProject.assetFolders || [],
    assets: exportingProject.assets.map(({id,name,type,size,folder,path}) => ({id,name,type,size,folder,path}))
  };
  zip.file('project.json', JSON.stringify(projectJson, null, 2));
  const assetFolder = zip.folder('Assets');
  for (const asset of exportingProject.assets) {
    if (asset.blob) assetFolder.file(asset.path || `${asset.id}_${safeName(asset.name)}`, asset.blob);
  }
  const scenesFolder = zip.folder('Scenes');
  for (const item of exportingProject.scenes) scenesFolder.file(`${safeName(item.name)}.zescene`, JSON.stringify(item.data, null, 2));
  const scriptsFolder = zip.folder('Scripts');
  for (const item of exportingProject.scripts) scriptsFolder.file(`${safeName(item.name)}.zs`, item.code || '');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } });
  downloadBlob(blob, `${safeName(exportingProject.name)}.zeroengine.zip`);
  toast('ZIP проекта готов', 'success');
}
async function importProjectZip(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file('project.json');
    if (!manifestFile) throw new Error('В архиве нет project.json — это не ZIP-проект ZeroEngine.');
    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest.format !== 'ZeroEngineProject') throw new Error('Неизвестный формат проекта.');
    const project = normalizeProject({ ...manifest, id: uid(), updatedAt: new Date().toISOString(), assets: [], scripts: manifest.scripts || [], zeroBoxes: manifest.zeroBoxes || [], uiElements: manifest.uiElements || [], assetFolders: manifest.assetFolders || [], variables: manifest.variables || [] });
    for (const meta of manifest.assets || []) {
      const entry = zip.file(meta.path);
      if (!entry) continue;
      const blob = await entry.async('blob');
      project.assets.push({ ...meta, blob, size: blob.size });
    }
    await putProject(project);
    $('#project-import-input').value = '';
    toast('Проект импортирован', 'success');
    openProject(project);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Не удалось импортировать проект', 'error');
  }
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

// ---------- 3D scene / viewport ----------
function init3DEditor() {
  if (editorReady) {
    resizeRenderer();
    return;
  }
  const canvas = $('#viewport-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#171717');
  scene.environment = null; // No default environment illumination or startup lights.
  editorCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  editorCamera.position.set(7, 6, 9);
  orbit = new OrbitControls(editorCamera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor = .08;
  orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  orbit.target.set(0, 0.8, 0);
  orbit.maxPolarAngle = Math.PI * .495;
  gridHelper = new THREE.GridHelper(100, 100, 0x53645b, 0x334139);
  gridHelper.material.transparent = true; gridHelper.material.opacity = .55;
  scene.add(gridHelper);
  axesHelper = new THREE.AxesHelper(2.3); scene.add(axesHelper);
  transform = new TransformControls(editorCamera, canvas);
  transform.setMode('translate');
  transform.setSize(0.85);
  transform.addEventListener('dragging-changed', event => { if (event.value) snapshotHistory(); orbit.enabled = !event.value && !isPlaying; });
  transform.addEventListener('objectChange', () => { syncSelectedTransform(); updateInspectorTransformValues(); });
  transform.addEventListener('mouseUp', () => { scheduleSave(); });
  scene.add(transform.getHelper());
  raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2();
  canvas.addEventListener('pointerdown', onViewportPointerDown);
  canvas.addEventListener('pointerdown', onPreviewCanvasPointerDown);
  canvas.addEventListener('pointerup',()=>{previewMouseDrag=null;});
  canvas.addEventListener('pointercancel',()=>{previewMouseDrag=null;});
  document.addEventListener('mousemove',onPreviewDocumentMove);
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)previewMouseDrag=null;});
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('dragenter', event => { event.preventDefault(); $('#viewport-drop-overlay').classList.add('visible'); });
  canvas.addEventListener('dragover', event => event.preventDefault());
  canvas.addEventListener('dragleave', event => { if (!canvas.contains(event.relatedTarget)) $('#viewport-drop-overlay').classList.remove('visible'); });
  canvas.addEventListener('drop', event => {
    event.preventDefault(); $('#viewport-drop-overlay').classList.remove('visible');
    const modelId=event.dataTransfer?.getData('application/x-zeroengine-model');
    const boxId=event.dataTransfer?.getData('application/x-zeroengine-zerobox');
    const objectId=event.dataTransfer?.getData('application/x-zeroengine-object');
    if(modelId){const asset=currentProject?.assets.find(a=>a.id===modelId);if(asset)addObjectToScene('model',{assetId:asset.id,name:asset.name.replace(/\.[^.]+$/,'')});return;}
    if(objectId){const entity=findEntity(objectId),rect=canvas.getBoundingClientRect();if(entity){pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,editorCamera);const ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();if(raycaster.ray.intersectPlane(ground,point)){entity.position=[point.x,point.y,point.z];sceneObjects.get(entity.id)?.position.copy(point);selectObject(entity.id);scheduleSave();toast(`Объект «${entity.name}» перемещён на сцену`,'success');}}return;}
    if(boxId){const box=currentProject?.zeroBoxes.find(b=>b.id===boxId);if(!box)return;if(!selectedId){toast('Выбери объект в сцене, чтобы назначить ему ZeroBox','error');return;}box.targetObjectId=selectedId;scheduleSave();toast(`${box.name} назначен объекту ${findEntity(selectedId)?.name||''}`,'success');return;}
    if (event.dataTransfer?.files?.length) addAssetsFromFiles([...event.dataTransfer.files]);
  });
  window.addEventListener('resize', resizeRenderer);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // No input capture or player movement in the current preview mode.
  editorReady = true;
  resizeRenderer();
  renderer.setAnimationLoop(renderFrame);
}
function resizeRenderer() {
  if (!renderer || !editorCamera) return;
  const wrap = $('#viewport-wrap');
  if (!wrap) return;
  const width = Math.max(1, wrap.clientWidth), height = Math.max(1, wrap.clientHeight);
  renderer.setSize(width, height, false);
  editorCamera.aspect = width / height; editorCamera.updateProjectionMatrix();
  if (previewCamera) { previewCamera.aspect = width / height; previewCamera.updateProjectionMatrix(); }
}
function getColliderBounds(entity, position = entity.position) {
  const cfg=entity.collision||{}, size=cfg.size||[1,1,1], offset=cfg.offset||[0,0,0], scale=entity.scale||[1,1,1];
  const half=size.map((v,i)=>Math.max(.005,Math.abs(Number(v)||.01)*Math.abs(Number(scale[i])||1)/2));
  const center=position.map((v,i)=>Number(v||0)+(Number(offset[i])||0)*(Number(scale[i])||1));
  return {min:center.map((v,i)=>v-half[i]),max:center.map((v,i)=>v+half[i]),half,center};
}
function boundsOverlap(a,b,epsilon=1e-5) {
  return a.min[0]<b.max[0]-epsilon && a.max[0]>b.min[0]+epsilon && a.min[1]<b.max[1]-epsilon && a.max[1]>b.min[1]+epsilon && a.min[2]<b.max[2]-epsilon && a.max[2]>b.min[2]+epsilon;
}
function moveEntityWithCollisions(entity, delta) {
  const object=sceneObjects.get(entity.id);if(!object)return [0,0,0];
  const start=[...entity.position],next=[...start];
  const collidable=(activeSceneData()?.objects||[]).filter(other=>other.id!==entity.id&&other.collision?.enabled&&!other.collision?.isTrigger);
  const ownEnabled=entity.collision?.enabled===true&&!entity.collision?.isTrigger;
  for(let axis=0;axis<3;axis++){
    const amount=Number(delta[axis])||0;if(Math.abs(amount)<1e-9)continue;
    const before=getColliderBounds(entity,next);
    next[axis]+=amount;
    if(ownEnabled){
      for(const other of collidable){
        const obstacle=getColliderBounds(other,other.position);
        const candidate=getColliderBounds(entity,next);
        const crossAxes=[0,1,2].filter(i=>i!==axis);
        if(!crossAxes.every(i=>candidate.min[i]<obstacle.max[i]-1e-6&&candidate.max[i]>obstacle.min[i]+1e-6))continue;
        const sweptPositive=amount>0&&before.max[axis]<=obstacle.min[axis]+1e-6&&candidate.max[axis]>obstacle.min[axis];
        const sweptNegative=amount<0&&before.min[axis]>=obstacle.max[axis]-1e-6&&candidate.min[axis]<obstacle.max[axis];
        const alreadyOverlapping=candidate.min[axis]<obstacle.max[axis]-1e-6&&candidate.max[axis]>obstacle.min[axis]+1e-6;
        if(sweptPositive||alreadyOverlapping&&amount>0){
          const localOffset=(Number(entity.collision.offset?.[axis])||0)*(Number(entity.scale?.[axis])||1);
          next[axis]=obstacle.min[axis]-candidate.half[axis]-localOffset;
        } else if(sweptNegative||alreadyOverlapping&&amount<0){
          const localOffset=(Number(entity.collision.offset?.[axis])||0)*(Number(entity.scale?.[axis])||1);
          next[axis]=obstacle.max[axis]+candidate.half[axis]-localOffset;
        }
      }
    }
    if(axis===1){
      const bounds=getColliderBounds(entity,next);
      const floorBottom=ownEnabled?bounds.min[1]:next[1];
      if(floorBottom<0)next[1]+= -floorBottom;
    }
  }
  const moved=next.map((value,i)=>value-start[i]);entity.position=next;object.position.fromArray(next);
  if(isPlaying&&entity.type==='player'&&previewCamera)previewCamera.position.add(new THREE.Vector3(...moved));
  return moved;
}

function stepBasicPhysics(delta) {
  if(!isPlaying||!currentProject)return;
  for(const entity of activeSceneData()?.objects||[]){
    const body=entity.physics;if(!body?.enabled)continue;
    body.velocity ||= [0,0,0];const velocity=body.velocity;
    if(body.useGravity!==false)velocity[1]-=9.81*delta;
    const damping=Math.max(0,Number(body.linearDamping)||0);const damp=Math.exp(-damping*delta);
    velocity[0]*=damp;velocity[2]*=damp;
    const moved=moveEntityWithCollisions(entity,velocity.map(v=>v*delta));
    if(Math.abs(moved[0]-velocity[0]*delta)>1e-5)velocity[0]=0;
    if(Math.abs(moved[2]-velocity[2]*delta)>1e-5)velocity[2]=0;
    if(Math.abs(moved[1]-velocity[1]*delta)>1e-5)velocity[1]=0;
  }
}

function applyPreviewLook(dx,dy,sensitivity=previewLook.sensitivity||.0025) {
  if(!isPlaying||!previewCamera)return;
  previewLook.yaw -= dx*sensitivity;previewLook.pitch -= dy*sensitivity;
  previewLook.pitch=Math.max(-Math.PI/2+.02,Math.min(Math.PI/2-.02,previewLook.pitch));
  previewCamera.rotation.set(previewLook.pitch,previewLook.yaw,0,'YXZ');
}
function onPreviewCanvasPointerDown(event) {
  if(!isPlaying||event.button!==0||event.target.closest?.('.game-ui-layer'))return;
  previewMouseDrag={x:event.clientX,y:event.clientY,pointerId:event.pointerId};
  renderer.domElement.setPointerCapture?.(event.pointerId);
  try { const request=renderer.domElement.requestPointerLock?.(); request?.catch?.(()=>{}); } catch {}
}
function onPreviewDocumentMove(event) {
  if(!isPlaying)return;
  if(document.pointerLockElement===renderer?.domElement){applyPreviewLook(event.movementX||0,event.movementY||0);return;}
  if(previewMouseDrag){const dx=event.clientX-previewMouseDrag.x,dy=event.clientY-previewMouseDrag.y;previewMouseDrag.x=event.clientX;previewMouseDrag.y=event.clientY;applyPreviewLook(dx,dy);}
}
function stopPreviewMouseLook(){previewMouseDrag=null;if(document.pointerLockElement===renderer?.domElement)document.exitPointerLock?.();}

function renderFrame(now) {
  if (!renderer || !scene) return;
  const rawDelta = Math.min((now - lastFrame) / 1000, .05); lastFrame = now;
  const delta = isPlaying ? rawDelta * runtimeGameSpeed : rawDelta;
  if (!isPlaying) orbit?.update();
  for (const mixer of animationMixers.values()) mixer.update(delta);
  updateCustomAnimations(delta);
  if (isPlaying) { stepBasicPhysics(delta); tickHeldButtons(rawDelta); tickJoystickBoxes(rawDelta); }
  renderer.render(scene, isPlaying && previewCamera ? previewCamera : editorCamera);
  fpsFrames++;
  if (now - fpsStarted > 1000) { $('#fps-label').textContent = `${Math.round(fpsFrames * 1000 / (now - fpsStarted))} FPS`; fpsFrames = 0; fpsStarted = now; }
}
function onViewportPointerDown(event) {
  if (isPlaying || event.button !== 0 || transform?.dragging) return;
  const canvas=renderer.domElement,startX=event.clientX,startY=event.clientY;
  const finish=upEvent=>{
    canvas.removeEventListener('pointerup',finish);
    if(Math.hypot(upEvent.clientX-startX,upEvent.clientY-startY)>5 || transform?.dragging || isPlaying)return;
    const rect=canvas.getBoundingClientRect();
    pointer.x=((upEvent.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((upEvent.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,editorCamera);
    const candidates=[];for(const object of sceneObjects.values())object.traverse(child=>{if(child.isMesh)candidates.push(child);});
    const hits=raycaster.intersectObjects(candidates,false);
    if(!hits.length){selectObject(null);return;}
    let target=hits[0].object;while(target&&!target.userData.entityId)target=target.parent;
    if(target?.userData.entityId)selectObject(target.userData.entityId);
  };
  canvas.addEventListener('pointerup',finish,{once:true});
}
function onKeyDown(event) {
  const tag = document.activeElement?.tagName;
  const editing = ['INPUT','TEXTAREA','SELECT'].includes(tag) || document.activeElement?.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); exportProjectZip(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); undo(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && !editing) { event.preventDefault(); redo(); return; }
  if (!editing && workbenchMode==='zerobox' && (event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='a') { event.preventDefault(); const box=currentProject?.zeroBoxes.find(item=>item.id===selectedZeroBoxId); selectedBlockIds=new Set((box?.blocks||[]).map(b=>b.id)); selectedBlockId=[...selectedBlockIds][0]||null; renderWorkbench(); return; }
  if (!editing && workbenchMode==='zerobox' && (event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='c') { event.preventDefault(); copyZeroBlocks(); return; }
  if (!editing && workbenchMode==='zerobox' && (event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='v') { event.preventDefault(); pasteZeroBlocks(); return; }
  if (!editing && workbenchMode==='zerobox' && ['Delete','Backspace'].includes(event.key)) { event.preventDefault(); deleteSelectedZeroBlocks(); return; }
  if (uiKeyCaptureId) {
    event.preventDefault();
    const captureId = uiKeyCaptureId;
    const uiElement = currentProject?.uiElements.find(item => item.id === captureId);
    uiKeyCaptureId = null;
    ignoreKeyUpCode = event.code || event.key;
    if (uiElement) {
      uiElement.key = event.key;
      uiElement.keyLabel = event.key === ' ' ? 'Space' : event.key;
      renderWorkbench(); scheduleSave();
      toast(`Клавиша ${uiElement.keyLabel} назначена`, 'success');
    }
    return;
  }
  if (event.key === 'Escape' && isPlaying) { stopPlayMode(); return; }
  if (isPlaying) { triggerZeroBoxKey(event); return; }
  if (editing) return;
  triggerZeroBoxKey(event);
  if (event.key.toLowerCase() === 'w') setTransformMode('translate');
  if (event.key.toLowerCase() === 'e') setTransformMode('rotate');
  if (event.key.toLowerCase() === 'r') setTransformMode('scale');
  if ((event.key === 'Delete' || event.key === 'Backspace') && workbenchMode==='zerobox' && selectedConnectionId) { const box=currentProject?.zeroBoxes.find(item=>item.id===selectedZeroBoxId); if(box){box.connections=box.connections.filter(c=>c.id!==selectedConnectionId);selectedConnectionId=null;renderWorkbench();scheduleSave();} return; }
  if ((event.key === 'Delete' || event.key === 'Backspace') && workbenchMode==='zerobox' && selectedBlockIds.size) { const id=[...selectedBlockIds][0]; deleteZeroBlock(id); return; }
  if (event.key === 'Delete' || event.key === 'Backspace') deleteSelectedObject();
}
function onKeyUp(event) {
  if (ignoreKeyUpCode && (event.code === ignoreKeyUpCode || event.key === ignoreKeyUpCode)) { ignoreKeyUpCode = null; return; }
  const tag = document.activeElement?.tagName;
  const editing = ['INPUT','TEXTAREA','SELECT'].includes(tag) || document.activeElement?.isContentEditable;
  if (!isPlaying && editing) return;
  triggerZeroBoxKeyUp(event);
}
function setTransformMode(mode) {
  if (!transform) return;
  transform.setMode(mode);
  $$('[data-transform]').forEach(button => button.classList.toggle('active', button.dataset.transform === mode));
}
function selectObject(id) {
  selectedId = id;
  const object = id ? sceneObjects.get(id) : null;
  if (transform) {
    if (object && !isPlaying) transform.attach(object);
    else transform.detach();
  }
  renderHierarchy(); renderInspector(); updateSelectedStatus();
}
function findEntity(id) { return activeSceneData()?.objects.find(item => item.id === id); }
function updateSelectedStatus() {
  const entity = selectedId ? findEntity(selectedId) : null;
  $('#selected-status').textContent = entity ? `Выбран: ${entity.name}` : 'Ничего не выбрано';
  const obj = selectedId ? sceneObjects.get(selectedId) : null;
  if (obj) $('#viewport-coordinate').innerHTML = `X ${obj.position.x.toFixed(2)}&nbsp;&nbsp; Y ${obj.position.y.toFixed(2)}&nbsp;&nbsp; Z ${obj.position.z.toFixed(2)}`;
  else $('#viewport-coordinate').textContent = 'X 0.00   Y 0.00   Z 0.00';
}
function updateViewportHint() { $('#viewport-empty-hint').classList.toggle('hidden', (activeSceneData()?.objects.length || 0) > 0); }
function renderHierarchy() {
  if (!currentProject) return;
  const list = $('#hierarchy-list');
  const entities = activeSceneData()?.objects || [];
  if (!entities.length) list.innerHTML = '<div class="asset-empty">Сцена пока пустая.</div>';
  else list.innerHTML = entities.map(item => `<div class="tree-item ${selectedId === item.id ? 'selected' : ''}" data-tree-id="${item.id}" draggable="true"><span class="tree-icon">${iconFor(item.type === 'model' ? 'model' : item.type)}</span><span class="tree-name">${escapeHtml(item.name)}</span><span class="tree-kind">${item.type === 'primitive' ? item.primitive?.toUpperCase() || 'MESH' : item.type.toUpperCase()}</span></div>`).join('');
  $$('[data-tree-id]', list).forEach(row => {row.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-zeroengine-object',row.dataset.treeId);event.dataTransfer.effectAllowed='copy';});row.addEventListener('click', () => selectObject(row.dataset.treeId));});
  $('#object-count').textContent = `${entities.length} ${entities.length === 1 ? 'объект' : entities.length < 5 ? 'объекта' : 'объектов'}`;
  updateViewportHint();
}
function syncSelectedTransform() {
  const entity = findEntity(selectedId), object = sceneObjects.get(selectedId);
  if (!entity || !object) return;
  entity.position = object.position.toArray(); entity.rotation = [THREE.MathUtils.radToDeg(object.rotation.x), THREE.MathUtils.radToDeg(object.rotation.y), THREE.MathUtils.radToDeg(object.rotation.z)]; entity.scale = object.scale.toArray();
  updateSelectedStatus();
}
function addObjectToScene(type = 'primitive', options = {}) {
  if (!currentProject) return;
  snapshotHistory();
  const labelMap = {cube:'Cube',sphere:'Sphere',plane:'Plane',circle:'Circle',cylinder:'Cylinder',cone:'Cone',capsule:'Capsule',torus:'Torus',torusKnot:'Torus Knot',ring:'Ring',tube:'Tube',pipe:'Pipe',pyramid:'Pyramid',wedge:'Wedge',stairs:'Stairs',tetrahedron:'Tetrahedron',octahedron:'Octahedron',icosahedron:'Icosahedron',dodecahedron:'Dodecahedron',camera:'Camera',player:'Player',spawn:'Player Start',light:'Point Light',skybox:'Skybox'};
  const entity = {
    id: uid(), name: options.name || (type === 'primitive' ? labelMap[options.primitive] || 'Object' : labelMap[type] || 'Object'),
    type, primitive: options.primitive || undefined, assetId: options.assetId || undefined,
    position: options.position || (type==='camera'?[8,8,8]:[0, type === 'primitive' && options.primitive === 'plane' ? 0 : 0.5, 0]),
    rotation: type==='camera'?[-35.264,45,0]:[0,0,0], scale: [1,1,1], visible: true, gameVisible: type !== 'spawn',
    cameraMount: type === 'player' ? { mode: 'head', offset: [0,1.6,0] } : undefined,
    camera: type === 'camera' ? { mode:'isometric', fov:60, zoom:14, sensitivity:.0025 } : undefined,
    skyboxAssetId: type === 'skybox' ? (activeSceneData().skyboxAssetId||null) : undefined,
    collision: type === 'player' ? { enabled: true, shape: 'capsule', size: [.6,1.8,.6], offset: [0,.9,0], isTrigger: false } : type === 'primitive' ? { enabled: true, shape: 'box', size: ({plane:[4,.05,4],sphere:[1.4,1.4,1.4],cylinder:[1.1,1.2,1.1],cone:[1.4,1.35,1.4],capsule:[.84,1.54,.84],pipe:[1.1,1.2,1.1],pyramid:[1.7,1.25,1.7],wedge:[1.6,1,1.4],stairs:[2,1,0.9]})[options.primitive] || [1.2,1.2,1.2], offset: [0,0,0], isTrigger: false } : type === 'model' ? { enabled: true, shape: 'box', size: [1,1,1], offset: [0,0,0], isTrigger: false, autoFit: true } : { enabled: false, shape: 'box', size: [1,1,1], offset: [0,0,0], isTrigger: false },
    physics: type === 'player' ? { enabled: true, useGravity: true, mass: 1, velocity: [0,0,0], linearDamping: .05 } : { enabled: false, useGravity: true, mass: 1, velocity: [0,0,0], linearDamping: .05 },
    material: { color: '#a5ef4c', roughness: .72, tileX: 1, tileY: 1 },
    light: type === 'light' ? { kind: 'point', color: '#fff2d6', intensity: 2, distance: 12 } : undefined
  };
  activeSceneData().objects.push(entity);
  createRuntimeObject(entity).then(() => { selectObject(entity.id); renderHierarchy(); scheduleSave(); }).catch(error => { console.error(error); activeSceneData().objects = activeSceneData().objects.filter(item => item.id !== entity.id); sceneObjects.delete(entity.id); renderHierarchy(); renderInspector(); toast(`Не удалось добавить объект: ${error.message || 'ошибка загрузки'}`, 'error'); scheduleSave(); });
  renderHierarchy();
  return entity;
}
function createPrimitiveMesh(entity) {
  const dimensions = entity.primitive;
  let geometry;
  switch (dimensions) {
    case 'sphere': geometry = new THREE.SphereGeometry(.7, 32, 22); break;
    case 'plane': geometry = new THREE.PlaneGeometry(4, 4, 1, 1); geometry.rotateX(-Math.PI / 2); break;
    case 'circle': geometry = new THREE.CircleGeometry(.75, 40); geometry.rotateX(-Math.PI / 2); break;
    case 'tube': geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.8,0,0),new THREE.Vector3(-.4,.3,0),new THREE.Vector3(.4,-.3,0),new THREE.Vector3(.8,0,0)]),48,.12,8,false); break;
    case 'pipe': geometry = new THREE.CylinderGeometry(.55,.55,1.2,24,1,true); break;
    case 'pyramid': geometry = new THREE.ConeGeometry(.85,1.25,4); geometry.rotateY(Math.PI/4); break;
    case 'wedge': { const positions=[-.8,-.5,-.7,.8,-.5,-.7,.8,-.5,.7,-.8,-.5,.7,-.8,.5,-.7,.8,-.5,-.7,.8,-.5,.7,-.8,.5,.7]; geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex([0,1,2,0,2,3,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,4,7,6,4,6,5]);geometry.computeVertexNormals();break;}
    case 'stairs': { const group=new THREE.Group();const material=new THREE.MeshStandardMaterial({color:entity.material?.color||'#a5ef4c',roughness:Number(entity.material?.roughness??.72)});for(let i=0;i<4;i++){const step=new THREE.Mesh(new THREE.BoxGeometry(.5,(i+1)*.25,.9),material.clone());step.position.set(-.75+i*.5,(i+1)*.125,0);group.add(step);}return group; }
    case 'cylinder': geometry = new THREE.CylinderGeometry(.55, .55, 1.2, 24); break;
    case 'cone': geometry = new THREE.ConeGeometry(.7, 1.35, 24); break;
    case 'capsule': geometry = new THREE.CapsuleGeometry(.42, .7, 5, 14); break;
    case 'torus': geometry = new THREE.TorusGeometry(.62,.2,16,48); break;
    case 'torusKnot': geometry = new THREE.TorusKnotGeometry(.48,.14,96,14); break;
    case 'ring': geometry = new THREE.RingGeometry(.28,.72,40); break;
    case 'tetrahedron': geometry = new THREE.TetrahedronGeometry(.8); break;
    case 'octahedron': geometry = new THREE.OctahedronGeometry(.8); break;
    case 'icosahedron': geometry = new THREE.IcosahedronGeometry(.8); break;
    case 'dodecahedron': geometry = new THREE.DodecahedronGeometry(.8); break;
    default: geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  }
  const material = new THREE.MeshStandardMaterial({ color: entity.material?.color || '#a5ef4c', roughness: Number(entity.material?.roughness ?? .72), metalness: Number(entity.material?.metalness ?? 0) });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}
function makeMarker(entity) {
  const group = new THREE.Group();
  if (entity.type === 'skybox') {
    const shell=new THREE.Mesh(new THREE.SphereGeometry(.55,16,12),new THREE.MeshBasicMaterial({color:'#aaaaaa',wireframe:true}));shell.userData.editorOnly=true;group.add(shell);return group;
  } else if (entity.type === 'camera') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(.55,.35,.7), new THREE.MeshBasicMaterial({color:'#78a9ff'}));
    body.position.y = .2; group.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.28,16), new THREE.MeshBasicMaterial({color:'#172638'}));
    lens.rotation.x = Math.PI/2; lens.position.set(0,.2,-.45); group.add(lens);
    const isIso=(entity.camera?.mode||'isometric')==='isometric';
    const depth=isIso?Math.max(6,Number(entity.camera?.zoom)||14):5;
    const half=isIso?Math.max(2,Number(entity.camera?.zoom)||14)*.5:Math.tan(THREE.MathUtils.degToRad(entity.camera?.fov||60)/2)*depth;
    const aspect=1.6;
    const corners=[new THREE.Vector3(-half*aspect,-half,-depth),new THREE.Vector3(half*aspect,-half,-depth),new THREE.Vector3(half*aspect,half,-depth),new THREE.Vector3(-half*aspect,half,-depth)];
    const points=[];for(let i=0;i<4;i++){points.push(new THREE.Vector3(0,0,0),corners[i],corners[i],corners[(i+1)%4]);}
    const frustumGeo=new THREE.BufferGeometry().setFromPoints(points);const frustum=new THREE.LineSegments(frustumGeo,new THREE.LineBasicMaterial({color:'#dddddd',transparent:true,opacity:.8}));frustum.userData.editorOnly=true;group.add(frustum);
  } else {
    const isSpawn = entity.type === 'spawn';
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(isSpawn ? .18 : .3, isSpawn ? .35 : 1, 4, 12), new THREE.MeshBasicMaterial({color:isSpawn ? '#ffc66e' : '#d1e5cb', transparent:isSpawn, opacity:isSpawn ? .45 : 1}));
    body.position.y = isSpawn ? .35 : .8; group.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(isSpawn ? .38 : .5,.04,8,24), new THREE.MeshBasicMaterial({color:isSpawn ? '#ffb64c' : '#a5ef4c'})); ring.rotation.x = Math.PI/2; ring.position.y = .05; group.add(ring);
  }
  return group;
}
function makeLightObject(entity) {
  const group = new THREE.Group();
  const cfg = entity.light || { kind:'point', color:'#fff2d6', intensity:2, distance:12 };
  let light;
  if (cfg.kind === 'directional') light = new THREE.DirectionalLight(cfg.color || '#fff2d6', Number(cfg.intensity ?? 2));
  else if (cfg.kind === 'spot') light = new THREE.SpotLight(cfg.color || '#fff2d6', Number(cfg.intensity ?? 2), Number(cfg.distance ?? 12), Math.PI/5);
  else light = new THREE.PointLight(cfg.color || '#fff2d6', Number(cfg.intensity ?? 2), Number(cfg.distance ?? 12));
  light.position.set(0, .5, 0); light.castShadow = false; group.add(light);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), new THREE.MeshBasicMaterial({color:cfg.color || '#fff2d6'})); marker.position.set(0,.5,0); marker.userData.editorOnly = true; group.add(marker);
  group.userData.light = light;
  return group;
}
function attachStoredRig(entity, object) {
  const bones = entity.rig?.bones;
  if (!Array.isArray(bones) || !bones.length) return;
  let already=false; object.traverse(child=>{if(child.userData?.zeroEngineRigBone)already=true;}); if(already)return;
  const created = new Map();
  for (const data of bones) {
    const bone = new THREE.Bone(); bone.name = data.name; bone.position.fromArray(data.position || [0,0,0]); bone.userData.zeroEngineRigBone = true;
    const parent = data.parent ? (created.get(data.parent) || object.getObjectByName(data.parent)) : object;
    (parent || object).add(bone); created.set(data.name, bone);
  }
}
function attachCollisionHelper(entity, object) {
  if (!entity.collision) entity.collision = { enabled:false, shape:'box', size:[1,1,1], offset:[0,0,0] };
  const cfg = entity.collision;
  let geometry;
  const size = cfg.size || [1,1,1];
  if (cfg.shape === 'sphere') geometry = new THREE.SphereGeometry(Math.max(...size)/2, 16, 10);
  else if (cfg.shape === 'capsule') geometry = new THREE.CapsuleGeometry(Math.max(.02,Math.min(size[0],size[2])/2), Math.max(.02,size[1]-Math.min(size[0],size[2])), 6, 12);
  else geometry = new THREE.BoxGeometry(Math.max(.01,size[0]),Math.max(.01,size[1]),Math.max(.01,size[2]));
  const helper = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:0x67d8ff, wireframe:true, transparent:true, opacity:.58, depthWrite:false}));
  helper.position.fromArray(cfg.offset || [0,0,0]); helper.userData.collisionHelper = true;
  helper.visible = !!cfg.enabled && !isPlaying; object.add(helper); collisionHelpers.set(entity.id, helper);
}
function updateCollisionHelper(entity) {
  const object = sceneObjects.get(entity.id); if (!object) return;
  const old = collisionHelpers.get(entity.id); if (old) { object.remove(old); old.geometry.dispose(); old.material.dispose(); collisionHelpers.delete(entity.id); }
  attachCollisionHelper(entity, object);
}
function applySceneSkybox() {
  if (!scene || !activeSceneData()) return;
  const asset = currentProject?.assets.find(item => item.id === activeSceneData().skyboxAssetId && item.type === 'texture');
  if (!asset?.blob) { scene.background = new THREE.Color(activeSceneData().background || '#182126'); scene.environment = null; return; }
  const loader = new THREE.TextureLoader();
  loader.load(getAssetUrl(asset), texture => {
    texture.colorSpace = THREE.SRGBColorSpace; texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture; scene.environment = texture;
  }, undefined, error => { console.warn('Skybox texture failed', error); toast('Не удалось загрузить Skybox', 'error'); });
}
async function createRuntimeObject(entity) {
  const existing = sceneObjects.get(entity.id);
  if (existing) { scene.remove(existing); sceneObjects.delete(entity.id); }
  let object;
  if (entity.type === 'model') object = await loadModelAsset(entity.assetId);
  else if (entity.type === 'camera' || entity.type === 'player' || entity.type === 'spawn') object = makeMarker(entity);
  else if (entity.type === 'light') object = makeLightObject(entity);
  else if (entity.type === 'skybox') object = makeMarker(entity);
  else object = createPrimitiveMesh(entity);
  if (!object) return null;
  object.userData.entityId = entity.id;
  object.name = entity.name;
  object.position.fromArray(entity.position || [0,0,0]);
  const rot = entity.rotation || [0,0,0]; object.rotation.set(...rot.map(value => THREE.MathUtils.degToRad(value)));
  if (entity.type === 'model' && entity.collision?.autoFit && !entity.collision.autoFitApplied) {
    const localBounds = new THREE.Box3().setFromObject(object);
    const localSize = localBounds.getSize(new THREE.Vector3());
    const localCenter = localBounds.getCenter(new THREE.Vector3());
    if (localSize.lengthSq() > 1e-8) {
      entity.collision.size = [Math.max(.01,localSize.x),Math.max(.01,localSize.y),Math.max(.01,localSize.z)];
      entity.collision.offset = [localCenter.x,localCenter.y,localCenter.z];
      entity.collision.autoFitApplied = true;
    }
  }
  if (entity.type === 'model' && !entity.unitScaleApplied) {
    const bounds = new THREE.Box3().setFromObject(object); const size = bounds.getSize(new THREE.Vector3()); const maxSize = Math.max(size.x,size.y,size.z);
    const asset=currentProject.assets.find(a=>a.id===entity.assetId); const ext=asset?extOf(asset.name):'';
    const autoFactor = maxSize > 10000 ? .001 : (maxSize > 100 || (ext==='fbx' && maxSize > 10)) ? .01 : maxSize > 0 && maxSize < .005 ? 100 : 1;
    const factors={meters:1,centimeters:.01,millimeters:.001};
    const unitFactor=entity.unitMode&&entity.unitMode!=='auto'?(factors[entity.unitMode]||1):autoFactor;
    entity.scale = (entity.scale || [1,1,1]).map(value => value * unitFactor); entity.unitScaleApplied = true; entity.detectedUnitScale = autoFactor; entity.unitScaleFactor=unitFactor; entity.unitMode ||= 'auto';
    if (unitFactor !== 1) toast(`Масштаб модели нормализован ×${unitFactor}`, 'success');
  }
  object.scale.fromArray(entity.scale || [1,1,1]);
  object.visible = entity.visible !== false;
  applyEntityAppearance(entity, object);
  object.traverse(child => { if (child.isMesh) normalizeImportedMaterials(child); });
  if (entity.type === 'model' && object.userData.animationClips?.length) entity.availableAnimations = object.userData.animationClips.map(clip => clip.name);
  attachStoredRig(entity, object);
  attachCollisionHelper(entity, object);
  scene.add(object);
  sceneObjects.set(entity.id, object);
  setAllEditorMaterials();
  return object;
}
async function loadSceneIntoViewport() {
  if (!scene || !currentProject) return;
  isRestoring = true;
  transform.detach();
  for (const object of sceneObjects.values()) scene.remove(object);
  sceneObjects.clear(); collisionHelpers.clear(); animationMixers.clear();
  const data = activeSceneData();
  scene.background = new THREE.Color(data.background || '#182126');
  applySceneSkybox();
  gridHelper.visible = data.grid !== false; axesHelper.visible = data.grid !== false;
  for (const entity of data.objects || []) {
    try { await createRuntimeObject(entity); }
    catch (error) { console.warn('Не удалось загрузить объект', entity, error); toast(`Не удалось загрузить «${entity.name}»`, 'error'); }
  }
  isRestoring = false;
  selectObject(null);
  renderHierarchy();
  updateViewportHint();
}
function deleteSelectedObject() {
  if (!selectedId) return;
  snapshotHistory();
  const entity = findEntity(selectedId);
  const object = sceneObjects.get(selectedId);
  if (object) scene.remove(object);
  sceneObjects.delete(selectedId);
  activeSceneData().objects = activeSceneData().objects.filter(item => item.id !== selectedId);
  selectedId = null; transform.detach(); renderHierarchy(); renderInspector(); updateSelectedStatus(); scheduleSave();
  toast(`${entity?.name || 'Объект'} удалён`, 'success');
}
function duplicateSelectedObject() {
  const entity = findEntity(selectedId);
  if (!entity) return;
  snapshotHistory();
  const duplicate = clone(entity); duplicate.id = uid(); duplicate.name = `${entity.name} Copy`; duplicate.position[0] += 1.2;
  activeSceneData().objects.push(duplicate);
  createRuntimeObject(duplicate).then(() => { selectObject(duplicate.id); renderHierarchy(); scheduleSave(); });
}
function applyEntityAppearance(entity, object) {
  object.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const apply = material => {
      if (!material) return material;
      const mat = material.clone();
      if (entity.material?.color && (entity.type !== 'model' || entity.material.overrideColor)) mat.color?.set(entity.material.color);
      if (entity.material?.roughness != null && 'roughness' in mat) mat.roughness = Number(entity.material.roughness);
      if (entity.material?.opacity != null) { mat.opacity = Number(entity.material.opacity); mat.transparent = mat.opacity < 1; }
      if (entity.material?.textureAssetId) applyTextureToMaterial(mat, entity.material.textureAssetId, entity.material.tileX || 1, entity.material.tileY || 1);
      return mat;
    };
    child.material = Array.isArray(child.material) ? child.material.map(apply) : apply(child.material);
  });
}
async function loadModelAsset(assetId) {
  const asset = currentProject.assets.find(item => item.id === assetId);
  if (!asset?.blob) throw new Error('Файл модели не найден');
  const ext = extOf(asset.name);
  const url = getAssetUrl(asset);
  if (ext === 'glb' || ext === 'gltf') {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(urlToResolve => resolveModelDependency(urlToResolve, asset));
    const loader = new GLTFLoader(manager);
    const result = await loader.loadAsync(url);
    result.scene.traverse(child => { if (child.isMesh) { child.castShadow = false; child.receiveShadow = false; normalizeImportedMaterials(child); } });
    result.scene.userData.animationClips = result.animations || [];
    return result.scene;
  }
  if (ext === 'fbx') {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(urlToResolve => resolveModelDependency(urlToResolve, asset));
    const result = await new FBXLoader(manager).loadAsync(url);
    result.traverse(child => { if (child.isMesh) { child.castShadow = false; child.receiveShadow = false; normalizeImportedMaterials(child); } });
    result.userData.animationClips = result.animations || [];
    return result;
  }
  if (ext === 'obj') {
    const siblingMtl=currentProject.assets.find(a=>extOf(a.name)==='mtl' && (a.folder||'')===(asset.folder||''));
    const manager=new THREE.LoadingManager();manager.setURLModifier(requestUrl=>resolveModelDependency(requestUrl,asset));
    const objLoader=new OBJLoader(manager);
    if(siblingMtl?.blob){
      const materials=await new MTLLoader(manager).loadAsync(getAssetUrl(siblingMtl));materials.preload();objLoader.setMaterials(materials);
    }
    const result=await objLoader.loadAsync(url);result.traverse(child=>{if(child.isMesh)normalizeImportedMaterials(child);});return result;
  }
  if (ext === 'stl') {
    const geometry = await new STLLoader().loadAsync(url);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#b9c5c4', roughness: .78 }));
    mesh.castShadow = false; mesh.receiveShadow = false; return mesh;
  }
  if (ext === 'ply') {
    const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
    const geometry = await new PLYLoader().loadAsync(url);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#b9c5c4', roughness: .8 }));
  }
  throw new Error(`Формат .${ext} не поддерживается`);
}
function makeUnlitMaterial(material) {
  return new THREE.MeshBasicMaterial({
    name: material.name, color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
    map: material.map || null, alphaMap: material.alphaMap || null, aoMap: material.aoMap || null,
    transparent: !!material.transparent, opacity: material.opacity ?? 1, alphaTest: material.alphaTest || 0,
    side: material.side ?? THREE.FrontSide, vertexColors: !!material.vertexColors, wireframe: !!material.wireframe,
    depthWrite: material.depthWrite, toneMapped: false
  });
}
function setObjectEditorUnlit(object, enabled) {
  object?.traverse(child => {
    if (!child.isMesh || !child.material) return;
    if (enabled) {
      if (!child.userData.zeroEngineSourceMaterial) child.userData.zeroEngineSourceMaterial = child.material;
      const source = child.userData.zeroEngineSourceMaterial;
      const convert = material => makeUnlitMaterial(material);
      child.material = Array.isArray(source) ? source.map(convert) : convert(source);
    } else if (child.userData.zeroEngineSourceMaterial) {
      child.material = child.userData.zeroEngineSourceMaterial;
      delete child.userData.zeroEngineSourceMaterial;
    }
    child.castShadow = false; child.receiveShadow = false;
  });
}
function eachEntityMaterial(mesh, callback) {
  const lists = [mesh.material, mesh.userData?.zeroEngineSourceMaterial].filter(Boolean);
  const seen = new Set();
  for (const list of lists) for (const material of (Array.isArray(list) ? list : [list])) {
    if (material && !seen.has(material)) { seen.add(material); callback(material); }
  }
}
function setAllEditorMaterials() { const hasUserLights=!isPlaying&&(activeSceneData()?.objects||[]).some(entity=>entity.type==='light'&&entity.visible!==false); for (const object of sceneObjects.values()) setObjectEditorUnlit(object, !isPlaying&&!hasUserLights); }

function normalizeImportedMaterials(mesh) {
  if (!mesh?.material) return;
  const normalize = material => {
    if (!material) return material;
    for (const key of ['map','emissiveMap']) {
      const texture = material[key];
      if (texture) { texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS ??= THREE.ClampToEdgeWrapping; texture.wrapT ??= THREE.ClampToEdgeWrapping; texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1); texture.needsUpdate = true; }
    }
    for (const key of ['normalMap','roughnessMap','metalnessMap','aoMap','bumpMap','displacementMap','alphaMap']) {
      const texture = material[key]; if (texture) texture.colorSpace = THREE.NoColorSpace;
    }
    material.needsUpdate = true;
    return material;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(normalize) : normalize(mesh.material);
}

function getAssetUrl(asset) {
  if (!objectUrls.has(asset.id)) objectUrls.set(asset.id, URL.createObjectURL(asset.blob));
  return objectUrls.get(asset.id);
}
function resolveModelDependency(url, mainAsset) {
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch {}
  const clean = decoded.split('?')[0].split('#')[0].replaceAll('\\','/');
  const mainPath = mainAsset.folder ? `${mainAsset.folder}/${mainAsset.name}` : mainAsset.name;
  const expected = new URL(clean, `https://zeroengine.local/${mainPath}`).pathname.replace(/^\//,'');
  const match = currentProject.assets.find(asset => {
    const path = asset.folder ? `${asset.folder}/${asset.name}` : asset.name;
    return path === expected || path.endsWith(`/${clean.split('/').pop()}`) || asset.name === clean.split('/').pop();
  });
  return match?.blob ? getAssetUrl(match) : url;
}
function applyTextureToMaterial(material, assetId, tileX = 1, tileY = 1) {
  const asset = currentProject.assets.find(item => item.id === assetId);
  if (!asset?.blob) return;
  const url = getAssetUrl(asset);
  const textureLoader = extOf(asset.name) === 'tga' ? new TGALoader() : new THREE.TextureLoader();
  textureLoader.load(url, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(.01, Number(tileX) || 1), Math.max(.01, Number(tileY) || 1));
    material.map = texture; material.needsUpdate = true;
    scheduleSave();
  });
}
function applyTextureToSelection(assetId) {
  const entity = findEntity(selectedId), object = sceneObjects.get(selectedId);
  if (!entity || !object) { toast('Сначала выбери объект на сцене', 'error'); return; }
  entity.material ||= {};
  entity.material.textureAssetId = assetId;
  entity.material.tileX ||= 1; entity.material.tileY ||= 1;
  object.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const apply = material => { const copy = material.clone(); applyTextureToMaterial(copy, assetId, entity.material.tileX, entity.material.tileY); return copy; };
    child.material = Array.isArray(child.material) ? child.material.map(apply) : apply(child.material);
  });
  renderInspector(); scheduleSave(); toast('Текстура назначена объекту', 'success');
}

// ---------- Inspector ----------
function renderInspector() {
  const root = $('#inspector-content');
  const entity = findEntity(selectedId);
  if (!entity) {
    root.innerHTML = '<div class="inspector-empty"><div class="empty-icon">◈</div><strong>Объект не выбран</strong><span>Выбери объект на сцене или в иерархии, чтобы редактировать его свойства.</span></div>';
    return;
  }
  const position = entity.position || [0,0,0], rotation = entity.rotation || [0,0,0], scale = entity.scale || [1,1,1];
  const material = entity.material || {};
  const textureAsset = currentProject.assets.find(item => item.id === material.textureAssetId);
  root.innerHTML = `
    <section class="inspector-section"><div class="inspector-section-title">Объект <span>${entity.type.toUpperCase()}</span></div><div class="inspector-section-body">
      <label class="field-label">Название<input class="field-input" id="ins-name" value="${escapeAttr(entity.name)}" maxlength="64" /></label>
      <label class="check-line"><input type="checkbox" id="ins-visible" ${entity.visible !== false ? 'checked' : ''}/> Видимость объекта</label>
      <div class="inspector-actions"><button class="button" id="duplicate-object">⧉ Дублировать</button><button class="button button-danger" id="delete-object">Удалить</button></div>
    </div></section>
    <section class="inspector-section"><div class="inspector-section-title">Трансформация <span>TRANSFORM</span></div><div class="inspector-section-body">
      ${vectorFields('Позиция','pos',position)}${vectorFields('Вращение','rot',rotation)}${vectorFields('Масштаб','scale',scale)}
    </div></section>
    ${entity.type === 'player' ? `<section class="inspector-section"><div class="inspector-section-title">Player <span>PLAYER SETTINGS</span></div><div class="inspector-section-body">
      <label class="field-label">Положение камеры<select class="field-select" id="player-camera-mode"><option value="head" ${(entity.cameraMount?.mode||'head')==='head'?'selected':''}>В голове (от первого лица)</option><option value="back" ${entity.cameraMount?.mode==='back'?'selected':''}>За спиной (от третьего лица)</option><option value="custom" ${entity.cameraMount?.mode==='custom'?'selected':''}>Собственное положение</option></select></label>
      <div class="field-row"><label class="field-label">Камера X<input class="field-input" id="player-cam-x" type="number" step=".1" value="${Number(entity.cameraMount?.offset?.[0]||0)}" /></label><label class="field-label">Y<input class="field-input" id="player-cam-y" type="number" step=".1" value="${Number(entity.cameraMount?.offset?.[1]??1.6)}" /></label><label class="field-label">Z<input class="field-input" id="player-cam-z" type="number" step=".1" value="${Number(entity.cameraMount?.offset?.[2]||0)}" /></label></div>
      <div class="modal-note">Камера задаёт точку просмотра. Player автоматически получает капсульную коллизию и базовую гравитацию.</div>
    </div></section>` : ''}
    ${entity.type === 'camera' ? `<section class="inspector-section"><div class="inspector-section-title">Камера <span>CAMERA</span></div><div class="inspector-section-body"><label class="field-label">Режим камеры<select class="field-select" id="camera-mode"><option value="isometric" ${(entity.camera?.mode||'isometric')==='isometric'?'selected':''}>Изометрическая</option><option value="free" ${entity.camera?.mode==='free'?'selected':''}>Свободная / перспективная</option></select></label><div class="field-row two"><label class="field-label">FOV<input class="field-input" id="camera-fov" type="number" min="20" max="110" value="${Number(entity.camera?.fov||60)}" /></label><label class="field-label">Масштаб вида<input class="field-input" id="camera-zoom" type="number" min="2" max="100" value="${Number(entity.camera?.zoom||14)}" /></label></div><label class="field-label">Чувствительность мыши / сенсорной зоны<input class="field-input" id="camera-sensitivity" type="number" min="0.0001" max="0.02" step="0.0001" value="${Number(entity.camera?.sensitivity||.0025)}" /></label><button class="button" id="open-camera-editor">▧ Открыть 3D-редактор камеры</button><div class="modal-note">В режиме создания виден конус обзора камеры. Изометрия использует ортографическую проекцию, свободная камера — перспективную.</div></div></section>` : ''}
    ${entity.type === 'skybox' ? `<section class="inspector-section"><div class="inspector-section-title">Skybox <span>ENVIRONMENT</span></div><div class="inspector-section-body"><label class="field-label">Текстура окружения<select class="field-select" id="skybox-asset"><option value="">Не выбрана</option>${(currentProject.assets||[]).filter(a=>a.type==='texture').map(a=>`<option value="${a.id}" ${entity.skyboxAssetId===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}</select></label><div class="modal-note">Используй панорамную equirectangular-текстуру 2:1 для полного окружения.</div></div></section>` : ''}
    ${entity.type === 'spawn' ? `<section class="inspector-section"><div class="inspector-section-title">Player Start <span>SPAWN</span></div><div class="inspector-section-body"><label class="check-line"><input type="checkbox" id="spawn-game-visible" ${entity.gameVisible===true?'checked':''}/> Показывать точку спавна в игре</label><div class="modal-note">По умолчанию маркер виден только в редакторе и скрыт в игровом просмотре.</div></div></section>` : ''}
    <section class="inspector-section"><div class="inspector-section-title">Коллизии <span>COLLISION</span></div><div class="inspector-section-body">
      <div class="collision-summary"><span class="collision-state-dot ${entity.collision?.enabled?'active':''}"></span><span>${entity.collision?.enabled ? 'Коллизия включена' : 'Коллизия отключена'}</span><span class="asset-meta">${escapeHtml((entity.collision?.shape||'box').toUpperCase())}</span></div>
      <button class="button" id="open-collision-editor">▦ Открыть редактор коллизии</button>
      <div class="modal-note">Форма, размеры, смещение и Trigger настраиваются в отдельном окне.</div>
    </div></section>
    ${!['camera','spawn','light'].includes(entity.type) ? `<section class="inspector-section"><div class="inspector-section-title">Физика <span>PHYSICS</span></div><div class="inspector-section-body">
      <label class="check-line"><input type="checkbox" id="physics-enabled" ${entity.physics?.enabled?'checked':''}/> Включить физику</label>
      <label class="check-line"><input type="checkbox" id="physics-gravity" ${entity.physics?.useGravity!==false?'checked':''}/> Гравитация</label>
      <div class="field-row two"><label class="field-label">Масса, кг<input class="field-input" id="physics-mass" type="number" min="0.01" step="0.1" value="${Number(entity.physics?.mass||1)}" /></label><label class="field-label">Сопротивление<input class="field-input" id="physics-damping" type="number" min="0" max="10" step="0.05" value="${Number(entity.physics?.linearDamping??.05)}" /></label></div>
      <div class="modal-note">Базовая физика: гравитация, масса, скорость и столкновения с активными коллайдерами. Для блоков физика должна быть включена.</div>
    </div></section>` : ''}
    ${entity.type === 'light' ? `<section class="inspector-section"><div class="inspector-section-title">Источник света <span>LIGHT</span></div><div class="inspector-section-body"><label class="field-label">Тип<select class="field-select" id="light-kind"><option value="point" ${(entity.light?.kind||'point')==='point'?'selected':''}>Точечный</option><option value="directional" ${entity.light?.kind==='directional'?'selected':''}>Направленный</option><option value="spot" ${entity.light?.kind==='spot'?'selected':''}>Прожектор</option></select></label><label class="field-label">Цвет<input class="field-input" id="light-color" type="color" value="${entity.light?.color||'#fff2d6'}" /></label><label class="field-label">Интенсивность<input class="field-input" id="light-intensity" type="number" min="0" max="100" step=".1" value="${entity.light?.intensity??2}" /></label><label class="field-label">Дальность<input class="field-input" id="light-distance" type="number" min="0" max="1000" step=".5" value="${entity.light?.distance??12}" /></label></div></section>` : ''}
    ${entity.type === 'model' ? `<section class="inspector-section"><div class="inspector-section-title">Масштаб модели <span>MODEL UNITS</span></div><div class="inspector-section-body"><label class="field-label">Единицы исходной модели<select class="field-select" id="model-unit-mode"><option value="auto" ${(entity.unitMode||'auto')==='auto'?'selected':''}>Автоопределение</option><option value="meters" ${entity.unitMode==='meters'?'selected':''}>Метры (×1)</option><option value="centimeters" ${entity.unitMode==='centimeters'?'selected':''}>Сантиметры (×0.01)</option><option value="millimeters" ${entity.unitMode==='millimeters'?'selected':''}>Миллиметры (×0.001)</option></select></label><button class="button" id="apply-model-units">Применить единицы</button><div class="modal-note">Автоопределение исправляет типичные FBX/Blender расхождения. Для точного размера можно выбрать единицы вручную; окончательный масштаб также регулируется выше в Transform.</div></div></section><section class="inspector-section"><div class="inspector-section-title">Анимации и скелет <span>ANIMATION</span></div><div class="inspector-section-body"><label class="field-label">Клип GLTF/FBX<select class="field-select" id="model-animation-select"><option value="">Выбери анимацию</option>${(entity.availableAnimations||[]).map(name=>`<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join('')}</select></label><div class="inspector-actions"><button class="button" id="play-model-animation">▶ Проиграть</button><button class="button" id="stop-model-animation">■ Стоп</button></div><div class="modal-note" id="skeleton-info">${countSkinnedBones(sceneObjects.get(entity.id))} костей в импортированном скелете · клипы GLTF/FBX доступны выше.</div><button class="button" id="create-basic-rig">＋ Создать базовый скелет</button><div class="modal-note">${entity.rig?.bones?.map(b=>escapeHtml(b.name)).join(' · ')||'Собственный скелет ещё не создан.'}</div></div></section>` : ''}
    ${!['camera','spawn','light'].includes(entity.type) ? `<section class="inspector-section"><div class="inspector-section-title">Анимация объекта <span>KEYFRAMES</span></div><div class="inspector-section-body"><div class="inspector-actions"><button class="button" id="add-transform-key">＋ Записать ключ</button><button class="button" id="play-custom-animation">▶ Проиграть</button><button class="button" id="stop-custom-animation">■ Стоп</button></div><div id="custom-animation-list" class="modal-note">${(entity.animations||[]).map(a=>`${escapeHtml(a.name)} — ${a.keys?.length||0} ключей`).join('<br>') || 'Пользовательских анимаций пока нет.'}</div></div></section>` : ''}
    <section class="inspector-section"><div class="inspector-section-title">Материал <span>MATERIAL</span></div><div class="inspector-section-body">
      <label class="field-label">Основной цвет<input class="field-input" id="ins-color" type="color" value="${escapeAttr(material.color || '#a5ef4c')}" /></label>
      <label class="field-label">Шероховатость <span id="roughness-value">${Number(material.roughness ?? .72).toFixed(2)}</span><input class="field-input" id="ins-roughness" type="range" min="0" max="1" step=".01" value="${Number(material.roughness ?? .72)}" /></label>
      <label class="field-label">Текстура ${textureAsset ? `<span>${escapeHtml(textureAsset.name)}</span>` : ''}<button class="button button-quiet" id="choose-texture-button">${textureAsset ? 'Заменить текстуру' : 'Назначить из файлов'}</button></label>
      <div class="field-row two"><label class="field-label">Tiling X<input class="field-input" id="tile-x" type="number" min="0.01" max="100" step="0.1" value="${Number(material.tileX || 1)}" /></label><label class="field-label">Tiling Y<input class="field-input" id="tile-y" type="number" min="0.01" max="100" step="0.1" value="${Number(material.tileY || 1)}" /></label></div>
      <div class="modal-note">Tiling управляет повторением текстуры по поверхности. Значение 1 × 1 — одно повторение.</div>
    </div></section>`;
  $('#ins-name').addEventListener('change', event => { entity.name = event.target.value.trim() || 'Object'; const obj = sceneObjects.get(entity.id); if (obj) obj.name = entity.name; renderHierarchy(); updateSelectedStatus(); scheduleSave(); });
  $('#ins-visible').addEventListener('change', event => { entity.visible = event.target.checked; const obj = sceneObjects.get(entity.id); if (obj) obj.visible = entity.visible; scheduleSave(); });
  if (entity.type === 'player') {
    $('#player-camera-mode').addEventListener('change', event => { entity.cameraMount ||= {mode:'head',offset:[0,1.6,0]}; entity.cameraMount.mode = event.target.value; scheduleSave(); });
    ['x','y','z'].forEach((axis,i)=>$(`#player-cam-${axis}`).addEventListener('change',event=>{entity.cameraMount ||= {mode:'head',offset:[0,1.6,0]}; entity.cameraMount.offset[i]=Number(event.target.value)||0; if($('#player-camera-mode').value==='custom') entity.cameraMount.mode='custom'; scheduleSave();}));
  }
  if (entity.type === 'spawn') $('#spawn-game-visible').addEventListener('change',event=>{entity.gameVisible=event.target.checked;scheduleSave();});
  if (entity.type === 'camera') {
    entity.camera ||= {mode:'isometric',fov:60,zoom:14,sensitivity:.0025};
    const refreshCameraMarker=()=>{const old=sceneObjects.get(entity.id);if(transform?.object===old)transform.detach();createRuntimeObject(entity).then(marker=>{if(marker&&selectedId===entity.id)transform.attach(marker);}).catch(console.warn);};
    $('#camera-mode').addEventListener('change',event=>{entity.camera.mode=event.target.value;refreshCameraMarker();scheduleSave();});
    $('#camera-fov').addEventListener('change',event=>{entity.camera.fov=Math.max(20,Math.min(110,Number(event.target.value)||60));refreshCameraMarker();scheduleSave();});
    $('#camera-zoom').addEventListener('change',event=>{entity.camera.zoom=Math.max(2,Math.min(100,Number(event.target.value)||14));refreshCameraMarker();scheduleSave();});
    $('#camera-sensitivity').addEventListener('change',event=>{entity.camera.sensitivity=Math.max(.0001,Math.min(.02,Number(event.target.value)||.0025));scheduleSave();});
    $('#open-camera-editor').addEventListener('click',()=>openCameraEditor(entity));
  }
  if (entity.type === 'skybox') $('#skybox-asset').addEventListener('change',event=>{entity.skyboxAssetId=event.target.value||null;activeSceneData().skyboxAssetId=entity.skyboxAssetId;applySceneSkybox();scheduleSave();});
  entity.collision ||= {enabled:false,shape:'box',size:[1,1,1],offset:[0,0,0],isTrigger:false};
  $('#open-collision-editor').addEventListener('click',()=>openCollisionEditor(entity));
  if ($('#physics-enabled')) {
    entity.physics ||= {enabled:false,useGravity:true,mass:1,velocity:[0,0,0],linearDamping:.05};
    $('#physics-enabled').addEventListener('change',event=>{entity.physics.enabled=event.target.checked;entity.physics.velocity ||= [0,0,0];if(event.target.checked&&entity.collision&&entity.collision.enabled==null)entity.collision.enabled=true;scheduleSave();});
    $('#physics-gravity').addEventListener('change',event=>{entity.physics.useGravity=event.target.checked;scheduleSave();});
    $('#physics-mass').addEventListener('change',event=>{entity.physics.mass=Math.max(.01,Number(event.target.value)||1);scheduleSave();});
    $('#physics-damping').addEventListener('change',event=>{entity.physics.linearDamping=Math.max(0,Number(event.target.value)||0);scheduleSave();});
  }
  if (entity.type === 'light') {
    ['kind','color','intensity','distance'].forEach(key=>$(`#light-${key}`).addEventListener('change',event=>{entity.light ||= {};entity.light[key]=key==='intensity'||key==='distance'?Number(event.target.value):event.target.value;const pos=entity.position.slice(),rot=entity.rotation.slice(),scl=entity.scale.slice();createRuntimeObject(entity).then(()=>{const o=sceneObjects.get(entity.id);o.position.fromArray(pos);o.rotation.set(...rot.map(v=>THREE.MathUtils.degToRad(v)));o.scale.fromArray(scl);selectObject(entity.id);});scheduleSave();}));
  }
  if (entity.type === 'model') {
    $('#play-model-animation')?.addEventListener('click',()=>playImportedAnimation(entity));
    $('#stop-model-animation')?.addEventListener('click',()=>stopImportedAnimation(entity));
    $('#create-basic-rig')?.addEventListener('click',()=>createBasicSkeleton(entity));
    $('#apply-model-units')?.addEventListener('click',()=>{
      const mode=$('#model-unit-mode').value; const factors={meters:1,centimeters:.01,millimeters:.001};
      const next=mode==='auto'?(entity.detectedUnitScale||1):factors[mode];
      const previous=entity.unitScaleFactor||entity.detectedUnitScale||1;
      entity.scale=(entity.scale||[1,1,1]).map(v=>v/previous*next); entity.unitScaleFactor=next; entity.unitMode=mode; entity.unitScaleApplied=true;
      sceneObjects.get(entity.id)?.scale.fromArray(entity.scale); updateInspectorTransformValues(); scheduleSave(); toast(`Масштаб единиц применён: ×${next}`,'success');
    });
  }
  $('#add-transform-key')?.addEventListener('click',()=>recordTransformKey(entity));
  $('#play-custom-animation')?.addEventListener('click',()=>{const a=entity.animations?.[0];if(a)playCustomAnimation(entity,a);else toast('Сначала запиши несколько ключей','error');});
  $('#stop-custom-animation')?.addEventListener('click',()=>activeCustomAnimations.delete(entity.id));
  $('#duplicate-object').addEventListener('click', duplicateSelectedObject);
  $('#delete-object').addEventListener('click', deleteSelectedObject);
  $('#ins-color').addEventListener('input', event => {
    entity.material ||= {}; entity.material.color = event.target.value; entity.material.overrideColor = true;
    const obj = sceneObjects.get(entity.id); obj?.traverse(child => { if (child.isMesh && child.material) eachEntityMaterial(child, mat => { if (mat.color) mat.color.set(event.target.value); }); });
    scheduleSave();
  });
  $('#ins-roughness').addEventListener('input', event => {
    entity.material ||= {}; entity.material.roughness = Number(event.target.value); $('#roughness-value').textContent = Number(event.target.value).toFixed(2);
    const obj = sceneObjects.get(entity.id); obj?.traverse(child => { if (child.isMesh && child.material) eachEntityMaterial(child, mat => { if ('roughness' in mat) mat.roughness = Number(event.target.value); }); }); scheduleSave();
  });
  ['tile-x','tile-y'].forEach(id => $(`#${id}`).addEventListener('change', () => {
    entity.material ||= {}; entity.material.tileX = Math.max(.01, Number($('#tile-x').value) || 1); entity.material.tileY = Math.max(.01, Number($('#tile-y').value) || 1);
    if (entity.material.textureAssetId) applyTextureToEntity(entity);
    scheduleSave();
  }));
  $('#choose-texture-button').addEventListener('click', () => { setAssetTab('assets'); toast('Выбери текстуру в нижней панели', 'success'); });
  bindVectorInputs();
}
function vectorFields(label, prefix, values) {
  const axes = ['x','y','z'];
  return `<div class="field-label">${label}<div class="field-row">${axes.map((axis,index) => `<label class="axis-field"><span class="axis-label ${axis}">${axis.toUpperCase()}</span><input class="field-input" type="number" step="0.1" data-vector="${prefix}" data-axis="${index}" value="${Number(values[index] ?? (prefix === 'scale' ? 1 : 0)).toFixed(2)}" /></label>`).join('')}</div></div>`;
}
function bindVectorInputs() {
  $$('[data-vector]:not([data-vector^="col"])').forEach(input => input.addEventListener('change', () => {
    const entity = findEntity(selectedId), object = sceneObjects.get(selectedId); if (!entity || !object) return;
    snapshotHistory();
    const key = input.dataset.vector, index = Number(input.dataset.axis), values = entity[key === 'pos' ? 'position' : key === 'rot' ? 'rotation' : 'scale'];
    values[index] = Number(input.value) || 0;
    if (key === 'pos') object.position.set(...values);
    else if (key === 'rot') object.rotation.set(...values.map(value => THREE.MathUtils.degToRad(value)));
    else object.scale.set(...values);
    updateSelectedStatus(); scheduleSave();
  }));
}
function updateInspectorTransformValues() {
  if (!selectedId) return;
  const obj = sceneObjects.get(selectedId); if (!obj) return;
  const values = {pos:obj.position.toArray(), rot:[obj.rotation.x, obj.rotation.y, obj.rotation.z].map(value => THREE.MathUtils.radToDeg(value)), scale:obj.scale.toArray()};
  $$('[data-vector="pos"],[data-vector="rot"],[data-vector="scale"]').forEach(input => { const array = values[input.dataset.vector]; input.value = Number(array[Number(input.dataset.axis)]).toFixed(2); });
}
function applyTextureToEntity(entity) {
  const object = sceneObjects.get(entity.id); if (!object) return;
  object.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const apply = mat => { const copy = mat.clone(); applyTextureToMaterial(copy, entity.material.textureAssetId, entity.material.tileX, entity.material.tileY); return copy; };
    if (child.userData.zeroEngineSourceMaterial) child.userData.zeroEngineSourceMaterial = Array.isArray(child.userData.zeroEngineSourceMaterial) ? child.userData.zeroEngineSourceMaterial.map(apply) : apply(child.userData.zeroEngineSourceMaterial);
    child.material = Array.isArray(child.material) ? child.material.map(apply) : apply(child.material);
  });
}

// ---------- Asset browser / import ----------
async function addAssetsFromFiles(files) {
  if (!currentProject || !files?.length) return;
  let added = 0, errors = [];
  for (const file of files) {
    const relative = file.webkitRelativePath || file.name;
    const type = typeOf(file.name);
    if (file.name.toLowerCase().endsWith('.blend')) { errors.push(`${file.name}: экспортируй из Blender в GLB`); continue; }
    if (type === 'file') { errors.push(`${file.name}: формат не поддерживается`); continue; }
    if (type === 'zerobox') {
      try { const data = JSON.parse(await file.text()); currentProject.zeroBoxes.push({ id: uid(), name: file.name.replace(/\.zbox$/i,''), blocks: data.blocks || [], connections: data.connections || [], variables: data.variables || [] }); added++; }
      catch { errors.push(`${file.name}: не удалось прочитать ZeroBox`); }
      continue;
    }
    if (type === 'script') {
      const code = await file.text();
      const script = { id: uid(), name: file.name.replace(/\.zs$/i,''), code };
      const existing = currentProject.scripts.find(item => item.name === script.name);
      if (existing) { existing.code = code; } else currentProject.scripts.push(script);
      added++; continue;
    }
    if (type === 'scene' || (type === 'json' && file.name.toLowerCase().includes('scene'))) {
      try {
        const data = JSON.parse(await file.text());
        const sceneName = data.name || file.name.replace(/\.(zescene|json)$/i,'');
        currentProject.scenes.push({ id: uid(), name: sceneName, data: { ...data, id: uid(), name: sceneName } });
        added++; continue;
      } catch { errors.push(`${file.name}: не удалось прочитать сцену`); continue; }
    }
    const asset = {
      id: uid(), name: file.name, type, size: file.size, folder: relative.includes('/') ? relative.split('/').slice(0,-1).join('/') : (assetFolderFilter !== 'All' && assetFolderFilter !== 'Корень проекта' ? assetFolderFilter : ''),
      path: `Assets/${uid()}_${safeName(file.name)}`, blob: file
    };
    currentProject.assets.push(asset); added++;
  }
  if (added) { renderAssetPanel(); renderHierarchy(); scheduleSave(); }
  if (added) toast(`Импортировано файлов: ${added}`, 'success');
  if (errors.length) toast(errors.slice(0,2).join(' · ') + (errors.length > 2 ? ` · ещё ${errors.length - 2}` : ''), 'error');
}
function renderAssetPanel() {
  if (!currentProject) return;
  const content = $('#asset-content');
  $$('.asset-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.assetTab === currentTab));
  $('#export-current-scene-button').hidden = currentTab !== 'scenes';
  if (currentTab === 'assets') {
    $('#asset-path').textContent = 'Assets / All';
    const assets = currentProject.assets;
    const folders = [...new Set([...(currentProject.assetFolders||[]),...assets.map(asset => asset.folder || 'Корень проекта')])].sort();
    if (assetFolderFilter !== 'All' && !folders.includes(assetFolderFilter)) assetFolderFilter = 'All';
    const visibleAssets = assetFolderFilter === 'All' ? assets : assets.filter(asset => (asset.folder || 'Корень проекта') === assetFolderFilter);
    const folderBar = `<div class="asset-folder-bar"><button class="folder-chip ${assetFolderFilter === 'All' ? 'active' : ''}" data-folder-filter="All">▦ Все файлы</button>${folders.map(folder => `<button class="folder-chip ${assetFolderFilter === folder ? 'active' : ''}" data-folder-filter="${escapeAttr(folder)}">${iconFor('folder')} ${escapeHtml(folder.split('/').pop())}${(currentProject.assetFolders||[]).includes(folder)?`<span class="asset-folder-delete" data-delete-folder="${escapeAttr(folder)}">×</span>`:''}</button>`).join('')}</div>`;
    content.innerHTML = folderBar + (visibleAssets.length ? visibleAssets.map(asset => `
      <div class="asset-card ${selectedAssetId === asset.id ? 'selected' : ''}" data-asset-id="${asset.id}" draggable="${asset.type === 'model'}" title="${escapeAttr(asset.folder ? `${asset.folder}/${asset.name}` : asset.name)}">
        <button class="asset-remove" data-remove-asset="${asset.id}" title="Удалить ресурс">×</button>
        <div class="asset-thumb">${asset.type === 'texture' ? `<img src="${getAssetUrl(asset)}" alt="" />` : iconFor(asset.type)}</div>
        <div class="asset-name">${escapeHtml(asset.name)}</div><div class="asset-meta">${asset.type.toUpperCase()} · ${fmtSize(asset.size || 0)}</div>
        ${asset.type === 'model' ? '<button class="asset-add" title="Добавить на сцену">＋</button>' : ''}
      </div>`).join('') : `<div class="asset-empty">${folders.length?'В этой папке пока нет файлов.':'Здесь появятся модели, текстуры, аудио и другие ресурсы. Импортируй файлы или создай папку.'}</div>`);
    $$('[data-folder-filter]', content).forEach(button => button.addEventListener('click', () => { assetFolderFilter = button.dataset.folderFilter; renderAssetPanel(); }));
    $$('[data-delete-folder]', content).forEach(button => button.addEventListener('click',event=>{event.stopPropagation();deleteAssetFolder(button.dataset.deleteFolder);}));
    $$('[data-remove-asset]', content).forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();deleteAsset(button.dataset.removeAsset);}));
    $$('[data-asset-id]', content).forEach(card => {
      const asset = assets.find(item => item.id === card.dataset.assetId);
      if(asset?.type==='model')card.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-zeroengine-model',asset.id);event.dataTransfer.effectAllowed='copy';});
      card.addEventListener('click', event => {
        if (event.target.closest('.asset-remove')) return;
        if (event.target.closest('.asset-add')) { addObjectToScene('model', { assetId: asset.id, name: asset.name.replace(/\.[^.]+$/, '') }); return; }
        selectedAssetId = asset.id;
        if (asset.type === 'model') addObjectToScene('model', { assetId: asset.id, name: asset.name.replace(/\.[^.]+$/, '') });
        else if (asset.type === 'texture') applyTextureToSelection(asset.id);
        else if (asset.type === 'script') openScriptEditor(asset.id);
        else if (asset.type === 'audio') toast(`Аудиоресурс: ${asset.name}. Назначь его через ZeroBox.`, 'success');
        else if (asset.type === 'scene') toast('Сцены проекта доступны во вкладке «Сцены»', 'success');
        renderAssetPanel();
      });
      card.addEventListener('dblclick', () => { if (asset.type === 'model') addObjectToScene('model', {assetId:asset.id,name:asset.name.replace(/\.[^.]+$/,'')}); });
    });
  } else if (currentTab === 'scenes') {
    $('#asset-path').textContent = 'Scenes / Project';
    const scenes = currentProject.scenes;
    content.innerHTML = scenes.map(item => `<div class="asset-card ${item.id === currentProject.activeSceneId ? 'selected' : ''}" data-scene-id="${item.id}"><button class="asset-remove" data-remove-scene="${item.id}">×</button><div class="asset-thumb">🎬</div><div class="asset-name">${escapeHtml(item.name)}</div><div class="asset-meta">${item.data.objects.length} OBJECTS ${item.id === currentProject.activeSceneId ? '· ACTIVE' : ''}</div></div>`).join('') + `<div class="asset-card" id="new-scene-card"><div class="asset-thumb">＋</div><div class="asset-name">Новая сцена</div><div class="asset-meta">CREATE SCENE</div></div>`;
    $$('[data-scene-id]', content).forEach(card => card.addEventListener('click', (e) => {if(e.target.closest('[data-remove-scene]'))return;switchScene(card.dataset.sceneId);}));
    $$('[data-remove-scene]',content).forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();deleteScene(btn.dataset.removeScene);}));
    $('#new-scene-card').addEventListener('click', createScene);
  } else {
    if (currentTab === 'zeroboxes') {
      $('#asset-path').textContent = 'Logic / ZeroBox';
      content.innerHTML = `<input class="field-input asset-search" id="zerobox-asset-search" placeholder="Поиск ZeroBox по названию…" />`+(currentProject.zeroBoxes||[]).map(box => `<div class="asset-card" data-zerobox-id="${box.id}" data-zerobox-name="${escapeAttr(box.name.toLowerCase())}" draggable="true"><button class="asset-remove" data-remove-zerobox="${box.id}">×</button><div class="asset-thumb">◇</div><div class="asset-name">${escapeHtml(box.name)}.zbox</div><div class="asset-meta">ZEROBOX · ${box.blocks.length} BLOCKS</div></div>`).join('') + `<div class="asset-card" id="new-zerobox-card"><div class="asset-thumb">＋</div><div class="asset-name">Новый ZeroBox</div><div class="asset-meta">CREATE LOGIC</div></div>`;
      $('#zerobox-asset-search').addEventListener('input',event=>{const q=event.target.value.trim().toLowerCase();$$('[data-zerobox-id]',content).forEach(card=>card.hidden=!card.dataset.zeroboxName.includes(q));});
      $$('[data-zerobox-id]', content).forEach(card => {card.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-zeroengine-zerobox',card.dataset.zeroboxId);event.dataTransfer.effectAllowed='copy';});card.addEventListener('click',e=>{if(e.target.closest('[data-remove-zerobox]'))return;openWorkbench('zerobox',card.dataset.zeroboxId);});});
      $$('[data-remove-zerobox]',content).forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();currentProject.zeroBoxes=currentProject.zeroBoxes.filter(b=>b.id!==btn.dataset.removeZerobox);if(selectedZeroBoxId===btn.dataset.removeZerobox)selectedZeroBoxId=null;renderAssetPanel();scheduleSave();}));
      $('#new-zerobox-card').addEventListener('click', createZeroBox);
      return;
    }
    $('#asset-path').textContent = 'Scripts / ZeroScript';
    content.innerHTML = currentProject.scripts.map(script => `<div class="asset-card" data-script-id="${script.id}"><button class="asset-remove" data-remove-script="${script.id}">×</button><div class="asset-thumb">〈〉</div><div class="asset-name">${escapeHtml(script.name)}.zs</div><div class="asset-meta">ZEROSCRIPT</div></div>`).join('') + `<div class="asset-card" id="new-script-card"><div class="asset-thumb">＋</div><div class="asset-name">Новый скрипт</div><div class="asset-meta">CREATE SCRIPT</div></div>`;
    $$('[data-script-id]', content).forEach(card => card.addEventListener('click', (e) => {if(e.target.closest('[data-remove-script]'))return;openScriptEditor(card.dataset.scriptId);}));
    $$('[data-remove-script]',content).forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();currentProject.scripts=currentProject.scripts.filter(x=>x.id!==btn.dataset.removeScript);renderAssetPanel();scheduleSave();}));
    $('#new-script-card').addEventListener('click', () => createScript());
  }
}
function setAssetTab(tab) { currentTab = tab; selectedAssetId = null; if (tab === 'assets') assetFolderFilter = 'All'; renderAssetPanel(); }
function switchScene(id) {
  if (!currentProject.scenes.some(item => item.id === id)) return;
  currentProject.activeSceneId = id; selectedId = null;
  $('#active-scene-name').textContent = activeScene().name; $('#viewport-scene-name').textContent = activeScene().name;
  loadSceneIntoViewport().then(() => { renderAssetPanel(); renderInspector(); scheduleSave(); toast(`Открыта сцена «${activeScene().name}»`, 'success'); });
}
function createScene() {
  showModal(`<div class="modal-header"><div><span class="panel-kicker">SCENE MANAGER</span><h2 id="modal-title">Новая сцена</h2><p>Создай отдельную сцену внутри проекта.</p></div><button class="modal-close" data-close-modal>×</button></div><form id="new-scene-form"><div class="modal-body"><label class="field-label">Название сцены<input class="field-input" id="new-scene-name" placeholder="Например, Level 01" maxlength="48" required /></label></div><div class="modal-footer"><button type="button" class="button button-quiet" data-close-modal>Отмена</button><button class="button button-primary">Создать</button></div></form>`);
  $('#new-scene-form').addEventListener('submit', async event => { event.preventDefault(); const name = $('#new-scene-name').value.trim(); const data = { ...DEFAULT_SCENE(), name }; currentProject.scenes.push({ id: data.id, name, data }); closeModal(); switchScene(data.id); });
  $('#new-scene-name').focus();
}
function createScript() {
  const script = { id: uid(), name: `Script_${currentProject.scripts.length + 1}`, code: `// ZeroScript — первый скрипт\n// print("Hello from ZeroEngine!");\n\nprint("Hello World");\n\n// Примеры команд:\n// spawn("cube", "MyCube", 0, 1, 0);\n// move("MyCube", 2, 1, 0);\n// set("MyCube", "visible", true);\n` };
  currentProject.scripts.push(script); scheduleSave(); setAssetTab('scripts'); openScriptEditor(script.id);
}
function openScriptEditor(id) {
  const script = currentProject.scripts.find(item => item.id === id); if (!script) return;
  showModal(`<div class="modal-header"><div><span class="panel-kicker">ZEROSCRIPT EDITOR</span><h2 id="modal-title">${escapeHtml(script.name)}.zs</h2><p>Командный язык ZeroEngine. Команды выполняются построчно.</p></div><button class="modal-close" data-close-modal>×</button></div>
    <div class="modal-body"><textarea class="field-textarea" id="script-code" spellcheck="false" style="min-height:260px;font-family:var(--mono);font-size:11px;line-height:1.6">${escapeHtml(script.code || '')}</textarea><div class="modal-note">Поддерживаются print, spawn, move, rotate, scale и set. Названия объектов указывай в кавычках.</div><div id="script-output" class="modal-note"></div></div>
    <div class="modal-footer"><button class="button button-quiet" data-close-modal>Закрыть</button><button class="button" id="run-script-button">▶ Запустить</button><button class="button button-primary" id="save-script-button">Сохранить скрипт</button></div>`);
  $('#save-script-button').addEventListener('click', () => { script.code = $('#script-code').value; scheduleSave(); renderAssetPanel(); toast('ZeroScript сохранён', 'success'); });
  $('#run-script-button').addEventListener('click', () => { script.code = $('#script-code').value; runZeroScript(script.code); });
}

// ---------- ZeroScript interpreter ----------
function runZeroScript(code) {
  const output = [];
  const lines = code.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line || line.startsWith('//')) continue;
    try {
      let match;
      if ((match = line.match(/^print\(\s*(['"])(.*?)\1\s*\)\s*;?$/))) { output.push(match[2]); continue; }
      if ((match = line.match(/^spawn\(\s*(['"])(cube|sphere|plane|cylinder|cone|capsule)\1\s*,\s*(['"])(.*?)\3\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*;?$/i))) {
        const entity = addObjectToScene('primitive', { primitive: match[2].toLowerCase(), name: match[4], position: [Number(match[5]),Number(match[6]),Number(match[7])] });
        output.push(`Создан объект: ${entity.name}`); continue;
      }
      const vectorMatch = line.match(/^(move|rotate|scale)\(\s*(['"])(.*?)\2\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*;?$/i);
      if (vectorMatch) {
        const [_,command,,name,x,y,z] = vectorMatch;
        const entity = activeSceneData().objects.find(item => item.name === name);
        if (!entity) { output.push(`Строка ${index+1}: объект «${name}» не найден`); continue; }
        snapshotHistory();
        const values = [Number(x),Number(y),Number(z)];
        if (command.toLowerCase() === 'move') entity.position = values;
        if (command.toLowerCase() === 'rotate') entity.rotation = values;
        if (command.toLowerCase() === 'scale') entity.scale = values;
        const object = sceneObjects.get(entity.id); if (object) { object.position.fromArray(entity.position); object.rotation.set(...entity.rotation.map(v=>THREE.MathUtils.degToRad(v))); object.scale.fromArray(entity.scale); }
        output.push(`${command}: ${name}`); continue;
      }
      const setMatch = line.match(/^set\(\s*(['"])(.*?)\1\s*,\s*(['"])(visible|name)\3\s*,\s*(true|false|(['"])(.*?)\6)\s*\)\s*;?$/i);
      if (setMatch) {
        const entity = activeSceneData().objects.find(item => item.name === setMatch[2]);
        if (!entity) { output.push(`Строка ${index+1}: объект «${setMatch[2]}» не найден`); continue; }
        if (setMatch[4] === 'visible') { entity.visible = setMatch[5] === 'true'; const object = sceneObjects.get(entity.id); if (object) object.visible = entity.visible; }
        else { entity.name = setMatch[7]; const object = sceneObjects.get(entity.id); if (object) object.name = entity.name; }
        output.push(`set: ${entity.name}`); continue;
      }
      output.push(`Строка ${index+1}: неизвестная команда`);
    } catch (error) { output.push(`Строка ${index+1}: ${error.message}`); }
  }
  renderHierarchy(); renderInspector(); updateSelectedStatus(); scheduleSave();
  const outputBox = $('#script-output'); if (outputBox) outputBox.textContent = output.join(' · ') || 'Скрипт выполнен.';
  toast('ZeroScript выполнен', 'success');
}

// ---------- Play mode ----------
function startPlayMode() {
  if (isPlaying) return;
  if(saveTimer){clearTimeout(saveTimer);saveTimer=null;saveProject(false);}
  playSnapshot = clone(currentProject);
  playSnapshot.assets = (currentProject.assets || []).map((asset, index) => ({...playSnapshot.assets[index], blob: asset.blob}));
  isPlaying = true; runtimeGameSpeed = 1; heldButtonTick = 0; heldKeys.clear();
  setAllEditorMaterials();
  const objects = activeSceneData().objects || [];
  for (const entity of objects) if (entity.physics) entity.physics.velocity = [0,0,0];
  const player = objects.find(item => item.type === 'player');
  const spawn = objects.find(item => item.type === 'spawn');
  const sceneCamera = objects.find(item => item.type === 'camera');
  const base = spawn || player || sceneCamera;
  const basePosition = base?.position || [0,0,0];
  const cameraConfig = sceneCamera?.camera || {mode:'isometric',fov:60,zoom:14,sensitivity:.0025};
  if (!player && (!sceneCamera || cameraConfig.mode === 'isometric')) {
    const zoom = Math.max(2,Number(cameraConfig.zoom)||14);
    previewCamera = new THREE.OrthographicCamera(-zoom*editorCamera.aspect/2,zoom*editorCamera.aspect/2,zoom/2,-zoom/2,.08,2000);
    const target = new THREE.Vector3(...(player?.position||spawn?.position||[0,0,0]));
    const cameraPosition = sceneCamera?.position ? new THREE.Vector3(...sceneCamera.position) : target.clone().add(new THREE.Vector3(8,8,8));
    previewCamera.position.copy(cameraPosition);
    if (cameraPosition.distanceTo(target) < .25) previewCamera.position.copy(target.clone().add(new THREE.Vector3(8,8,8)));
    if(sceneCamera?.rotation?.some(v=>Math.abs(Number(v)||0)>.001)) previewCamera.rotation.set(...sceneCamera.rotation.map(v=>THREE.MathUtils.degToRad(v)),'YXZ');
    else previewCamera.lookAt(target);
  } else {
    previewCamera = new THREE.PerspectiveCamera(Number(cameraConfig.fov)||70, editorCamera.aspect, .08, 2000);
    if (player) {
      const mount = player.cameraMount || {mode:'head',offset:[0,1.6,0]};
      const offset = mount.mode === 'back' ? [0,1.55,3.2] : mount.mode === 'custom' ? (mount.offset || [0,1.6,0]) : [0,1.6,0];
      const rotation = new THREE.Euler(...(player.rotation||[0,0,0]).map(v=>THREE.MathUtils.degToRad(v)),'YXZ');
      const rotated = new THREE.Vector3(...offset).applyEuler(rotation);
      previewCamera.position.set(basePosition[0]+rotated.x,basePosition[1]+rotated.y,basePosition[2]+rotated.z);
      previewCamera.rotation.set(rotation.x,rotation.y,rotation.z,'YXZ');
    } else if (sceneCamera) {
      previewCamera.position.fromArray(sceneCamera.position||[0,2,5]);
      previewCamera.rotation.set(...(sceneCamera.rotation||[0,0,0]).map(v=>THREE.MathUtils.degToRad(v)),'YXZ');
    } else { previewCamera.position.set(basePosition[0]+8,basePosition[1]+8,basePosition[2]+8);previewCamera.lookAt(0,0,0); }
  }
  previewLook.yaw=previewCamera.rotation.y;previewLook.pitch=previewCamera.rotation.x;previewLook.sensitivity=Number(cameraConfig.sensitivity)||.0025;
  objects.forEach(entity=>{
    const object=sceneObjects.get(entity.id);if(!object)return;
    const firstPersonPlayer = entity.type==='player' && (player?.cameraMount?.mode||'head')==='head';
    object.visible=entity.visible!==false && (entity.type!=='spawn'||entity.gameVisible===true) && !['camera','skybox'].includes(entity.type) && !firstPersonPlayer;
    object.traverse(child=>{if(child.userData?.editorOnly)child.visible=false;});
    const helper=collisionHelpers.get(entity.id);if(helper)helper.visible=false;
  });
  orbit.enabled=false;transform.detach();
  gridHelper.visible=false;axesHelper.visible=false;
  $('#play-overlay').classList.remove('hidden');
  $('#play-hint').textContent='Тестовый режим · нажми по сцене и двигай мышь для обзора · CameraControlArea работает касанием · Esc — выйти';
  renderGameUI();
  for(const box of currentProject.zeroBoxes||[]) if(box.blocks?.some(b=>b.type==='Straightaway')) runZeroBox(box,'Straightaway');
  toast('Тестовый режим запущен · изменения будут отменены при выходе','success');
}
async function stopPlayMode() {
  if(!isPlaying)return;
  isPlaying=false;stopPreviewMouseLook();previewCamera=null;runtimeGameSpeed=1;heldKeys.clear();joystickState={x:0,y:0,active:false,uiElementId:null};orbit.enabled=true;gridHelper.visible=axesHelper.visible=activeSceneData()?.grid!==false;
  gridHelper.visible=axesHelper.visible=activeSceneData()?.grid!==false;
  $('#play-overlay')?.classList.add('hidden');$('#play-button')?.classList.remove('hidden');
  $('#game-ui-layer').innerHTML='';
  if(playSnapshot){currentProject=playSnapshot;playSnapshot=null;}
  // Rebuild the editor scene from the pre-test snapshot so runtime mutations never leak into the project.
  const previousSelection=selectedId;
  await loadSceneIntoViewport();
  renderAssetPanel();renderHierarchy();renderInspector();
  if(previousSelection && findEntity(previousSelection)) selectObject(previousSelection);
  $('#save-indicator').textContent='Тест завершён · проект не изменён';
}

// ---------- Undo / redo ----------
function snapshotHistory() {
  if (!currentProject || isRestoring) return;
  undoStack.push(JSON.stringify(activeSceneData()));
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}
function updateHistoryButtons() { $('#undo-button').disabled = undoStack.length === 0; $('#redo-button').disabled = redoStack.length === 0; }
async function restoreHistory(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(activeSceneData()));
  const state = JSON.parse(from.pop());
  const sceneItem = activeScene(); sceneItem.data = state;
  selectedId = null; await loadSceneIntoViewport(); renderInspector(); scheduleSave(); updateHistoryButtons();
}
function undo() { restoreHistory(undoStack, redoStack); }
function redo() { restoreHistory(redoStack, undoStack); }

// ---------- Modals / UI helpers ----------
function showModal(html) { $('#modal-content').innerHTML = html; $('#modal-backdrop').classList.remove('hidden'); $$('[data-close-modal]').forEach(button => button.addEventListener('click', closeModal)); }
function closeModal() { if(activeSpatialEditorDispose){activeSpatialEditorDispose();} $('#modal-backdrop').classList.add('hidden'); $('#modal-content').innerHTML = ''; }
function openCameraEditor(entity) {
  const cfg=entity.camera ||= {mode:'isometric',fov:60,zoom:14,sensitivity:.0025};
  showModal(`<div class="modal-header"><div><span class="panel-kicker">CAMERA WORKSPACE</span><h2 id="modal-title">3D-редактор камеры</h2><p>${escapeHtml(entity.name)} · перетаскивай гизмо в пространстве</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body spatial-editor-body"><div class="spatial-preview"><canvas id="camera-spatial-canvas"></canvas></div><div class="spatial-controls"><div class="spatial-tools"><button type="button" class="button" data-spatial-mode="translate">Переместить</button><button type="button" class="button" data-spatial-mode="rotate">Вращать</button><button type="button" class="button" data-spatial-mode="scale">Масштаб</button></div><label class="field-label">Режим<select class="field-select" id="camera-editor-mode"><option value="isometric" ${cfg.mode==='isometric'?'selected':''}>Изометрическая</option><option value="free" ${cfg.mode==='free'?'selected':''}>Свободная</option></select></label><div class="field-row two"><label class="field-label">FOV<input class="field-input" id="camera-editor-fov" type="number" min="20" max="110" value="${Number(cfg.fov||60)}" /></label><label class="field-label">Масштаб / Zoom<input class="field-input" id="camera-editor-zoom" type="number" min="2" max="100" value="${Number(cfg.zoom||14)}" /></label></div><div class="modal-note">Белая пирамида и линии показывают направление и поле зрения. В режиме Isometric камера использует ортографическую проекцию; Free — перспективную. В Play Mode обзор можно вращать мышью или сенсорной зоной UI.</div></div></div><div class="modal-footer"><button class="button button-quiet" data-close-modal>Закрыть</button><button class="button button-primary" id="camera-editor-apply">Готово</button></div>`);
  const canvas=$('#camera-spatial-canvas'),miniScene=new THREE.Scene();miniScene.background=new THREE.Color('#181818');miniScene.add(new THREE.GridHelper(20,20,0x777777,0x333333));
  const preview=makeMarker(entity);miniScene.add(preview);preview.position.fromArray(entity.position||[0,0,0]);preview.rotation.set(...(entity.rotation||[0,0,0]).map(v=>THREE.MathUtils.degToRad(v)));preview.scale.fromArray(entity.scale||[1,1,1]);
  const miniCamera=new THREE.PerspectiveCamera(50,1,.1,1000);miniCamera.position.set(6,5,8);miniCamera.lookAt(preview.position);const miniRenderer=new THREE.WebGLRenderer({canvas,antialias:true});miniRenderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  const miniOrbit=new OrbitControls(miniCamera,canvas);miniOrbit.enableDamping=true;const gizmo=new TransformControls(miniCamera,canvas);gizmo.attach(preview);miniScene.add(gizmo.getHelper());
  const sync=()=>{entity.position=preview.position.toArray();entity.rotation=[preview.rotation.x,preview.rotation.y,preview.rotation.z].map(v=>THREE.MathUtils.radToDeg(v));entity.scale=preview.scale.toArray();const main=sceneObjects.get(entity.id);if(main){main.position.copy(preview.position);main.rotation.copy(preview.rotation);main.scale.copy(preview.scale);}scheduleSave();};gizmo.addEventListener('objectChange',sync);gizmo.addEventListener('dragging-changed',e=>miniOrbit.enabled=!e.value);
  $$('[data-spatial-mode]').forEach(button=>button.addEventListener('click',()=>gizmo.setMode(button.dataset.spatialMode)));
  $('#camera-editor-mode').addEventListener('change',e=>{cfg.mode=e.target.value;scheduleSave();});$('#camera-editor-fov').addEventListener('change',e=>{cfg.fov=Math.max(20,Math.min(110,Number(e.target.value)||60));scheduleSave();});$('#camera-editor-zoom').addEventListener('change',e=>{cfg.zoom=Math.max(2,Math.min(100,Number(e.target.value)||14));scheduleSave();});
  let raf=0;const draw=()=>{if(!document.body.contains(canvas))return;const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.floor(w*miniRenderer.getPixelRatio())||canvas.height!==Math.floor(h*miniRenderer.getPixelRatio())){miniRenderer.setSize(w,h,false);miniCamera.aspect=w/Math.max(1,h);miniCamera.updateProjectionMatrix();}miniOrbit.update();miniRenderer.render(miniScene,miniCamera);raf=requestAnimationFrame(draw);};draw();
  activeSpatialEditorDispose=()=>{cancelAnimationFrame(raf);miniOrbit.dispose();gizmo.dispose();miniRenderer.dispose();miniScene.traverse(o=>{o.geometry?.dispose?.();if(o.material){for(const m of(Array.isArray(o.material)?o.material:[o.material]))m.dispose?.();}});activeSpatialEditorDispose=null;};
  $('#camera-editor-apply').addEventListener('click',()=>{closeModal();const old=sceneObjects.get(entity.id);if(transform?.object===old)transform.detach();createRuntimeObject(entity).then(marker=>{if(marker&&selectedId===entity.id)transform.attach(marker);});renderInspector();scheduleSave();});
}

function openCollisionEditor(entity) {
  const draft=clone(entity.collision||{enabled:false,shape:'box',size:[1,1,1],offset:[0,0,0],isTrigger:false});
  showModal(`<div class="modal-header"><div><span class="panel-kicker">COLLISION WORKSPACE</span><h2 id="modal-title">Редактор коллизии</h2><p>${escapeHtml(entity.name)} · настройки физической формы объекта</p></div><button class="modal-close" data-collision-cancel>×</button></div>
    <form id="collision-editor-form"><div class="modal-body collision-editor-body">
      <label class="check-line"><input type="checkbox" id="col-enabled" ${draft.enabled?'checked':''}/> Включить коллизию</label>
      <label class="field-label">Форма коллайдера<select class="field-select" id="col-shape"><option value="box" ${draft.shape==='box'?'selected':''}>Box — прямоугольник</option><option value="sphere" ${draft.shape==='sphere'?'selected':''}>Sphere — сфера</option><option value="capsule" ${draft.shape==='capsule'?'selected':''}>Capsule — капсула</option></select></label>
      <div class="collision-preview spatial-collision-preview"><canvas id="collision-spatial-canvas"></canvas><span>3D COLLIDER · ПЕРЕМЕЩАЙ / МАСШТАБИРУЙ GIZMO</span></div><div class="spatial-tools"><button type="button" class="button" data-col-mode="translate">Переместить</button><button type="button" class="button" data-col-mode="scale">Размер</button></div>
      <div class="field-label">Размер коллайдера<div class="field-row">${['X','Y','Z'].map((axis,i)=>`<label class="axis-field"><span class="axis-label">${axis}</span><input class="field-input" type="number" min="0.01" step="0.05" id="col-size-${i}" value="${Number(draft.size?.[i]??1)}" /></label>`).join('')}</div></div>
      <div class="field-label">Смещение коллайдера<div class="field-row">${['X','Y','Z'].map((axis,i)=>`<label class="axis-field"><span class="axis-label">${axis}</span><input class="field-input" type="number" step="0.05" id="col-offset-${i}" value="${Number(draft.offset?.[i]??0)}" /></label>`).join('')}</div></div>
      <label class="check-line"><input type="checkbox" id="col-trigger" ${draft.isTrigger?'checked':''}/> Trigger — обнаруживать пересечение, но не блокировать движение</label>
      <div class="modal-note">Коллайдеры работают в мировых единицах сцены. Игрок использует Capsule и автоматически сталкивается с включёнными Box, Sphere и Capsule. Поворот сложных коллайдеров пока аппроксимируется осевым прямоугольником.</div>
    </div><div class="modal-footer"><button type="button" class="button button-quiet" data-collision-cancel>Отмена</button><button class="button button-primary" type="submit">Применить коллизию</button></div></form>`);
  let colliderMesh=null,colliderGizmo=null,colliderOrbit=null,colliderRenderer=null,colliderScene=null,colliderCamera=null,colliderRaf=0;
  const updateColliderPreview=()=>{if(!colliderMesh)return;const geo=draft.shape==='sphere'?new THREE.SphereGeometry(.5,24,16):draft.shape==='capsule'?new THREE.CapsuleGeometry(.5,.5,6,16):new THREE.BoxGeometry(1,1,1);const old=colliderMesh.geometry;colliderMesh.geometry=geo;old?.dispose?.();colliderMesh.scale.fromArray(draft.size);colliderMesh.position.fromArray(draft.offset);};
  const refresh=()=>{draft.enabled=$('#col-enabled').checked;draft.shape=$('#col-shape').value;draft.size=[0,1,2].map(i=>Math.max(.01,Number($(`#col-size-${i}`).value)||.01));draft.offset=[0,1,2].map(i=>Number($(`#col-offset-${i}`).value)||0);draft.isTrigger=$('#col-trigger').checked;updateColliderPreview();};
  const canvas=$('#collision-spatial-canvas');colliderScene=new THREE.Scene();colliderScene.background=new THREE.Color('#181818');colliderScene.add(new THREE.GridHelper(20,20,0x777777,0x333333));
  const baseMesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#888888',wireframe:true,transparent:true,opacity:.25}));baseMesh.scale.fromArray(entity.scale||[1,1,1]);colliderScene.add(baseMesh);
  colliderMesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#66bce8',wireframe:true,transparent:true,opacity:.8}));colliderScene.add(colliderMesh);updateColliderPreview();
  colliderCamera=new THREE.PerspectiveCamera(48,1,.1,1000);colliderCamera.position.set(5,4,7);colliderCamera.lookAt(0,0,0);colliderRenderer=new THREE.WebGLRenderer({canvas,antialias:true});colliderRenderer.setPixelRatio(Math.min(devicePixelRatio||1,2));colliderOrbit=new OrbitControls(colliderCamera,canvas);colliderOrbit.enableDamping=true;colliderGizmo=new TransformControls(colliderCamera,canvas);colliderGizmo.attach(colliderMesh);colliderScene.add(colliderGizmo.getHelper());colliderGizmo.addEventListener('dragging-changed',e=>colliderOrbit.enabled=!e.value);colliderGizmo.addEventListener('objectChange',()=>{draft.offset=colliderMesh.position.toArray();draft.size=colliderMesh.scale.toArray();[0,1,2].forEach(i=>{$(`#col-offset-${i}`).value=draft.offset[i].toFixed(2);$(`#col-size-${i}`).value=draft.size[i].toFixed(2);});});
  $$('[data-col-mode]').forEach(button=>button.addEventListener('click',()=>colliderGizmo.setMode(button.dataset.colMode)));
  $('#collision-editor-form').querySelectorAll('input,select').forEach(input=>input.addEventListener('input',refresh));
  const drawCollider=()=>{if(!document.body.contains(canvas))return;const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h){colliderRenderer.setSize(w,h,false);colliderCamera.aspect=w/Math.max(1,h);colliderCamera.updateProjectionMatrix();}colliderOrbit.update();colliderRenderer.render(colliderScene,colliderCamera);colliderRaf=requestAnimationFrame(drawCollider);};drawCollider();
  activeSpatialEditorDispose=()=>{cancelAnimationFrame(colliderRaf);colliderOrbit.dispose();colliderGizmo.dispose();colliderRenderer.dispose();colliderScene.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});activeSpatialEditorDispose=null;};
  refresh();
  $$('[data-collision-cancel]').forEach(button=>button.addEventListener('click',closeModal));
  $('#collision-editor-form').addEventListener('submit',event=>{event.preventDefault();refresh();draft.userConfigured=true;draft.autoFit=false;draft.autoFitApplied=true;entity.collision=draft;updateCollisionHelper(entity);closeModal();renderInspector();scheduleSave();toast('Параметры коллизии применены','success');});
}

function toast(message, type = '') {
  const element = document.createElement('div'); element.className = `toast ${type}`; element.textContent = message; $('#toast-region').appendChild(element);
  setTimeout(() => element.remove(), 3600);
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
function releaseObjectUrls() { for (const url of objectUrls.values()) URL.revokeObjectURL(url); objectUrls.clear(); }
function closeAllPanels() { $('#hierarchy-panel').classList.remove('open'); $('#inspector-panel').classList.remove('open'); }

// ---------- UI event wiring ----------
function bindUI() {
  $('#theme-toggle-home').addEventListener('click', toggleTheme);
  $('#theme-toggle-editor').addEventListener('click', toggleTheme);
  $('#new-project-open').addEventListener('click', createProjectModal);
  $('#import-project-open').addEventListener('click', () => $('#project-import-input').click());
  $('#project-import-input').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importProjectZip(file); });
  $('#back-home').addEventListener('click', async () => { await saveProject(false); showHome(); });
  $('#save-project-button').addEventListener('click', exportProjectZip);
  $('#play-button').addEventListener('click', startPlayMode);
  $('#open-zerobox-button').addEventListener('click', () => openWorkbench('zerobox'));
  $('#open-interface-button').addEventListener('click', () => openWorkbench('interface'));
  $('#close-workbench').addEventListener('click', closeWorkbench);
  $('#workbench-save').addEventListener('click', () => { scheduleSave(); toast('Изменения редактора сохранены', 'success'); });
  $('#workbench-run').addEventListener('click', () => { const box = currentProject?.zeroBoxes.find(item=>item.id===selectedZeroBoxId); if (box) runZeroBox(box, 'manual'); else toast('Выбери ZeroBox', 'error'); });
  $('#stop-play-button').addEventListener('click', stopPlayMode);
  $('#toggle-hierarchy').addEventListener('click', () => $('#hierarchy-panel').classList.toggle('open'));
  $('#toggle-inspector').addEventListener('click', () => $('#inspector-panel').classList.toggle('open'));
  $('#close-inspector').addEventListener('click', () => $('#inspector-panel').classList.remove('open'));
  $('#add-object-menu').addEventListener('click', openAddObjectMenu);
  $('#asset-add-tab').addEventListener('click', openAddObjectMenu);
  $('#scene-options').addEventListener('click', () => showModal(`<div class="modal-header"><div><span class="panel-kicker">SCENE SETTINGS</span><h2 id="modal-title">Настройки сцены</h2></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body"><label class="field-label">Название<input class="field-input" id="scene-setting-name" value="${escapeAttr(activeScene().name)}" /></label><label class="field-label">Цвет фона<input class="field-input" id="scene-setting-bg" type="color" value="${activeSceneData().background || '#182126'}" /></label><label class="field-label">Skybox<select class="field-select" id="scene-setting-skybox"><option value="">Без Skybox</option>${(currentProject.assets||[]).filter(a=>a.type==='texture').map(a=>`<option value="${a.id}" ${activeSceneData().skyboxAssetId===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}</select></label><label class="check-line"><input type="checkbox" id="scene-setting-grid" ${activeSceneData().grid !== false ? 'checked' : ''}/> Показывать сетку и оси</label></div><div class="modal-footer"><button class="button button-quiet" data-close-modal>Отмена</button><button class="button button-primary" id="save-scene-settings">Применить</button></div>`));
  $('#undo-button').addEventListener('click', undo); $('#redo-button').addEventListener('click', redo);
  $$('[data-transform]').forEach(button => button.addEventListener('click', () => setTransformMode(button.dataset.transform)));
  $('#focus-object').addEventListener('click', focusSelectedObject);
  $('#grid-toggle').addEventListener('click', () => { activeSceneData().grid = !activeSceneData().grid; gridHelper.visible = axesHelper.visible = activeSceneData().grid; scheduleSave(); });
  $('#viewport-help').addEventListener('click', () => toast(isPlaying?'Кликни по сцене и двигай мышь — обзор камеры · На телефоне используй CameraControlArea':'ЛКМ — вращать камеру · ПКМ — панорама · Колесо — масштаб · Gizmo — трансформация объекта')); 
  $('#import-files-button').addEventListener('click', () => $('#asset-files-input').click());
  $('#import-folder-button').addEventListener('click', () => $('#asset-folder-input').click());
  $('#new-folder-button').addEventListener('click', createAssetFolder);
  $('#asset-files-input').addEventListener('change', event => { addAssetsFromFiles([...event.target.files]); event.target.value = ''; });
  $('#asset-folder-input').addEventListener('change', event => { addAssetsFromFiles([...event.target.files]); event.target.value = ''; });
  $('#create-asset-button').addEventListener('click', () => currentTab === 'scenes' ? createScene() : currentTab === 'scripts' ? createScript() : currentTab === 'zeroboxes' ? createZeroBox() : openCreateAssetMenu());
  $('#export-current-scene-button').addEventListener('click', () => { const data = activeSceneData(); downloadBlob(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}), `${safeName(data.name)}.zescene`); toast('Файл сцены экспортирован', 'success'); });
  $$('.asset-tab').forEach(tab => tab.addEventListener('click', () => setAssetTab(tab.dataset.assetTab)));
  $('#modal-backdrop').addEventListener('click', event => { if (event.target.id === 'modal-backdrop') closeModal(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && currentProject) saveProject(false); });
  window.addEventListener('beforeunload', () => { if (currentProject) { currentProject.updatedAt = new Date().toISOString(); try { const tx = db?.transaction('projects','readwrite'); tx?.objectStore('projects').put(currentProject); } catch {} } });
  $('#scene-options').addEventListener('click', () => {
    const apply = $('#save-scene-settings'); if (!apply) return;
    apply.addEventListener('click', () => {
      const name = $('#scene-setting-name').value.trim() || 'Scene';
      const data = activeSceneData(); data.name = name; data.background = $('#scene-setting-bg').value; data.skyboxAssetId = $('#scene-setting-skybox').value || null; data.grid = $('#scene-setting-grid').checked;
      activeScene().name = name; scene.background = new THREE.Color(data.background); applySceneSkybox(); gridHelper.visible = axesHelper.visible = data.grid;
      $('#active-scene-name').textContent = $('#viewport-scene-name').textContent = name;
      closeModal(); scheduleSave(); renderAssetPanel();
    });
  });
}
function openAddObjectMenu() {
  const groups = [
    ['Геометрия', [['cube','Куб','⬡'],['sphere','Сфера','●'],['plane','Плоскость','▱'],['circle','Круг','◯'],['cylinder','Цилиндр','⬭'],['cone','Конус','△'],['capsule','Капсула','◉'],['torus','Тор','◎'],['torusKnot','Узел','♧'],['tube','Трубка','〰'],['pipe','Труба','◯'],['pyramid','Пирамида','△'],['wedge','Клин','◢'],['stairs','Лестница','▥'],['ring','Кольцо','◯'],['tetrahedron','Тетраэдр','△'],['octahedron','Октаэдр','◇'],['icosahedron','Икосаэдр','⬡'],['dodecahedron','Додекаэдр','⬢']]],
    ['Игровые объекты', [['player','Player','♟'],['spawn','Player Start','⌖']]],
    ['Камеры и окружение', [['camera','Камера (изометрия)','▣'],['skybox','Skybox','☼']]],
    ['Свет', [['light','Источник света','✦']]]
  ];
  showModal(`<div class="modal-header"><div><span class="panel-kicker">ADD TO SCENE</span><h2 id="modal-title">Добавить объект</h2><p>Выбери категорию и базовую модель.</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body add-object-categories">${groups.map(([title,items])=>`<section class="add-object-category"><h3>${title}</h3><div class="add-object-grid">${items.map(([type,name,icon])=>`<button class="add-object-choice" data-add-type="${type}"><span>${icon}</span><b>${name}</b></button>`).join('')}</div></section>`).join('')}<div class="modal-note">Импортированные модели добавляются из нижней панели «Файлы». Рекомендуемый формат Blender — GLB.</div></div>`);
  $$('[data-add-type]').forEach(button => button.addEventListener('click', () => { const type=button.dataset.addType;closeModal();addObjectToScene(['camera','player','spawn','light','skybox'].includes(type)?type:'primitive',{primitive:type}); }));
}


// ---------- Asset folders, deletion and scene cleanup ----------
function openCreateAssetMenu() {
  showModal(`<div class="modal-header"><div><span class="panel-kicker">PROJECT CONTENT</span><h2 id="modal-title">Создать</h2><p>Добавь папку проекта или объект на сцену.</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body"><button class="button" id="menu-create-folder">📁 Новая папка</button><button class="button" id="menu-add-object">◈ Добавить 3D-объект</button><button class="button" id="menu-create-zerobox">◇ Создать ZeroBox</button><button class="button" id="menu-create-script">〈〉 Создать ZeroScript</button></div>`);
  $('#menu-create-folder').addEventListener('click',()=>{closeModal();createAssetFolder();});
  $('#menu-add-object').addEventListener('click',()=>{closeModal();openAddObjectMenu();});
  $('#menu-create-zerobox').addEventListener('click',()=>{closeModal();createZeroBox();});
  $('#menu-create-script').addEventListener('click',()=>{closeModal();createScript();});
}
function createAssetFolder() {
  showModal(`<div class="modal-header"><div><span class="panel-kicker">ASSET BROWSER</span><h2 id="modal-title">Новая папка</h2></div><button class="modal-close" data-close-modal>×</button></div><form id="folder-form"><div class="modal-body"><label class="field-label">Название папки<input class="field-input" id="folder-name" placeholder="Models, Textures, Scripts…" maxlength="48" required /></label><div class="modal-note">Папки помогают группировать модели, текстуры, скрипты и другие ресурсы.</div></div><div class="modal-footer"><button type="button" class="button button-quiet" data-close-modal>Отмена</button><button class="button button-primary">Создать папку</button></div></form>`);
  $('#folder-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#folder-name').value.trim().replace(/[\\/:*?"<>|]+/g,'_');if(!name)return;currentProject.assetFolders||=[];if(!currentProject.assetFolders.includes(name))currentProject.assetFolders.push(name);assetFolderFilter=name;closeModal();currentTab='assets';renderAssetPanel();scheduleSave();toast(`Папка «${name}» создана`,'success');});
}
function deleteAssetFolder(folder) {
  showModal(`<div class="modal-header"><div><span class="panel-kicker">DELETE FOLDER</span><h2 id="modal-title">Удалить папку?</h2><p>Файлы внутри папки останутся в корне проекта.</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-footer"><button class="button button-quiet" data-close-modal>Отмена</button><button class="button button-danger" id="confirm-delete-folder">Удалить папку</button></div>`);
  $('#confirm-delete-folder').addEventListener('click',()=>{currentProject.assetFolders=(currentProject.assetFolders||[]).filter(f=>f!==folder);currentProject.assets.forEach(a=>{if(a.folder===folder)a.folder='';else if(a.folder?.startsWith(folder+'/'))a.folder=a.folder.slice(folder.length+1);});if(assetFolderFilter===folder)assetFolderFilter='All';closeModal();renderAssetPanel();scheduleSave();});
}
function deleteAsset(assetId) {
  const asset=currentProject.assets.find(a=>a.id===assetId);if(!asset)return;
  showModal(`<div class="modal-header"><div><span class="panel-kicker">DELETE RESOURCE</span><h2 id="modal-title">Удалить ресурс?</h2><p>${escapeHtml(asset.name)} будет удалён из проекта. Размещённые модели, использующие этот файл, тоже будут удалены.</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-footer"><button class="button button-quiet" data-close-modal>Отмена</button><button class="button button-danger" id="confirm-delete-asset">Удалить</button></div>`);
  $('#confirm-delete-asset').addEventListener('click',()=>{
    currentProject.assets=currentProject.assets.filter(a=>a.id!==assetId);
    if(objectUrls.has(assetId)){URL.revokeObjectURL(objectUrls.get(assetId));objectUrls.delete(assetId);}
    for(const sc of currentProject.scenes){sc.data.objects=sc.data.objects.filter(e=>!(e.type==='model'&&e.assetId===assetId));sc.data.objects.forEach(e=>{if(e.material?.textureAssetId===assetId){delete e.material.textureAssetId;}if(e.soundAssetId===assetId)e.soundAssetId=null;});}
    if(selectedAssetId===assetId)selectedAssetId=null;
    closeModal();loadSceneIntoViewport().then(()=>{renderAssetPanel();renderHierarchy();renderInspector();scheduleSave();});toast('Ресурс удалён','success');
  });
}
function deleteScene(sceneId) {
  if(currentProject.scenes.length<=1){toast('В проекте должна остаться хотя бы одна сцена','error');return;}
  showModal(`<div class="modal-header"><div><span class="panel-kicker">SCENE MANAGER</span><h2 id="modal-title">Удалить сцену?</h2><p>Все объекты этой сцены будут удалены из проекта.</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-footer"><button class="button button-quiet" data-close-modal>Отмена</button><button class="button button-danger" id="confirm-delete-scene">Удалить</button></div>`);
  $('#confirm-delete-scene').addEventListener('click',()=>{currentProject.scenes=currentProject.scenes.filter(sc=>sc.id!==sceneId);if(currentProject.activeSceneId===sceneId)currentProject.activeSceneId=currentProject.scenes[0].id;closeModal();switchScene(currentProject.activeSceneId);});
}

// ---------- ZeroBox visual logic and camera UI ----------
const ZEROBOX_CATEGORIES = [
  {name:'События', color:'#e4a64c', items:['Straightaway','Buttonclicked','Buttonpressed','ButtonResting','JoystickMoved']},
  {name:'Движение и Player', color:'#68b7d8', items:['Moving','Speed','Squat','Jumpup','Life','Gamespeed']},
  {name:'Математика', color:'#aa91e8', items:['Number','Numericarray','Minus','Plus','Divide','Multiply','Size']},
  {name:'Логика', color:'#d68abd', items:['Change','Loop','Branching','ForkYesorno','Close']},
  {name:'Действия', color:'#83c77b', items:['Laser','Twist','Collision','Physics']},
  {name:'Визуал', color:'#e78d75', items:['Writes','ChangeTransparency','ChangeColor','ChangeTexture','ChangeModel','Changinganimation']},
  {name:'Звук', color:'#62b9a8', items:['Changesound','Playsound',"Don'tSound",'Pausesound']},
  {name:'Типы переменных', color:'#9aa9b5', items:['Yesorno','Transparency','Color']}
];
const ZEROBOX_DEFAULTS = {
  targetObjectId:'', variable:'Value', value:1, amount:1, side:'Forward', speed:1,
  x:0, y:0, z:0, color:'#a5ef4c', enabled:true, key:'', buttonId:'', distance:25,
  repeat:3, condition:'true', assetId:'', animation:'', text:'Hello from ZeroBox',
  sizeX:1, sizeY:1, sizeZ:1, movementMode:'offset', direction:'Forward', xVariable:'', yVariable:'', zVariable:'', speedMultiplier:1
};
function createZeroBox() {
  const box = {id:uid(), name:`ZeroBox_${(currentProject.zeroBoxes||[]).length+1}`, blocks:[], connections:[], variables:[]};
  currentProject.zeroBoxes ||= []; currentProject.zeroBoxes.push(box); selectedZeroBoxId = box.id; selectedBlockId = null;
  setAssetTab('zeroboxes'); openWorkbench('zerobox', box.id); scheduleSave();
}
function openWorkbench(mode, boxId=null) {
  if (!currentProject) return;
  workbenchMode = mode;
  if (mode === 'zerobox') {
    if (boxId) selectedZeroBoxId = boxId;
    if (!selectedZeroBoxId || !currentProject.zeroBoxes.some(b=>b.id===selectedZeroBoxId)) selectedZeroBoxId = currentProject.zeroBoxes[0]?.id;
    if (!selectedZeroBoxId) { createZeroBox(); return; }
  }
  $('#workbench-overlay').classList.remove('hidden');
  $('#workbench-title').textContent = mode === 'zerobox' ? 'ZeroBox — визуальная логика' : 'Интерфейс — UI Designer';
  $('#workbench-subtitle').textContent = mode === 'zerobox' ? 'События, переменные и цепочки действий' : 'Размещение элементов на экране камеры';
  $('#workbench-run').style.display = mode === 'zerobox' ? '' : 'none';
  renderWorkbench();
}
function closeWorkbench() {
  $('#workbench-overlay').classList.add('hidden'); workbenchMode = null; scheduleSave();
}
function zeroBlockFields(block) {
  const c = block.config ||= {...ZEROBOX_DEFAULTS};
  const objectOptions = `<option value="">Активный объект</option>${(activeSceneData()?.objects||[]).map(e=>`<option value="${e.id}" ${c.targetObjectId===e.id?'selected':''}>${escapeHtml(e.name)}</option>`).join('')}`;
  const varOptionsFor=(selected='')=>`<option value="">Число из поля вручную</option>${(currentProject.variables||[]).map(v=>`<option value="${escapeAttr(v.name)}" ${selected===v.name?'selected':''}>${escapeHtml(v.name)} (${v.type})</option>`).join('')}`;
  const varOptions = varOptionsFor(c.variable);
  const eventUIType=block.type==='JoystickMoved'?'Joystick':'Button';
  const buttonOptions = `<option value="">Любой элемент</option>${(currentProject.uiElements||[]).filter(e=>e.type===eventUIType).map(e=>`<option value="${e.id}" ${c.buttonId===e.id?'selected':''}>${escapeHtml(e.text||e.type)}</option>`).join('')}`;
  const uiOptions = `<option value="">Не задан</option>${(currentProject.uiElements||[]).map(e=>`<option value="${e.id}" ${c.targetUIId===e.id?'selected':''}>${e.type}: ${escapeHtml(e.text||e.id.slice(0,6))}</option>`).join('')}`;
  const groupOptions = `<option value="">Активный объект</option><option value="__all__" ${c.targetObjectId==='__all__'?'selected':''}>Все объекты сцены (группа)</option>${(activeSceneData()?.objects||[]).map(e=>`<option value="${e.id}" ${c.targetObjectId===e.id?'selected':''}>${escapeHtml(e.name)}</option>`).join('')}`;
  const input=(key,label,type='number')=>`<label class="field-label">${label}<input class="field-input" data-block-field="${key}" type="${type}" value="${escapeAttr(c[key]??'')}" /></label>`;
  const select=(key,label,options)=>`<label class="field-label">${label}<select class="field-select" data-block-field="${key}">${options}</select></label>`;
  let html='';
  if (['Buttonclicked','Buttonpressed','ButtonResting'].includes(block.type)) html += select('buttonId','Кнопка интерфейса',buttonOptions)+input('key','Или клавиша клавиатуры','text');
  if (block.type==='JoystickMoved') html += select('buttonId','Джойстик интерфейса',buttonOptions);
  if (['Speed','Jumpup','Squat','Moving','Gamespeed','Twist','Minus','Plus','Divide','Multiply'].includes(block.type)) html += input('amount',block.type==='Gamespeed'?'Множитель времени (0–5)':block.type==='Moving'?'Расстояние / сила':'Значение');
  if (block.type==='Loop') html += input('repeat','Количество повторений');
  if (['Moving','Size','Laser'].includes(block.type)) html += input('x',block.type==='Laser'?'Смещение X':'X')+input('y',block.type==='Laser'?'Смещение Y':'Y')+input('z',block.type==='Laser'?'Смещение Z':'Z');
  if (block.type==='Moving') html += select('movementMode','Тип перемещения','<option value="offset">Смещение по X/Y/Z</option><option value="direction">Направление + расстояние</option><option value="position">К заданной позиции</option><option value="force">Приложить силу (Н)</option>')+select('direction','Направление','<option value="Forward">Вперёд</option><option value="Backward">Назад</option><option value="Left">Влево</option><option value="Right">Вправо</option><option value="Up">Вверх</option><option value="Down">Вниз</option>')+select('xVariable','Переменная X',varOptionsFor(c.xVariable))+select('yVariable','Переменная Y',varOptionsFor(c.yVariable))+select('zVariable','Переменная Z',varOptionsFor(c.zVariable))+`<div class="modal-note">Для джойстика: X = JoystickX, Z = JoystickY. Блок Speed перед Moving задаёт скорость в единицах в секунду.</div>`;
  if (block.type==='Laser') html += input('distance','Длина луча')+input('radius','Радиус проверки')+select('variable','Записать результат в',varOptions)+select('side','Направление','<option value="Forward">Вперёд</option><option value="Backward">Назад</option><option value="Left">Влево</option><option value="Right">Вправо</option><option value="Up">Вверх</option><option value="Down">Вниз</option>')+select('stopCondition','Условие остановки','<option value="Hit">При попадании</option><option value="NoHit">Если ничего не найдено</option>');
  if (['Number','Numericarray','Yesorno','Transparency','Color'].includes(block.type)) html += input('variable','Имя переменной','text')+input('value','Стартовое значение',block.type==='Color'?'color':(['Number','Numericarray','Transparency'].includes(block.type)?'number':'text'));
  if (['Moving','Twist','Size','Collision','Physics','Life','Laser','ChangeColor','ChangeTransparency','ChangeTexture','ChangeModel','Changinganimation','Changesound','Playsound',"Don'tSound",'Pausesound','Jumpup','Squat'].includes(block.type)) html += select('targetObjectId','Целевой объект',block.type==='Physics'?groupOptions:objectOptions);
  if (['Writes','ChangeColor','ChangeTransparency'].includes(block.type)) html += select('targetUIId','UI-элемент',uiOptions);
  if (['Change','Minus','Plus','Divide','Multiply','ForkYesorno','Branching'].includes(block.type)) html += select('variable','Переменная',varOptions);
  if (['Change','ForkYesorno','Branching'].includes(block.type)) html += input('value','Значение / условие','text');
  if (['ChangeColor'].includes(block.type)) html += input('color','Цвет','color');
  if (['ChangeTransparency'].includes(block.type)) html += input('value','Прозрачность (0–1)');
  if (['Writes'].includes(block.type)) html += input('text','Текст сообщения','text');
  if (['Collision','Physics','Life'].includes(block.type)) html += select('enabled','Состояние','<option value="true">Да / включить</option><option value="false">Нет / выключить</option>');
  if (['ChangeTexture','ChangeModel','Changesound','Playsound'].includes(block.type)) {
    const allowed = block.type==='ChangeTexture' ? ['texture'] : block.type==='ChangeModel' ? ['model'] : ['audio'];
    html += select('assetId','Ресурс',`<option value="">Не выбран</option>${currentProject.assets.filter(a=>allowed.includes(a.type)).map(a=>`<option value="${a.id}" ${c.assetId===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}`);
  }
  if (block.type==='Changinganimation') { const target=targetEntityForBlock(block); html += select('animation','Клип анимации',`<option value="">Первый доступный</option>${(target?.availableAnimations||[]).map(name=>`<option value="${escapeAttr(name)}" ${c.animation===name?'selected':''}>${escapeHtml(name)}</option>`).join('')}`); }
  if (['Straightaway','Buttonclicked','Buttonpressed','ButtonResting','JoystickMoved'].includes(block.type)) html += `<div class="modal-note">${block.type==='Straightaway'?'Запускает цепочку автоматически при старте Play Mode.':block.type==='JoystickMoved'?'Вызывается в каждом кадре, пока джойстик отклонён.':'Событие запускает цепочку при нужном состоянии кнопки.'}</div>`;
  if (!html) html = `<div class="modal-note">Этот блок добавлен в цепочку. Настройки и поведение можно расширять по мере сборки логики.</div>`;
  return html;
}
function zeroPortLayout(block) {
  const isEvent = ['Straightaway','Buttonclicked','Buttonpressed','ButtonResting','JoystickMoved'].includes(block.type);
  const isEnd = block.type === 'Close';
  const isBranch = ['Branching','ForkYesorno'].includes(block.type);
  return {
    input: !isEvent,
    outputs: isEnd ? [] : isBranch ? ['yes','no'] : ['out'],
    inputLabel: 'Вход', outputLabel: 'Выход'
  };
}
function zeroHelpText(type) {
  const help = {
    Straightaway:'Запускает эту цепочку сразу после входа в Play Mode.',
    Buttonclicked:'Срабатывает один раз после клика по назначенной кнопке.',
    Buttonpressed:'Повторно запускает подключённую цепочку, пока кнопка или назначенная клавиша удерживается.',
    ButtonResting:'Срабатывает после отпускания кнопки или клавиши.',
    JoystickMoved:'Работает в каждом игровом кадре, пока экранный джойстик отклонён. Свяжи JoystickX с X, а JoystickY с Z блока Moving.',
    Moving:'Перемещает объект по координатам, направлению или прикладывает силу с учётом массы.', Speed:'Задаёт множитель скорости для следующего Moving.', Gamespeed:'Замедляет, ускоряет или останавливает игровое время (0–5).',
    Squat:'Уменьшает высоту коллайдера объекта.', Jumpup:'Поднимает Player по вертикали.', Life:'Записывает состояние жив/мёртв.',
    Number:'Создаёт числовую переменную.', Numericarray:'Создаёт одно изменяемое числовое значение для HP, стамины и других характеристик. Plus и Minus меняют его в реальном времени.', Yesorno:'Создаёт логическую переменную Да/Нет.', Transparency:'Создаёт переменную прозрачности от 0 до 1.', Color:'Создаёт переменную цвета.',
    Size:'Меняет размер объекта по X, Y и Z.', Minus:'Вычитает указанное число из переменной.', Plus:'Прибавляет число к переменной.', Divide:'Делит переменную на указанное число.', Multiply:'Умножает переменную на указанное число.',
    Change:'Записывает новое значение в выбранную переменную.', Loop:'Повторяет следующий шаг указанное число раз.', Branching:'Разветвляет выполнение по условию переменной на выходы Yes и No.', ForkYesorno:'Проверяет переменную Да/Нет и выбирает выход Yes или No.', Close:'Останавливает текущую цепочку ZeroBox.',
    Writes:'Выводит сообщение или записывает текст в UI Text.', Moving:'Смещает выбранный объект на заданные координаты.', Laser:'Выпускает невидимый луч и записывает результат проверки в переменную.',
    ChangeTransparency:'Меняет прозрачность объекта или UI-элемента.', ChangeColor:'Меняет цвет объекта или UI-элемента.', ChangeTexture:'Назначает объекту текстуру из файлов проекта.', ChangeModel:'Заменяет модель объекта.', Changesound:'Назначает звуковой ресурс объекту.',
    Changinganimation:'Запускает выбранную анимацию модели.', Playsound:'Запускает аудиофайл.', "Don'tSound":'Останавливает воспроизведение звука.', Pausesound:'Ставит воспроизведение на паузу.', Twist:'Поворачивает объект.', Collision:'Включает или выключает коллизию.', Physics:'Включает или выключает физический режим объекта или группы объектов.'
  };
  return help[type] || 'Блок выполняет действие в цепочке ZeroBox.';
}
function renderZeroBoxHelp() {
  const descriptions = ZEROBOX_CATEGORIES.flatMap(category => category.items.map(type => `<div class="zero-help-item"><strong>${escapeHtml(type)}</strong><span>${escapeHtml(zeroHelpText(type))}</span></div>`)).join('');
  showModal(`<div class="modal-header"><div><span class="panel-kicker">ZEROBOX REFERENCE</span><h2 id="modal-title">Справка по блокам</h2><p>Краткое описание каждого блока и его назначения.</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body zero-help-list">${descriptions}</div><div class="modal-footer"><button class="button button-primary" data-close-modal>Понятно</button></div>`);
}
function addZeroBoxBlock(type, dropX=null, dropY=null) {
  const box = currentProject.zeroBoxes.find(item=>item.id===selectedZeroBoxId); if (!box) return;
  box.connections ||= [];
  const index = box.blocks.length;
  const canvas=$('#zero-node-canvas');
  const viewX=canvas ? canvas.scrollLeft+Math.max(24,(canvas.clientWidth-254)/2) : 360;
  const viewY=canvas ? canvas.scrollTop+Math.max(24,(canvas.clientHeight-180)/2) : 130;
  const block = {id:uid(), type, x:Math.max(0,Number.isFinite(dropX)?dropX:viewX), y:Math.max(0,Number.isFinite(dropY)?dropY:viewY), config:{...ZEROBOX_DEFAULTS}};
  if (type==='Size') Object.assign(block.config,{x:1,y:1,z:1});
  if (['Number','Numericarray','Yesorno','Transparency','Color'].includes(type)) {
    const dataType = type === 'Number' ? 'Number' : type === 'Numericarray' ? 'Numericarray' : type === 'Yesorno' ? 'Yesorno' : type;
    box.variables ||= []; let variableName=`${dataType}_${box.variables.length+1}`;let suffix=1;while((currentProject.variables||[]).some(v=>v.name===variableName))variableName=`${dataType}_${box.variables.length+1}_${suffix++}`;const variable={id:uid(),name:variableName,type:dataType,value:['Number','Numericarray'].includes(dataType)?0:dataType==='Yesorno'?false:dataType==='Color'?'#ffffff':1};box.variables.push(variable);currentProject.variables ||= [];currentProject.variables.push({...variable});block.config.variable=variable.name;block.config.value=variable.value;
  }
  box.blocks.push(block); selectedBlockId = block.id; selectedBlockIds = new Set([block.id]); renderWorkbench(); scheduleSave();
}
function moveZeroBlock(id, direction) {
  const box = currentProject.zeroBoxes.find(item=>item.id===selectedZeroBoxId); if (!box) return;
  const block=box.blocks.find(b=>b.id===id); if(!block)return;
  block.y=Math.max(30,(block.y||100)+direction*45); renderWorkbench(); scheduleSave();
}
function deleteZeroBlock(id) {
  const box = currentProject.zeroBoxes.find(item=>item.id===selectedZeroBoxId); if (!box) return;
  const deleting = selectedBlockIds.has(id) ? new Set(selectedBlockIds) : new Set([id]);
  box.blocks = box.blocks.filter(block=>!deleting.has(block.id));
  box.connections = (box.connections||[]).filter(c=>!deleting.has(c.from?.nodeId)&&!deleting.has(c.to?.nodeId));
  deleting.forEach(blockId=>selectedBlockIds.delete(blockId));
  if (selectedBlockId && deleting.has(selectedBlockId)) selectedBlockId=null;
  renderWorkbench(); scheduleSave();
}
function copyZeroBlocks() {
  const box=currentProject?.zeroBoxes?.find(item=>item.id===selectedZeroBoxId); if(!box)return;
  const ids=selectedBlockIds.size?selectedBlockIds:new Set(selectedBlockId?[selectedBlockId]:[]);
  if(!ids.size){toast('Сначала выбери один или несколько блоков','error');return;}
  const blocks=box.blocks.filter(b=>ids.has(b.id)).map(clone);
  const connections=(box.connections||[]).filter(c=>ids.has(c.from?.nodeId)&&ids.has(c.to?.nodeId)).map(clone);
  zeroBlockClipboard={blocks,connections};
  toast(`Скопировано блоков: ${blocks.length}`,'success');
}
function pasteZeroBlocks() {
  const box=currentProject?.zeroBoxes?.find(item=>item.id===selectedZeroBoxId); if(!box||!zeroBlockClipboard?.blocks?.length){toast('Буфер ZeroBox пуст','error');return;}
  const idMap=new Map(zeroBlockClipboard.blocks.map(b=>[b.id,uid()]));
  const pasted=zeroBlockClipboard.blocks.map((b,index)=>({...clone(b),id:idMap.get(b.id),x:(b.x||360)+60,y:(b.y||130)+60,config:{...(b.config||{})}}));
  const links=zeroBlockClipboard.connections.map(c=>({...clone(c),id:uid(),from:{...c.from,nodeId:idMap.get(c.from.nodeId)},to:{...c.to,nodeId:idMap.get(c.to.nodeId)}}));
  box.blocks.push(...pasted);box.connections||=[];box.connections.push(...links);
  selectedBlockIds=new Set(pasted.map(b=>b.id));selectedBlockId=pasted[0]?.id||null;renderWorkbench();scheduleSave();toast(`Вставлено блоков: ${pasted.length}`,'success');
}
function zeroNodePortPoint(block, side, type='exec', portName='') {
  const nodeWidth=254, x=Number(block.x)||0, y=Number(block.y)||0;
  const portY=portName==='no'?89:61;
  return {x:side==='out'?x+nodeWidth:x,y:y+portY};
}
function renderZeroWires(box) {
  const svg=$('#zero-wires');if(!svg)return;
  svg.innerHTML='';
  for(const connection of box.connections||[]){
    const from=box.blocks.find(b=>b.id===connection.from?.nodeId),to=box.blocks.find(b=>b.id===connection.to?.nodeId);if(!from||!to)continue;
    const a=zeroNodePortPoint(from,'out',connection.type||'exec',connection.from?.port),b=zeroNodePortPoint(to,'in',connection.type||'exec',connection.to?.port);
    const bend=Math.max(65,Math.abs(b.x-a.x)*.42);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M ${a.x} ${a.y} C ${a.x+bend} ${a.y}, ${b.x-bend} ${b.y}, ${b.x} ${b.y}`);path.setAttribute('class','zero-wire');path.dataset.connectionId=connection.id;path.setAttribute('fill','none');path.setAttribute('stroke-width','3');svg.appendChild(path);
    const hit=path.cloneNode();hit.setAttribute('class','zero-wire-hit');hit.setAttribute('stroke-width','18');hit.dataset.connectionId=connection.id;hit.setAttribute('aria-label','Удалить провод');hit.setAttribute('tabindex','0');svg.appendChild(hit);
  }
}
function beginZeroWire(nodeId, side, type, port) {
  if(side==='in'){
    if(!pendingZeroPort){toast('Сначала нажми на выход другого блока','error');return;}
    if(pendingZeroPort.type!==type){toast('Нельзя соединить разные типы портов','error');return;}
    const box=currentProject.zeroBoxes.find(item=>item.id===selectedZeroBoxId);if(!box)return;
    if(pendingZeroPort.nodeId===nodeId){pendingZeroPort=null;renderWorkbench();return;}
    box.connections||=[];
    const duplicate=box.connections.some(c=>c.from?.nodeId===pendingZeroPort.nodeId&&c.from?.port===pendingZeroPort.port&&c.to?.nodeId===nodeId&&c.to?.port===port);
    if(!duplicate)box.connections.push({id:uid(),type,from:{...pendingZeroPort},to:{nodeId,port}});
    pendingZeroPort=null;renderWorkbench();scheduleSave();return;
  }
  pendingZeroPort={nodeId,port,type};
  $$('.zero-port.pending').forEach(el=>el.classList.remove('pending'));
  const node=$(`[data-node-id="${nodeId}"]`);node?.querySelector(`[data-port-side="out"][data-port-type="${type}"][data-port-name="${port}"]`)?.classList.add('pending');
  toast('Теперь нажми на совместимый вход другого блока','success');
}
function setZeroBoxZoom(next, anchorX=null, anchorY=null) {
  const box=currentProject?.zeroBoxes?.find(item=>item.id===selectedZeroBoxId),canvas=$('#zero-node-canvas'),surface=$('#zero-node-surface');if(!box||!canvas||!surface)return;
  const old=Number(box.zoom)||1,zoom=Math.max(.15,Math.min(3,Number(next)||1));if(Math.abs(zoom-old)<.001)return;
  const ax=anchorX??canvas.clientWidth/2,ay=anchorY??canvas.clientHeight/2;const worldX=(canvas.scrollLeft+ax)/old,worldY=(canvas.scrollTop+ay)/old;
  box.zoom=zoom;surface.style.zoom=String(zoom);canvas.scrollLeft=worldX*zoom-ax;canvas.scrollTop=worldY*zoom-ay;const label=$('#zero-zoom-label');if(label)label.textContent=`${Math.round(zoom*100)}%`;scheduleSave();
}
function selectZeroBlockNetwork() {
  const box=currentProject?.zeroBoxes?.find(item=>item.id===selectedZeroBoxId);if(!box)return;
  const seed=selectedBlockIds.size?new Set(selectedBlockIds):new Set(selectedBlockId?[selectedBlockId]:[]);if(!seed.size){toast('Выбери блок сети','error');return;}
  const seen=new Set(seed),queue=[...seed];while(queue.length){const id=queue.shift();for(const c of box.connections||[]){const a=c.from?.nodeId,b=c.to?.nodeId;if(a===id&&!seen.has(b)){seen.add(b);queue.push(b);}if(b===id&&!seen.has(a)){seen.add(a);queue.push(a);}}}
  selectedBlockIds=seen;selectedBlockId=[...seen][0]||null;renderWorkbench();toast(`Выделена сеть: ${seen.size} блоков`,'success');
}
function deleteSelectedZeroBlocks() {
  const box=currentProject?.zeroBoxes?.find(item=>item.id===selectedZeroBoxId);
  const ids=new Set(selectedBlockIds.size?selectedBlockIds:(selectedBlockId?[selectedBlockId]:[]));
  if(!box||!ids.size){toast('Сначала выбери блоки или сеть','error');return;}
  box.blocks=(box.blocks||[]).filter(block=>!ids.has(block.id));
  box.connections=(box.connections||[]).filter(connection=>!ids.has(connection.from?.nodeId)&&!ids.has(connection.to?.nodeId));
  selectedBlockIds.clear();selectedBlockId=null;pendingZeroPort=null;renderWorkbench();scheduleSave();toast(`Удалено блоков: ${ids.size}`,'success');
}

function renderWorkbench() {
  if (!currentProject || !workbenchMode) return;
  const previousCanvas = $('#zero-node-canvas');
  const previousScroll = previousCanvas ? { left: previousCanvas.scrollLeft, top: previousCanvas.scrollTop } : null;
  const body = $('#workbench-body');
  if (workbenchMode==='zerobox') {
    const box = currentProject.zeroBoxes.find(item=>item.id===selectedZeroBoxId);
    if (!box) { body.innerHTML='<div class="zero-empty">Создай ZeroBox в панели файлов.</div>'; return; }
    box.connections ||= [];
    const nodes=box.blocks.map(block=>{
      const ports=zeroPortLayout(block);
      const inputPort=ports.input?`<button class="zero-port input-port" data-port-side="in" data-port-type="exec" data-port-name="execIn" title="Вход выполнения"><i></i><span>Вход</span></button>`:'';
      const outputPorts=ports.outputs.map(name=>`<button class="zero-port output-port ${name==='yes'?'yes-port':name==='no'?'no-port':''}" data-port-side="out" data-port-type="exec" data-port-name="${name==='out'?'execOut':name}" title="Выход ${name}"><span>${name==='yes'?'Да':name==='no'?'Нет':'Выход'}</span><i></i></button>`).join('');
      return `<article class="node-card ${selectedBlockIds.has(block.id)||selectedBlockId===block.id?'selected':''}" data-node-id="${block.id}" style="left:${Math.max(0,block.x||0)}px;top:${Math.max(0,block.y||0)}px"><div class="node-card-head" data-node-drag="${block.id}"><span>◇</span><strong>${escapeHtml(block.type)}</strong><span class="node-kind">${ZEROBOX_CATEGORIES.find(cat=>cat.items.includes(block.type))?.name||'BLOCK'}</span><button class="node-help-mini" data-node-help="${escapeAttr(block.type)}" title="Описание блока">?</button></div><div class="node-port-row">${inputPort}<span class="port-type-label">EXEC</span>${outputPorts}</div><div class="node-card-body">${zeroBlockFields(block)}</div><div class="node-card-actions"><button data-node-copy="${block.id}">Копировать</button><button data-node-delete="${block.id}">× Удалить</button></div></article>`;
    }).join('');
    body.innerHTML = `<div class="workbench-grid zero-workbench-grid">
      <aside class="workbench-sidebar"><div class="workbench-section-title">БИБЛИОТЕКА БЛОКОВ</div><input class="field-input zero-block-search" id="zero-block-search" placeholder="Поиск блока…" /><div class="zero-library-list">${ZEROBOX_CATEGORIES.map(cat=>`<div class="node-category">${cat.name}</div><div class="node-palette">${cat.items.map(type=>`<button data-add-block="${escapeAttr(type)}" draggable="true" title="${escapeAttr(zeroHelpText(type))}">${escapeHtml(type)}</button>`).join('')}</div>`).join('')}</div><div class="workbench-section-title" style="margin-top:18px">МОИ ПЕРЕМЕННЫЕ</div><button class="button button-quiet button-small" id="add-zero-variable">＋ Создать переменную</button>${(currentProject.variables||[]).map(v=>`<div class="zero-variable"><b>${escapeHtml(v.name)}</b><label class="asset-meta">${v.type}<input class="field-input" data-variable-value="${escapeAttr(v.name)}" type="${['Number','Numericarray','Transparency'].includes(v.type)?'number':v.type==='Color'?'color':'text'}" value="${escapeAttr(String(v.value))}" /></label><button class="tiny-icon-button" data-variable-delete="${escapeAttr(v.name)}" title="Удалить переменную">×</button></div>`).join('')}<div class="workbench-toolbar-tip">Перетаскивай блоки за заголовок. Соединяй выходы справа со входами слева. ЛКМ по пустому месту, ПКМ или средняя кнопка — двигать поле; свайп на телефоне — панорама. Перетаскивай блоки из библиотеки. Клик по проводу удаляет его. Shift/Ctrl + клик выделяет несколько блоков.</div></aside>
      <main class="node-canvas zero-node-canvas" id="zero-node-canvas"><div class="zero-canvas-tools"><button type="button" id="zero-zoom-out">−</button><span id="zero-zoom-label">${Math.round((box.zoom||1)*100)}%</span><button type="button" id="zero-zoom-in">＋</button><button type="button" id="zero-zoom-reset">100%</button></div><div class="zero-node-surface" id="zero-node-surface" style="zoom:${box.zoom||1}"><svg id="zero-wires" class="zero-wires" width="5200" height="3600" viewBox="0 0 5200 3600" aria-label="Связи ZeroBox"></svg>${nodes||'<div class="zero-empty zero-canvas-empty">Добавь блоки из библиотеки слева, затем размести их на большом поле.</div>'}</div></main>
      <aside class="workbench-properties"><div class="workbench-section-title">СВОЙСТВА ZEROBOX</div><label class="field-label">Название<input class="field-input" id="zerobox-name" value="${escapeAttr(box.name)}" /></label><label class="field-label">Назначить ZeroBox объекту<select class="field-select" id="zerobox-target"><option value="">Не назначен</option>${(activeSceneData().objects||[]).map(e=>`<option value="${e.id}" ${box.targetObjectId===e.id?'selected':''}>${escapeHtml(e.name)}</option>`).join('')}</select></label><div class="zero-box-stats">Блоков: ${box.blocks.length}<br>Соединений: ${box.connections.length}</div><div class="modal-note">Порядок выполнения задаётся проводами, а не расположением блоков. Для старых ZeroBox без проводов сохранён запуск сверху вниз.</div><button class="button button-quiet" id="export-zerobox">↓ Экспорт .zbox</button></aside>
    </div>`;
    activeZeroBoxCanvas=$('#zero-node-canvas');
    if(previousScroll){activeZeroBoxCanvas.scrollLeft=previousScroll.left;activeZeroBoxCanvas.scrollTop=previousScroll.top;}
    $$('[data-add-block]').forEach(b=>{
      b.addEventListener('click',()=>addZeroBoxBlock(b.dataset.addBlock));
      b.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-zeroengine-block',b.dataset.addBlock);event.dataTransfer.effectAllowed='copy';});
    });
    const zeroCanvas=activeZeroBoxCanvas;
    zeroCanvas.addEventListener('pointerdown',event=>{
      const onNode=!!event.target.closest('.node-card');
      const onWire=!!event.target.closest('.zero-wire-hit');
      const onControl=!!event.target.closest('button,input,select,textarea');
      const backgroundLeftDrag=event.button===0&&!onNode&&!onWire&&!onControl;
      const panButton=event.button===1||event.button===2||backgroundLeftDrag||(event.button===0&&event.shiftKey);
      if(!panButton||onNode||onWire||onControl)return;
      event.preventDefault();zeroCanvas.setPointerCapture?.(event.pointerId);zeroCanvasPanActive=true;const sx=event.clientX,sy=event.clientY,sl=zeroCanvas.scrollLeft,st=zeroCanvas.scrollTop;zeroCanvas.classList.add('panning');
      const move=e=>{zeroCanvas.scrollLeft=sl-(e.clientX-sx);zeroCanvas.scrollTop=st-(e.clientY-sy);};
      const up=()=>{zeroCanvas.removeEventListener('pointermove',move);zeroCanvas.removeEventListener('pointerup',up);zeroCanvas.removeEventListener('pointercancel',up);zeroCanvas.classList.remove('panning');zeroCanvasPanActive=false;};
      zeroCanvas.addEventListener('pointermove',move);zeroCanvas.addEventListener('pointerup',up);zeroCanvas.addEventListener('pointercancel',up);
    });
    zeroCanvas.addEventListener('contextmenu',event=>event.preventDefault());
    zeroCanvas.addEventListener('wheel',event=>{event.preventDefault();if(Math.abs(event.deltaY)>0)setZeroBoxZoom((box.zoom||1)*(event.deltaY<0?1.08:.92),event.clientX-zeroCanvas.getBoundingClientRect().left,event.clientY-zeroCanvas.getBoundingClientRect().top);},{passive:false});
    zeroCanvas.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('application/x-zeroengine-block')||event.dataTransfer.types.includes('application/x-zeroengine-object'))event.preventDefault();});
    zeroCanvas.addEventListener('drop',event=>{const type=event.dataTransfer.getData('application/x-zeroengine-block');const objectId=event.dataTransfer.getData('application/x-zeroengine-object');if(!type&&!objectId)return;event.preventDefault();const rect=zeroCanvas.getBoundingClientRect();const x=event.clientX-rect.left+zeroCanvas.scrollLeft;const y=event.clientY-rect.top+zeroCanvas.scrollTop;if(type)addZeroBoxBlock(type,x,y);else{const entity=findEntity(objectId);if(!entity)return;const block={id:uid(),type:'Moving',x:Math.max(0,x),y:Math.max(0,y),config:{...ZEROBOX_DEFAULTS,targetObjectId:entity.id,x:0,y:0,z:0}};box.blocks.push(block);selectedBlockId=block.id;selectedBlockIds=new Set([block.id]);renderWorkbench();scheduleSave();toast(`Объект «${entity.name}» добавлен в ZeroBox`, 'success');}});
    $$('[data-node-id]').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('button,input,select'))return;if(e.ctrlKey||e.metaKey||e.shiftKey){if(selectedBlockIds.has(card.dataset.nodeId))selectedBlockIds.delete(card.dataset.nodeId);else selectedBlockIds.add(card.dataset.nodeId);selectedBlockId=card.dataset.nodeId;}else{selectedBlockId=card.dataset.nodeId;selectedBlockIds=new Set([selectedBlockId]);}renderWorkbench();}));
    $$('[data-node-drag]').forEach(handle=>handle.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button'))return;const node=box.blocks.find(b=>b.id===handle.dataset.nodeDrag);if(!node)return;event.preventDefault();handle.setPointerCapture?.(event.pointerId);const startX=event.clientX,startY=event.clientY,originX=node.x||0,originY=node.y||0;const move=e=>{node.x=Math.max(0,originX+e.clientX-startX);node.y=Math.max(0,originY+e.clientY-startY);const card=$(`[data-node-id="${node.id}"]`);if(card){card.style.left=`${node.x}px`;card.style.top=`${node.y}px`;}renderZeroWires(box);};const up=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);scheduleSave();};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);}));
    $$('[data-port-side]').forEach(port=>port.addEventListener('click',event=>{event.stopPropagation();const card=port.closest('[data-node-id]');beginZeroWire(card.dataset.nodeId,port.dataset.portSide,port.dataset.portType,port.dataset.portName);}));
    $$('.zero-wire-hit').forEach(path=>{const remove=event=>{event.preventDefault();event.stopPropagation();selectedConnectionId=path.dataset.connectionId;box.connections=box.connections.filter(c=>c.id!==selectedConnectionId);selectedConnectionId=null;renderWorkbench();scheduleSave();toast('Провод удалён','success');};path.addEventListener('click',remove);path.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')remove(event);});path.addEventListener('contextmenu',remove);});
    $$('[data-node-help]').forEach(button=>button.addEventListener('click',()=>showModal(`<div class="modal-header"><div><span class="panel-kicker">ZEROBOX HELP</span><h2 id="modal-title">${escapeHtml(button.dataset.nodeHelp)}</h2></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body"><p>${escapeHtml(zeroHelpText(button.dataset.nodeHelp))}</p></div><div class="modal-footer"><button class="button button-primary" data-close-modal>Понятно</button></div>`)));
    $$('[data-node-copy]').forEach(button=>button.addEventListener('click',()=>{selectedBlockIds=new Set([button.dataset.nodeCopy]);selectedBlockId=button.dataset.nodeCopy;copyZeroBlocks();}));
    $$('[data-node-delete]').forEach(button=>button.addEventListener('click',()=>deleteZeroBlock(button.dataset.nodeDelete)));
    $$('[data-block-field]').forEach(input=>input.addEventListener('change',()=>{const b=box.blocks.find(item=>item.id===input.closest('[data-node-id]').dataset.nodeId);if(!b)return;let val=input.value;if(input.type==='number')val=Number(val);if(input.type==='checkbox')val=input.checked;const key=input.dataset.blockField;const previous=b.config[key];b.config[key]=val;if (key==='variable'&&['Number','Numericarray','Yesorno','Transparency','Color'].includes(b.type)){const clean=String(val||'Variable').trim().replace(/[^a-zA-Z0-9_А-Яа-я]/g,'_');b.config[key]=clean;box.variables?.forEach(v=>{if(v.name===previous)v.name=clean;});currentProject.variables?.forEach(v=>{if(v.name===previous)v.name=clean;});currentProject.zeroBoxes?.forEach(other=>other.blocks?.forEach(block=>{if(block.config?.variable===previous)block.config.variable=clean;}));}if (key==='value'&&['Number','Numericarray','Yesorno','Transparency','Color'].includes(b.type)){const v=currentProject.variables?.find(x=>x.name===b.config.variable);if(v)v.value=val;}scheduleSave();}));
    $('#zerobox-name').addEventListener('change',e=>{box.name=e.target.value.trim()||'ZeroBox';$('#workbench-title').textContent=`${box.name} — ZeroBox`;renderAssetPanel();scheduleSave();});
    $('#zerobox-target').addEventListener('change',e=>{box.targetObjectId=e.target.value;scheduleSave();});
    $('#add-zero-variable').addEventListener('click',createCustomVariable);
    $('#zero-block-search').addEventListener('input',event=>{const q=event.target.value.trim().toLowerCase();$$('[data-add-block]').forEach(button=>{button.hidden=!button.textContent.toLowerCase().includes(q)&&!button.title.toLowerCase().includes(q);});$$('.node-category').forEach(cat=>{const next=cat.nextElementSibling;const visible=[...next.querySelectorAll('button')].some(b=>!b.hidden);cat.hidden=next.hidden=!visible;});});
    $$('[data-variable-value]').forEach(input=>input.addEventListener('change',()=>{const v=currentProject.variables.find(item=>item.name===input.dataset.variableValue);if(!v)return;v.value=['Number','Numericarray','Transparency'].includes(v.type)?Number(input.value):v.type==='Yesorno'?(input.value==='true'||input.value==='1'):input.value;renderGameUI();scheduleSave();}));
    $$('[data-variable-delete]').forEach(button=>button.addEventListener('click',()=>{const name=button.dataset.variableDelete;currentProject.variables=currentProject.variables.filter(v=>v.name!==name);currentProject.zeroBoxes.forEach(other=>{other.variables=(other.variables||[]).filter(v=>v.name!==name);});renderWorkbench();scheduleSave();}));
    $('#zero-zoom-out').addEventListener('click',()=>setZeroBoxZoom((box.zoom||1)-.1));$('#zero-zoom-in').addEventListener('click',()=>setZeroBoxZoom((box.zoom||1)+.1));$('#zero-zoom-reset').addEventListener('click',()=>setZeroBoxZoom(1));
    $('#zerobox-select-network').addEventListener('click',selectZeroBlockNetwork);$('#zerobox-delete-selection').addEventListener('click',deleteSelectedZeroBlocks);
    $('#export-zerobox').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify({name:box.name,blocks:box.blocks,connections:box.connections||[],variables:box.variables||[]},null,2)],{type:'application/json'}),`${safeName(box.name)}.zbox`));
    $('#zerobox-copy-selection').addEventListener('click',copyZeroBlocks);
    $('#zerobox-paste-selection').addEventListener('click',pasteZeroBlocks);
    $('#zerobox-help').addEventListener('click',renderZeroBoxHelp);
    renderZeroWires(box);
  } else {
    body.innerHTML = `<div class="ui-designer-grid"><aside class="ui-palette"><div class="workbench-section-title">ЭЛЕМЕНТЫ UI</div>${[['Button','▣ Кнопка'],['Text','T Текст'],['Scale','▰ Шкала'],['Slider','◉ Ползунок'],['Background','▧ Фон'],['CameraControlArea','◎ Управление камерой (мышь / касание)'],['Joystick','◉ Джойстик']].map(([type,label])=>`<button data-add-ui="${type}">${label}</button>`).join('')}<div class="workbench-toolbar-tip">CameraControlArea считывает движение мыши на ПК и касание/свайп на телефоне как движение мыши для обзора камеры. Размер, расположение и чувствительность задаются справа.</div></aside><div class="ui-stage-wrap"><div class="ui-design-stage" id="ui-design-stage"></div></div><aside class="ui-property-panel" id="ui-property-panel"></aside></div>`;
    const stage=$('#ui-design-stage'); renderUIStage(stage,true);
    $$('[data-add-ui]').forEach(b=>b.addEventListener('click',()=>addUIElement(b.dataset.addUi)));
    renderUIProperties();
  }
}

function createCustomVariable() {
  const box=currentProject.zeroBoxes.find(item=>item.id===selectedZeroBoxId);if(!box)return;
  showModal(`<div class="modal-header"><div><span class="panel-kicker">ZEROBOX VARIABLE</span><h2 id="modal-title">Новая переменная</h2></div><button class="modal-close" data-close-modal>×</button></div><form id="variable-form"><div class="modal-body"><label class="field-label">Название<input class="field-input" id="variable-name" required value="Variable_${(box.variables||[]).length+1}" /></label><label class="field-label">Тип<select class="field-select" id="variable-type"><option>Number</option><option>Numericarray</option><option>Yesorno</option><option>Transparency</option><option>Color</option></select></label><label class="field-label">Начальное значение<input class="field-input" id="variable-value" value="0" /></label></div><div class="modal-footer"><button type="button" class="button button-quiet" data-close-modal>Отмена</button><button class="button button-primary">Создать</button></div></form>`);
  $('#variable-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#variable-name').value.trim();const type=$('#variable-type').value;if(!name)return;if(currentProject.variables.some(v=>v.name===name)){toast('Переменная с таким именем уже существует','error');return;}let value=$('#variable-value').value;if(type==='Number'||type==='Numericarray'||type==='Transparency')value=Number(value)||0;else if(type==='Yesorno')value=value==='true'||value==='1';box.variables||=[];box.variables.push({id:uid(),name,type,value});currentProject.variables||=[];currentProject.variables.push({id:uid(),name,type,value});closeModal();renderWorkbench();scheduleSave();});
}
function defaultUIElement(type) {
  const base={id:uid(),type,x:10,y:15,w:24,h:9,text:type==='Button'?'Button':type==='Text'?'Text':'',value:60,max:100,color:type==='Background'?'#222222':'#2b2b2b',opacity:1,sticky:false,key:'',zeroBoxId:'',variableName:'',variableX:'',variableY:'',sensitivity:.0025};
  if(type==='Scale')Object.assign(base,{x:8,y:82,w:28,h:6});
  if(type==='Slider')Object.assign(base,{x:62,y:82,w:28,h:7});
  if(type==='Background')Object.assign(base,{x:25,y:25,w:50,h:50});
  if(type==='CameraControlArea')Object.assign(base,{x:50,y:12,w:48,h:82,text:'КАМЕРА',sensitivity:.0025,color:'#ffffff',mouseAndTouch:true});
  if(type==='Joystick')Object.assign(base,{x:6,y:65,w:22,h:30,text:'',variableX:'JoystickX',variableY:'JoystickY'});
  return base;
}
function addUIElement(type) {
  const el=defaultUIElement(type);currentProject.uiElements||=[];currentProject.uiElements.push(el);
  if(type==='Joystick'){currentProject.variables||=[];for(const name of [el.variableX,el.variableY])if(!currentProject.variables.some(v=>v.name===name))currentProject.variables.push({id:uid(),name,type:'Numericarray',value:0});}
  selectedUIElementId=el.id;renderWorkbench();scheduleSave();
}
function renderUIStage(host, design=false) {
  if(!host)return;host.innerHTML='';
  (currentProject.uiElements||[]).forEach(el=>{
    const node=document.createElement('div');node.className=`ui-element ${el.type==='Text'?'text-element':''} ${el.type==='Background'?'background-element':''} ${design&&selectedUIElementId===el.id?'selected':''}`;
    node.dataset.uiId=el.id;node.style.left=`${el.x}%`;node.style.top=`${el.y}%`;node.style.width=`${el.w}%`;node.style.height=`${el.h}%`;node.style.zIndex=el.type==='Background'?'0':'2';node.style.opacity=String(el.opacity??1);
    if(el.type==='Button'){const b=document.createElement('button');b.type='button';b.textContent=el.text||'Button';if(el.color)b.style.background=el.color;if(el.sticky&&el.pressed)b.classList.add('sticky-on');node.appendChild(b);}
    else if(el.type==='Text'){const v=(currentProject.variables||[]).find(x=>x.name===el.variableName);node.textContent=String(el.text||'Text').replaceAll('{value}',String(v?.value??''));node.style.fontSize=`${el.fontSize||22}px`;node.style.color=el.color||'#ffffff';}
    else if(el.type==='Scale'){const v=(currentProject.variables||[]).find(x=>x.name===el.variableName);const current=v?Number(v.value):Number(el.value)||0;const track=document.createElement('div');track.className='ui-scale-track';const fill=document.createElement('div');fill.className='ui-scale-fill';fill.style.width=`${Math.max(0,Math.min(100,current/(Number(el.max)||100)*100))}%`;fill.style.background=el.color||'#a5ef4c';track.appendChild(fill);node.appendChild(track);}
    else if(el.type==='Slider'){const input=document.createElement('input');input.type='range';input.min='0';input.max=String(el.max||100);input.style.accentColor=el.color||'#a5ef4c';const v=(currentProject.variables||[]).find(x=>x.name===el.variableName);input.value=String(v? v.value : el.value||0);if(!design)input.addEventListener('input',()=>{el.value=Number(input.value);if(v)v.value=el.value;scheduleSave();});node.appendChild(input);}
    else if(el.type==='Background'){node.style.background=el.color||'#222222';node.style.borderRadius='5px';}
    else if(el.type==='CameraControlArea'){node.classList.add('camera-control-area');node.textContent=design?'◎ МЫШЬ / СЕНСОРНЫЙ ОБЗОР КАМЕРЫ':'';node.style.background=design?'#ffffff12':'transparent';node.style.border=design?'1px dashed #888':'0';}
    else if(el.type==='Joystick'){node.classList.add('joystick-element');node.innerHTML='<span class="joystick-base"><i class="joystick-knob"></i></span>';node.style.background='transparent';}
    if(design){node.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();selectedUIElementId=el.id;const rect=host.getBoundingClientRect(),startX=event.clientX,startY=event.clientY,origX=el.x,origY=el.y;node.setPointerCapture?.(event.pointerId);const move=e=>{el.x=Math.max(0,Math.min(100-el.w,origX+(e.clientX-startX)/rect.width*100));el.y=Math.max(0,Math.min(100-el.h,origY+(e.clientY-startY)/rect.height*100));node.style.left=`${el.x}%`;node.style.top=`${el.y}%`;};const up=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',up);node.removeEventListener('pointercancel',up);renderWorkbench();scheduleSave();};node.addEventListener('pointermove',move);node.addEventListener('pointerup',up);node.addEventListener('pointercancel',up);renderUIProperties();});}
    else if(el.type==='Button'){
      const button=node.querySelector('button');
      button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture?.(event.pointerId);el.isDown=true;el.pressed=true;if(!el.sticky)button.classList.add('sticky-on');dispatchZeroBoxEvent('Buttonpressed',el.id);});
      const releaseButton=()=>{if(!el.isDown)return;el.isDown=false;if(!el.sticky){el.pressed=false;button.classList.remove('sticky-on');dispatchZeroBoxEvent('ButtonResting',el.id);}};button.addEventListener('pointerup',releaseButton);button.addEventListener('pointercancel',releaseButton);button.addEventListener('lostpointercapture',releaseButton);
      button.addEventListener('click',()=>{if(el.sticky){el.pressed=!el.pressed;button.classList.toggle('sticky-on',el.pressed);}dispatchZeroBoxEvent('Buttonclicked',el.id);});
    } else if(!design && el.type==='CameraControlArea') {
      node.style.touchAction='none';
      node.addEventListener('pointerdown',event=>{event.preventDefault();node.setPointerCapture?.(event.pointerId);node.dataset.lookPointer=String(event.pointerId);node.dataset.lookX=String(event.clientX);node.dataset.lookY=String(event.clientY);});
      node.addEventListener('pointermove',event=>{if(node.dataset.lookPointer!==String(event.pointerId))return;const dx=event.clientX-Number(node.dataset.lookX),dy=event.clientY-Number(node.dataset.lookY);node.dataset.lookX=String(event.clientX);node.dataset.lookY=String(event.clientY);applyPreviewLook(dx,dy,Number(el.sensitivity)||previewLook.sensitivity);});
      const stopLook=event=>{if(node.dataset.lookPointer===String(event.pointerId))delete node.dataset.lookPointer;};node.addEventListener('pointerup',stopLook);node.addEventListener('pointercancel',stopLook);
    } else if(!design && el.type==='Joystick') {
      const base=node.querySelector('.joystick-base'),knob=node.querySelector('.joystick-knob');node.style.touchAction='none';let activePointer=null;
      const updateJoy=event=>{const rect=base.getBoundingClientRect(),radius=Math.min(rect.width,rect.height)*.34,cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;let dx=(event.clientX-cx)/radius,dy=(event.clientY-cy)/radius;const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}joystickState={x:dx,y:-dy,active:true,uiElementId:el.id};knob.style.transform=`translate(${dx*radius}px,${dy*radius}px)`;const vx=(currentProject.variables||[]).find(v=>v.name===el.variableX),vy=(currentProject.variables||[]).find(v=>v.name===el.variableY);if(vx)vx.value=Number(dx.toFixed(3));if(vy)vy.value=Number((-dy).toFixed(3));};
      node.addEventListener('pointerdown',event=>{event.preventDefault();activePointer=event.pointerId;node.setPointerCapture?.(activePointer);updateJoy(event);});node.addEventListener('pointermove',event=>{if(event.pointerId===activePointer)updateJoy(event);});const stopJoy=event=>{if(event.pointerId!==activePointer)return;activePointer=null;joystickState={x:0,y:0,active:false,uiElementId:el.id};knob.style.transform='translate(0,0)';const vx=(currentProject.variables||[]).find(v=>v.name===el.variableX),vy=(currentProject.variables||[]).find(v=>v.name===el.variableY);if(vx)vx.value=0;if(vy)vy.value=0;};node.addEventListener('pointerup',stopJoy);node.addEventListener('pointercancel',stopJoy);
    }
    host.appendChild(node);
  });
}
function renderUIProperties() {
  const panel=$('#ui-property-panel');if(!panel)return;
  const el=currentProject.uiElements.find(item=>item.id===selectedUIElementId);
  if(!el){panel.innerHTML='<div class="workbench-section-title">СВОЙСТВА</div><div class="modal-note">Выбери элемент на макете или добавь новый.</div>';return;}
  const field=(key,label,type='number',value=el[key])=>`<label class="field-label">${label}<input class="field-input" data-ui-field="${key}" type="${type}" value="${escapeAttr(value??'')}" /></label>`;
  panel.innerHTML=`<div class="workbench-section-title">СВОЙСТВА ЭЛЕМЕНТА</div><b>${el.type}</b><div class="ui-property-grid">${field('x','X, %')}${field('y','Y, %')}${field('w','Ширина, %')}${field('h','Высота, %')}</div>${field('text','Текст','text')}${field('color','Цвет','color')}${el.type==='Text'?field('fontSize','Размер текста'):''}${['Scale','Slider'].includes(el.type)?field('value','Значение'):''}${['Scale','Slider'].includes(el.type)?field('max','Максимум'):''}${['Text','Scale','Slider'].includes(el.type)?`<label class="field-label">Связать с переменной<select class="field-select" id="ui-variable"><option value="">Без связи</option>${(currentProject.variables||[]).map(v=>`<option value="${escapeAttr(v.name)}" ${el.variableName===v.name?'selected':''}>${escapeHtml(v.name)}</option>`).join('')}</select></label>`:''}${el.type==='Text'?'<div class="modal-note">В тексте используй {value}, чтобы вывести текущее значение связанной переменной.</div>':''}${el.type==='CameraControlArea'?field('sensitivity','Чувствительность камеры'):''}${el.type==='Joystick'?`<label class="field-label">Переменная X<select class="field-select" id="joystick-var-x"><option value="">Не связана</option>${(currentProject.variables||[]).map(v=>`<option value="${escapeAttr(v.name)}" ${el.variableX===v.name?'selected':''}>${escapeHtml(v.name)} (${v.type})</option>`).join('')}</select></label><label class="field-label">Переменная Y<select class="field-select" id="joystick-var-y"><option value="">Не связана</option>${(currentProject.variables||[]).map(v=>`<option value="${escapeAttr(v.name)}" ${el.variableY===v.name?'selected':''}>${escapeHtml(v.name)} (${v.type})</option>`).join('')}</select></label><div class="modal-note">Джойстик непрерывно записывает направление в две Numericarray-переменные и запускает JoystickMoved. Подключи X/Y к Moving.</div>`:''}${el.type==='Button'?`<label class="check-line"><input type="checkbox" id="ui-sticky" ${el.sticky?'checked':''}/> Залипающая кнопка</label><label class="field-label">Назначить клавишу <span>${escapeHtml(el.keyLabel||el.key||'не назначена')}</span><button class="button button-quiet" id="ui-assign-key">Нажми клавишу на клавиатуре</button></label><label class="field-label">Запуск ZeroBox<select class="field-select" id="ui-zerobox"><option value="">Нет</option>${currentProject.zeroBoxes.map(b=>`<option value="${b.id}" ${el.zeroBoxId===b.id?'selected':''}>${escapeHtml(b.name)}</option>`).join('')}</select></label>`:''}<button class="button button-danger" id="ui-delete-element">Удалить элемент</button><div class="modal-note">Координаты задаются в процентах от кадра камеры 16:9.</div>`;
  $$('[data-ui-field]').forEach(input=>input.addEventListener('change',()=>{el[input.dataset.uiField]=input.type==='number'?Number(input.value):input.value;renderWorkbench();scheduleSave();}));
  $('#ui-variable')?.addEventListener('change',e=>{el.variableName=e.target.value||'';renderWorkbench();scheduleSave();});
  $('#joystick-var-x')?.addEventListener('change',e=>{el.variableX=e.target.value;scheduleSave();});
  $('#joystick-var-y')?.addEventListener('change',e=>{el.variableY=e.target.value;scheduleSave();});
  $('#ui-sticky')?.addEventListener('change',e=>{el.sticky=e.target.checked;scheduleSave();});
  $('#ui-assign-key')?.addEventListener('click',()=>{uiKeyCaptureId=el.id;toast('Нажми нужную клавишу на клавиатуре', 'success');});
  $('#ui-zerobox')?.addEventListener('change',e=>{el.zeroBoxId=e.target.value;scheduleSave();});
  $('#ui-delete-element')?.addEventListener('click',()=>{currentProject.uiElements=currentProject.uiElements.filter(item=>item.id!==el.id);selectedUIElementId=null;renderWorkbench();scheduleSave();});
}
function renderGameUI() { const layer=$('#game-ui-layer');if(layer)renderUIStage(layer,false); }
function triggerUIKey(event) {
  const key=event.key.toLowerCase();
  for(const el of currentProject?.uiElements||[]){
    if(el.type==='Button'&&el.key&&el.key.toLowerCase()===key&&!el.isDown){
      el.isDown=true;el.pressed=true;dispatchZeroBoxEvent('Buttonpressed',el.id);
    }
  }
  if(isPlaying)renderGameUI();
}
function tickJoystickBoxes(delta) {
  if(!isPlaying||!joystickState.active||!currentProject)return;
  for(const box of currentProject.zeroBoxes||[]) if(box.blocks?.some(block=>block.type==='JoystickMoved'&&(!block.config?.buttonId||block.config.buttonId===joystickState.uiElementId))) runZeroBox(box,'JoystickMoved',joystickState.uiElementId,delta);
}
function tickHeldButtons(delta) {
  if(!isPlaying)return;heldButtonTick+=delta;if(heldButtonTick<.05)return;heldButtonTick=0;
  for(const el of currentProject?.uiElements||[]) if(el.type==='Button'&&el.isDown) dispatchZeroBoxEvent('Buttonpressed',el.id);
  for(const key of heldKeys){const mapped=(currentProject?.uiElements||[]).some(el=>el.type==='Button'&&el.key?.toLowerCase()===key&&el.isDown);if(mapped)continue;for(const box of currentProject?.zeroBoxes||[])if(box.blocks?.some(b=>b.type==='Buttonpressed'&&b.config?.key?.toLowerCase()===key&&!b.config.buttonId))runZeroBox(box,'Buttonpressed','');}
}
function triggerZeroBoxKeyUp(event) {
  const key=event.key.toLowerCase();heldKeys.delete(key);
  for(const el of currentProject?.uiElements||[]){
    if(el.type==='Button'&&el.key&&el.key.toLowerCase()===key){
      el.isDown=false;
      if(!el.sticky) {
        el.pressed=false;
        dispatchZeroBoxEvent('ButtonResting',el.id);
      }
      dispatchZeroBoxEvent('Buttonclicked',el.id);
    }
  }
  const keyedButtons=(currentProject?.uiElements||[]).filter(el=>el.type==='Button'&&el.key?.toLowerCase()===key);
  for(const box of currentProject?.zeroBoxes||[]){
    const events=box.blocks.filter(b=>['ButtonResting','Buttonclicked'].includes(b.type)&&b.config?.key?.toLowerCase()===key);
    for(const ev of events){const duplicate=keyedButtons.some(el=>!ev.config.buttonId||el.id===ev.config.buttonId);if(!duplicate)runZeroBox(box,ev.type,ev.config.buttonId||'');}
  }
  if(isPlaying)renderGameUI();
}
function dispatchZeroBoxEvent(eventName, uiElementId) {
  const el=currentProject.uiElements.find(item=>item.id===uiElementId);
  for(const box of currentProject.zeroBoxes||[]) {
    const has=box.blocks.some(b=>b.type===eventName && (!b.config?.buttonId||b.config.buttonId===uiElementId));
    if(has)runZeroBox(box,eventName,uiElementId);
  }
  if(el?.zeroBoxId && eventName==='Buttonclicked'){const box=currentProject.zeroBoxes.find(b=>b.id===el.zeroBoxId);const hasButtonEvents=box?.blocks.some(b=>['Buttonclicked','Buttonpressed','ButtonResting'].includes(b.type));if(box&&!hasButtonEvents)runZeroBox(box,'manual');}
}
function triggerZeroBoxKey(event) {
  if(!currentProject)return;
  heldKeys.add(event.key.toLowerCase());
  if(event.repeat)return;
  triggerUIKey(event);
  const key=event.key.toLowerCase();
  const keyedButtons=(currentProject.uiElements||[]).filter(el=>el.type==='Button'&&el.key?.toLowerCase()===key);
  for(const box of currentProject.zeroBoxes||[]){
    const matches=box.blocks.filter(b=>b.type==='Buttonpressed'&&b.config?.key&&b.config.key.toLowerCase()===key);
    for(const ev of matches){const duplicate=keyedButtons.some(el=>!ev.config.buttonId||el.id===ev.config.buttonId);if(!duplicate)runZeroBox(box,'Buttonpressed',ev.config.buttonId||'');}
  }
}
function targetEntityForBlock(block, box=null) {
  const id=block.config?.targetObjectId || box?.targetObjectId;
  return activeSceneData().objects.find(e=>e.id===id) || (selectedId?findEntity(selectedId):null) || activeSceneData().objects[0];
}
function setEntityTransparency(entity,value) {
  const obj=sceneObjects.get(entity.id);const opacity=Math.max(0,Math.min(1,Number(value)||0));
  obj?.traverse(child=>{if(child.isMesh&&child.material){for(const mat of (Array.isArray(child.material)?child.material:[child.material])){mat.transparent=opacity<1;mat.opacity=opacity;mat.needsUpdate=true;}}});entity.material ||= {};entity.material.opacity=opacity;
}
function runZeroBox(box,eventName='manual',uiElementId='',frameDelta=0) {
  if(!box)return 0;
  const blocks=box.blocks||[], connections=box.connections||[];
  const eventTypes=['Straightaway','Buttonclicked','Buttonpressed','ButtonResting','JoystickMoved'];
  const isGraph=connections.length>0;
  const vars=currentProject.variables||[];const getVar=name=>vars.find(v=>v.name===name);
  let movementSpeed=1,executed=0;
  const byId=new Map(blocks.map((b,i)=>[b.id,{b,i}]));
  const outgoing=(id,port='execOut')=>connections.find(c=>c.from?.nodeId===id&&(c.from?.port||'execOut')===port)?.to?.nodeId||null;
  let current=null;
  if(eventName!=='manual'){
    const eventNode=blocks.find(b=>b.type===eventName&&(!b.config?.buttonId||b.config.buttonId===uiElementId));if(!eventNode)return 0;
    current=isGraph?outgoing(eventNode.id,'execOut'):(blocks[byId.get(eventNode.id).i+1]?.id||null);
  } else if(isGraph) {
    const incoming=new Set(connections.filter(c=>(c.type||'exec')==='exec').map(c=>c.to?.nodeId));
    current=blocks.find(b=>!incoming.has(b.id)&&!eventTypes.includes(b.type))?.id||blocks[0]?.id||null;
  } else current=blocks[0]?.id||null;
  const visited=new Map();
  while(current&&byId.has(current)&&executed<250){
    const {b,i}=byId.get(current),c=b.config||{},entity=targetEntityForBlock(b,box),obj=entity&&sceneObjects.get(entity.id);
    const visits=(visited.get(current)||0)+1;visited.set(current,visits);if(visits>Math.max(1,Math.min(30,Number(c.repeat)||1)))break;
    executed++;
    if(b.type==='Close')break;
    if(eventTypes.includes(b.type)){if(eventName==='manual'){current=isGraph?outgoing(b.id,'execOut'):(blocks[i+1]?.id||null);continue;}break;}
    if(b.type==='Writes'){const ui=(currentProject.uiElements||[]).find(el=>el.id===c.targetUIId);if(ui&&ui.type==='Text'){ui.text=String(c.text||'');renderGameUI();}else toast(String(c.text||'ZeroBox'),'success');}

    else if(['ChangeColor','ChangeTransparency'].includes(b.type)&&c.targetUIId){const ui=(currentProject.uiElements||[]).find(el=>el.id===c.targetUIId);if(ui){if(b.type==='ChangeColor')ui.color=c.color||'#ffffff';else ui.opacity=Math.max(0,Math.min(1,Number(c.value)||0));renderGameUI();}}
    else if(b.type==='Physics'&&c.targetObjectId==='__all__'){for(const item of activeSceneData().objects)item.physics={enabled:c.enabled===true||c.enabled==='true'};}
    else if(b.type==='Speed')movementSpeed=Math.max(0,Number(c.amount??c.speed)||0);
    else if(b.type==='Gamespeed')runtimeGameSpeed=Math.max(0,Math.min(5,Number(c.amount??c.speed)||0));
    else if(['Change','Number','Numericarray','Yesorno','Transparency','Color'].includes(b.type)){let v=getVar(c.variable||'Value');if(v){v.value=c.value??c.amount;}}
    else if(['Plus','Minus','Multiply','Divide'].includes(b.type)){let v=getVar(c.variable||'Value');if(v){const n=Number(v.value)||0,a=Number(c.amount)||0;v.value=b.type==='Plus'?n+a:b.type==='Minus'?n-a:b.type==='Multiply'?n*a:(a===0?n:n/a);}}
    else if(b.type==='Loop'){
      // Loop repeats the next connected action, bounded to protect the browser from infinite execution.
      const nextId=isGraph?outgoing(b.id,'execOut'):(blocks[i+1]?.id||null),next=byId.get(nextId)?.b;
      if(next)for(let n=1;n<Math.min(20,Math.max(1,Number(c.repeat)||1));n++)executeZeroBoxAction(next);
    }
    else if(['ForkYesorno','Branching'].includes(b.type)){
      const v=getVar(c.variable||'Value');const pass=String(v?.value??c.value)==='true'||Number(v?.value??c.value)>0;
      current=isGraph?outgoing(b.id,pass?'yes':'no'):(blocks[i+(pass?1:2)]?.id||null);continue;
    }
    else if(b.type==='Moving'&&entity&&obj)executeZeroBoxAction({...b,config:{...c,speedMultiplier:movementSpeed*(eventName==='JoystickMoved'?Math.max(0,frameDelta)*60*runtimeGameSpeed:1)}},entity,obj);
    else if(entity&&obj)executeZeroBoxAction(b,entity,obj);
    current=isGraph?outgoing(b.id,'execOut'):(blocks[i+1]?.id||null);
  }
  if(isPlaying)renderGameUI();
  else renderInspector();
  scheduleSave();
  return executed;
}

function executeZeroBoxAction(block,entity=null,obj=null) {
  const c=block.config||{};entity ||= targetEntityForBlock(block);obj ||= entity&&sceneObjects.get(entity.id);if(!entity||!obj)return;
  const sideVector={Forward:[0,0,-1],Backward:[0,0,1],Left:[-1,0,0],Right:[1,0,0],Up:[0,1,0],Down:[0,-1,0]}[c.direction||c.side]||[0,0,-1];
  const amount=Number.isFinite(Number(c.amount??c.speed))?Number(c.amount??c.speed):1;
  if(block.type==='Moving'){
    const vars=currentProject.variables||[],read=(key,varKey)=>{const v=vars.find(item=>item.name===c[varKey]);return c[varKey]&&v?Number(v.value)||0:Number(c[key])||0;};
    let v=[read('x','xVariable'),read('y','yVariable'),read('z','zVariable')];
    if(c.movementMode==='direction'){const localDirection=new THREE.Vector3(...sideVector).applyQuaternion(obj.quaternion).normalize();v=localDirection.toArray().map(n=>n*amount);}
    else if(c.movementMode==='position')v=v.map((n,i)=>n-(entity.position?.[i]||0));
    const multiplier=Number.isFinite(Number(c.speedMultiplier))?Number(c.speedMultiplier):1;v=v.map(n=>n*multiplier);
    if(c.movementMode==='force'){entity.physics ||= {enabled:true,useGravity:true,mass:1,velocity:[0,0,0],linearDamping:.05};entity.physics.enabled=true;const mass=Math.max(.01,Number(entity.physics.mass)||1);entity.physics.velocity ||= [0,0,0];entity.physics.velocity=v.map((n,i)=>(entity.physics.velocity[i]||0)+n/mass);}else moveEntityWithCollisions(entity,v);
  }
  else if(block.type==='Twist'){entity.rotation[1]=(entity.rotation[1]||0)+amount;obj.rotation.y=THREE.MathUtils.degToRad(entity.rotation[1]);}
  else if(block.type==='Size'){entity.scale=[Number(c.x??amount)||1,Number(c.y??amount)||1,Number(c.z??amount)||1];obj.scale.fromArray(entity.scale);}
  else if(block.type==='Squat'){entity.collision ||= {enabled:false,shape:'capsule',size:[.6,1.8,.6],offset:[0,.9,0]};entity.collision.standingSize ||= [...(entity.collision.size||[.6,1.8,.6])];entity.collision.size[1]=entity.collision.standingSize[1]*.5;entity.collision.offset[1]=entity.collision.standingSize[1]*.25;updateCollisionHelper(entity);}
  else if(block.type==='Jumpup'){entity.physics ||= {enabled:true,useGravity:true,mass:1,velocity:[0,0,0],linearDamping:.05};entity.physics.enabled=true;entity.physics.velocity ||= [0,0,0];entity.physics.velocity[1]=Math.sqrt(Math.max(0,2*9.81*Math.max(.01,amount)));}
  else if(block.type==='ChangeColor'){entity.material ||= {};entity.material.color=c.color||'#ffffff';entity.material.overrideColor=true;obj.traverse(ch=>{if(ch.isMesh&&ch.material){for(const m of(Array.isArray(ch.material)?ch.material:[ch.material]))m.color?.set(entity.material.color);}});}
  else if(block.type==='ChangeTransparency')setEntityTransparency(entity,c.value??.5);
  else if(block.type==='Collision'){entity.collision ||= {shape:'box',size:[1,1,1],offset:[0,0,0],isTrigger:false};entity.collision.enabled=c.enabled===true||c.enabled==='true';updateCollisionHelper(entity);}
  else if(block.type==='Physics'){entity.physics={...(entity.physics||{}),enabled:c.enabled===true||c.enabled==='true',useGravity:entity.physics?.useGravity!==false,mass:entity.physics?.mass||1,velocity:entity.physics?.velocity||[0,0,0],linearDamping:entity.physics?.linearDamping??.05};}
  else if(block.type==='Life'){entity.life=c.enabled===true||c.enabled==='true';}
  else if(block.type==='ChangeTexture'&&c.assetId){entity.material ||= {};entity.material.textureAssetId=c.assetId;applyTextureToSelectionFor(entity,c.assetId);}
  else if(block.type==='ChangeModel'&&c.assetId){entity.assetId=c.assetId;entity.type='model';createRuntimeObject(entity);}
  else if(block.type==='Changinganimation'){playImportedAnimation(entity,c.animation);}
  else if(block.type==='Changesound'){entity.soundAssetId=c.assetId||null;}
  else if(block.type==='Playsound'&&c.assetId){playAssetSound(c.assetId);}
  else if(block.type==="Don'tSound"){stopAssetSound(false);}
  else if(block.type==='Pausesound'){stopAssetSound(true);}
  else if(block.type==='Laser'){
    const offset=new THREE.Vector3(Number(c.x)||0,Number(c.y)||0,Number(c.z)||0).applyQuaternion(obj.quaternion);const origin=obj.getWorldPosition(new THREE.Vector3()).add(offset);const direction=new THREE.Vector3(...sideVector).applyQuaternion(obj.quaternion).normalize();const targets=[...sceneObjects.values()].filter(o=>o!==obj);const distance=Math.max(.1,Number(c.distance)||25),radius=Math.max(0,Number(c.radius)||0);let hit=false;const right=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize();const up=new THREE.Vector3().crossVectors(right,direction).normalize();const offsets=[[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]];for(const [rx,uy] of offsets){const start=origin.clone().addScaledVector(right,rx).addScaledVector(up,uy);const ray=new THREE.Raycaster(start,direction,0,distance);if(ray.intersectObjects(targets,true).length){hit=true;break;}}const condition=c.stopCondition||'Hit';const result=condition==='NoHit'?!hit:hit;const v=(currentProject.variables||[]).find(x=>x.name===(c.variable||'LaserHit'));if(v)v.value=result;
  }
}
function applyTextureToSelectionFor(entity,assetId){const obj=sceneObjects.get(entity.id);if(!obj)return;obj.traverse(ch=>{if(ch.isMesh&&ch.material){const apply=m=>{const cp=m.clone();applyTextureToMaterial(cp,assetId,entity.material?.tileX||1,entity.material?.tileY||1);return cp;};if(ch.userData.zeroEngineSourceMaterial)ch.userData.zeroEngineSourceMaterial=Array.isArray(ch.userData.zeroEngineSourceMaterial)?ch.userData.zeroEngineSourceMaterial.map(apply):apply(ch.userData.zeroEngineSourceMaterial);ch.material=Array.isArray(ch.material)?ch.material.map(apply):apply(ch.material);}});}
let activeAudio=null;
function playAssetSound(assetId){const asset=currentProject.assets.find(a=>a.id===assetId&&a.type==='audio');if(!asset)return;stopAssetSound();activeAudio=new Audio(getAssetUrl(asset));activeAudio.play().catch(()=>toast('Браузер запретил воспроизведение звука до нажатия пользователя','error'));}
function stopAssetSound(pause=false){if(!activeAudio)return;if(pause)activeAudio.pause();else{activeAudio.pause();activeAudio.currentTime=0;}}
function countSkinnedBones(object){let count=0;object?.traverse(child=>{if(child.isSkinnedMesh&&child.skeleton)count=Math.max(count,child.skeleton.bones.length);});return count;}
function playImportedAnimation(entity,name=null){const obj=sceneObjects.get(entity.id),clips=obj?.userData.animationClips||[];if(!obj||!clips.length){toast('В этой модели нет импортированных анимаций','error');return;}const clip=clips.find(c=>c.name===(name||$('#model-animation-select')?.value))||clips[0];let mixer=animationMixers.get(entity.id);if(!mixer){mixer=new THREE.AnimationMixer(obj);animationMixers.set(entity.id,mixer);}mixer.stopAllAction();mixer.clipAction(clip).reset().play();entity.animationClipName=clip.name;entity.animationPlaying=true;scheduleSave();toast(`Анимация «${clip.name}» запущена`,'success');}
function stopImportedAnimation(entity){const mixer=animationMixers.get(entity.id);mixer?.stopAllAction();entity.animationPlaying=false;scheduleSave();}
function recordTransformKey(entity){
  showModal(`<div class="modal-header"><div><span class="panel-kicker">ANIMATION TIMELINE</span><h2 id="modal-title">Записать ключ</h2></div><button class="modal-close" data-close-modal>×</button></div><form id="keyframe-form"><div class="modal-body"><label class="field-label">Название анимации<input class="field-input" id="keyframe-name" value="${escapeAttr(entity.animations?.[0]?.name||'Animation_01')}" /></label><label class="field-label">Время ключа, секунды<input class="field-input" id="keyframe-time" type="number" min="0" step=".1" value="0" /></label><div class="modal-note">Будут записаны текущие позиция, вращение и масштаб объекта. Ключи можно добавлять в разных временных точках.</div></div><div class="modal-footer"><button type="button" class="button button-quiet" data-close-modal>Отмена</button><button class="button button-primary">Записать ключ</button></div></form>`);
  $('#keyframe-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#keyframe-name').value.trim()||'Animation';const time=Math.max(0,Number($('#keyframe-time').value)||0);const obj=sceneObjects.get(entity.id);let anim=(entity.animations||[]).find(a=>a.name===name);if(!anim){entity.animations||=[];anim={id:uid(),name,keys:[]};entity.animations.push(anim);}anim.keys.push({time,position:obj.position.toArray(),rotation:[obj.rotation.x,obj.rotation.y,obj.rotation.z],scale:obj.scale.toArray()});anim.keys.sort((a,b)=>a.time-b.time);closeModal();renderInspector();scheduleSave();toast('Ключ анимации записан','success');});
}
function playCustomAnimation(entity,animation){if(!animation?.keys?.length)return;activeCustomAnimations.set(entity.id,{animationId:animation.id,time:0});}
function updateCustomAnimations(delta){if(!activeCustomAnimations.size)return;for(const[id,state]of activeCustomAnimations){const entity=findEntity(id),obj=sceneObjects.get(id),anim=entity?.animations?.find(a=>a.id===state.animationId);if(!entity||!obj||!anim?.keys?.length){activeCustomAnimations.delete(id);continue;}const duration=Math.max(.1,anim.keys.at(-1).time);state.time=(state.time+delta)%duration;let a=anim.keys[0],b=anim.keys.at(-1);for(let i=0;i<anim.keys.length-1;i++){if(state.time>=anim.keys[i].time&&state.time<=anim.keys[i+1].time){a=anim.keys[i];b=anim.keys[i+1];break;}}const span=Math.max(.0001,b.time-a.time),t=THREE.MathUtils.clamp((state.time-a.time)/span,0,1);obj.position.fromArray(a.position.map((v,i)=>THREE.MathUtils.lerp(v,b.position[i],t)));obj.scale.fromArray(a.scale.map((v,i)=>THREE.MathUtils.lerp(v,b.scale[i],t)));obj.rotation.set(...a.rotation.map((v,i)=>THREE.MathUtils.lerp(v,b.rotation[i],t)));entity.position=obj.position.toArray();entity.rotation=[obj.rotation.x,obj.rotation.y,obj.rotation.z].map(v=>THREE.MathUtils.radToDeg(v));entity.scale=obj.scale.toArray();}}
function createBasicSkeleton(entity){const object=sceneObjects.get(entity.id);if(!object)return;if(entity.rig?.bones?.length){toast('Скелет уже создан','success');return;}entity.rig={bones:[{name:'Root',parent:null,position:[0,0,0]},{name:'Spine',parent:'Root',position:[0,.7,0]},{name:'Head',parent:'Spine',position:[0,.6,0]},{name:'LeftArm',parent:'Spine',position:[-.45,.35,0]},{name:'RightArm',parent:'Spine',position:[.45,.35,0]}]};attachStoredRig(entity,object);scheduleSave();renderInspector();toast('Создана базовая иерархия костей. Skin weights пока не редактируются.','success');}

function focusSelectedObject() {
  const object = sceneObjects.get(selectedId); if (!object) { toast('Сначала выбери объект', 'error'); return; }
  const box = new THREE.Box3().setFromObject(object); const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()).length();
  orbit.target.copy(center); const direction = editorCamera.position.clone().sub(center).normalize(); editorCamera.position.copy(center).add(direction.multiplyScalar(Math.max(3, size * 1.7))); orbit.update();
}

// ---------- Startup ----------
async function boot() {
  let savedTheme = 'dark'; try { savedTheme = localStorage.getItem('zeroengine-theme') || 'dark'; } catch {}
  applyTheme(savedTheme);
  bindUI();
  try { db = await openDatabase(); await renderProjectList(); }
  catch (error) { console.error(error); toast('Браузер не поддерживает локальное хранилище проектов', 'error'); }
}
boot();
