/**
 * Warzone 2100 PIE 3D Engine & Inspector
 * Core Application Controller
 */

// Application State
const state = {
  pieData: null,
  rawText: '',
  pieFilename: 'stwpfcan.pie',
  piePath: 'warzone2100/Struct_Mod/stwpfcan.pie',
  textureImage: null,
  textureName: 'page-12-player-buildings.png',
  mode: 'faces', // 'faces' | 'vertices' | 'create_poly' | 'edit_uv' | 'transform'
  hoveredFaceIndex: null,
  pinnedFaceIndex: null,
  hoveredVertexIndex: null,
  pinnedVertexIndex: null,
  hoverSource: null, // '3d' | 'text' | 'canvas' | null
  activeLineEl: null,
  activeVertexLineEl: null,
  relatedFaceLineEls: [],
  
  // View Settings
  wireframe: false,
  showNormals: false,
  showConnectors: true,
  textureFilter: 'nearest', // 'nearest' | 'linear'
  autoRotate: false,
  showAllUVs: false,
  autoCenterUV: true,
  isEditMode: false,
  
  // Ground Grid Settings
  grid: {
    visible: true,
    size: 16, // coordinate distance per box
    y: 0 // Y elevation in coordinate units
  },
  
  // Create Polygon in 3D Mode State
  createPoly: {
    selectedPoints: [], // array of point indices [p0, p1, p2]
    hoveredPtIndex: null
  },

  // Create Point in 3D Mode State
  createPoint: {
    hasHit: false,
    currentPos: { x: 0, y: 0, z: 0 }
  },

  // Transform Points Mode State (vertex multi-select + transform params)
  transform: {
    selected: [], // array of PIE point indices
    hoveredPtIndex: null
  },

  // UV Direct Editing on Tileset State
  uvEdit: {
    activeHandleIndex: null, // 0, 1, 2 for vertices, 'center' for translating whole poly
    isDraggingHandle: false,
    dragStartMouseX: 0,
    dragStartMouseY: 0,
    origNormUVs: [],
    origRawUVs: [],
    snapToPixels: true
  },

  // Tileset Canvas Pan & Zoom
  tileset: {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    origPanX: 0,
    origPanY: 0
  },

  // Saved UV Presets Library
  savedUvs: [],
  editingUvPresetId: null,
  editingUvFocusPoint: null,

  // Secondary Visual Reference Model (Semi-transparent, View Only)
  refModel: {
    loaded: false,
    pieData: null,
    rawText: '',
    filename: '',
    piePath: '',
    textureImage: null,
    textureName: '',
    currentTexture: null,
    visible: true,
    opacity: 0.45,
    shading: 'textured', // 'textured' | 'cyan' | 'purple' | 'green' | 'white' | 'wireframe'
    group: null,
    mesh: null,
    wireframeMesh: null,
    connectorsGroup: null,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0
  }
};

// Color theme for face points & UVs
// Point 1 and UV1: Blue Dot
// Point 2 and UV2: Green Dot
// Point 3 and UV3: Red Dot
const FACE_POINT_THEMES = [
  {
    num: 1,
    name: 'Point 1 & UV1',
    dotColorName: 'Blue Dot',
    threeColor: 0x2563eb,
    threeEmissive: 0x3b82f6,
    hex: '#3b82f6',
    darkHex: '#1d4ed8',
    glow: 'rgba(59, 130, 246, 0.75)',
    bgRgba: 'rgba(59, 130, 246, 0.25)'
  },
  {
    num: 2,
    name: 'Point 2 & UV2',
    dotColorName: 'Green Dot',
    threeColor: 0x16a34a,
    threeEmissive: 0x22c55e,
    hex: '#22c55e',
    darkHex: '#15803d',
    glow: 'rgba(34, 197, 94, 0.75)',
    bgRgba: 'rgba(34, 197, 94, 0.25)'
  },
  {
    num: 3,
    name: 'Point 3 & UV3',
    dotColorName: 'Red Dot',
    threeColor: 0xdc2626,
    threeEmissive: 0xef4444,
    hex: '#ef4444',
    darkHex: '#b91c1c',
    glow: 'rgba(239, 68, 68, 0.75)',
    bgRgba: 'rgba(239, 68, 68, 0.25)'
  },
  {
    num: 4,
    name: 'Point 4 & UV4',
    dotColorName: 'Yellow Dot',
    threeColor: 0xd97706,
    threeEmissive: 0xf59e0b,
    hex: '#f59e0b',
    darkHex: '#b45309',
    glow: 'rgba(245, 158, 11, 0.75)',
    bgRgba: 'rgba(245, 158, 11, 0.25)'
  }
];

// Viewport transform matching WMIT v0.7.4 rendering
// (https://github.com/Warzone2100/WMIT/releases/tag/v0.7.4):
// QWZM::render applies glScalef(-s, s, s), i.e. PIE -X renders as
// viewport +X and PIE +X as viewport -X; Y and Z pass through unchanged.
// Only the viewport mapping is mirrored; PIE file data is never modified.
// Triangles are written as (p0, p2, p1) with matching UVs because mirroring
// flips orientation — this preserves front faces, mirroring WMIT's
// glFrontFace(GL_CW) compensation for the same mirror.
const VIEW_X_FLIP = -1;
function toViewportX(x) {
  return x * VIEW_X_FLIP;
}
function toPieX(xView) {
  return xView * VIEW_X_FLIP;
}

// Helper to create sharp billboard badge sprites for 3D dots
function createDotSprite(text, bgColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Outer dark soft shadow/rim
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fill();

  // Solid background circle
  ctx.beginPath();
  ctx.arc(64, 64, 48, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();

  // Crisp white inner border ring
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Crisp bold number text ("1", "2", "3", "4")
  ctx.font = '900 62px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(8.0, 8.0, 1);
  sprite.renderOrder = 10006;
  return sprite;
}

// 3D Engine Globals
let scene, camera, renderer, controls;
let gridHelper = null;
let mainMesh = null;
let wireframeMesh = null;
let normalsHelper = null;
let connectorsGroup = null;
let highlightMesh = null;
let highlightLine = null;
let facePointDotsGroup = null;
let facePointDots = [];
let createPolyPreviewGroup = null;
let createPolyLine = null;
let createPolyPreviewMesh = null;
let createPolyDots = [];
let createPointPreviewGroup = null;
let createPointIndicatorGroup = null;
let createPointStem = null;
let transformPreviewGroup = null;
let transformPreviewMarkers = [];
let verticesPointCloud = null;
let hoveredVertexMesh = null;
let currentTexture = null;
let raycaster, mouse;
let container3D, tilesetCanvas, tilesetCtx;

// DOM Elements
const el = {};

document.addEventListener('DOMContentLoaded', () => {
  initDOMElements();
  init3DScene();
  initTilesetCanvas();
  initSplitResizers();
  initEventListeners();
  loadInitialData();
});

function initDOMElements() {
  el.modelSelect = document.getElementById('model-select');
  el.modelItemTag = document.getElementById('model-item-tag');
  el.paneItemTag = document.getElementById('pane-item-tag');
  el.modelSearchInput = document.getElementById('model-search-input');
  el.btnClearModelSearch = document.getElementById('btn-clear-model-search');
  el.modelSearchSuggestions = document.getElementById('model-search-suggestions');
  el.btnRandomModel = document.getElementById('btn-random-model');
  el.btnCustomPath = document.getElementById('btn-custom-path');
  el.btnSyncRepo = document.getElementById('btn-sync-repo');
  el.syncBtnLabel = document.getElementById('sync-btn-label');

  el.tilesetSelect = document.getElementById('tileset-select');
  el.tilesetVariantButtons = document.getElementById('tileset-variant-buttons');
  el.btnApplyTilesetToPie = document.getElementById('btn-apply-tileset-to-pie');

  el.pathModal = document.getElementById('path-modal');
  el.btnClosePathModal = document.getElementById('btn-close-path-modal');
  el.inputCustomModelPath = document.getElementById('input-custom-model-path');
  el.btnLoadCustomPath = document.getElementById('btn-load-custom-path');

  el.btnOpenPie = document.getElementById('btn-open-pie');
  el.btnOpenTex = document.getElementById('btn-open-tex');
  el.btnFixWinding = document.getElementById('btn-fix-winding');
  el.fileInputPie = document.getElementById('file-input-pie');
  el.fileInputTex = document.getElementById('file-input-tex');

  el.textFilename = document.getElementById('text-filename');
  el.textViewerContainer = document.getElementById('text-viewer-container');
  el.textEditor = document.getElementById('text-editor');
  el.btnToggleEdit = document.getElementById('btn-toggle-edit');
  el.btnApplyText = document.getElementById('btn-apply-text');
  el.btnCopyText = document.getElementById('btn-copy-text');
  el.btnDownloadPie = document.getElementById('btn-download-pie');
  
  el.btnModeFaces = document.getElementById('btn-mode-faces');
  el.btnModeVertices = document.getElementById('btn-mode-vertices');
  el.btnModeCreatePoly = document.getElementById('btn-mode-create-poly');
  el.btnModeCreatePoint = document.getElementById('btn-mode-create-point');
  el.btnModeTransform = document.getElementById('btn-mode-transform');
  el.btnModeEditUV = document.getElementById('btn-mode-edit-uv');

  el.createPolyBar = document.getElementById('create-poly-bar');
  el.createPolyStep = document.getElementById('create-poly-step');
  el.chipPt1 = document.getElementById('chip-pt1');
  el.chipPt1Val = document.getElementById('chip-pt1-val');
  el.chipPt2 = document.getElementById('chip-pt2');
  el.chipPt2Val = document.getElementById('chip-pt2-val');
  el.chipPt3 = document.getElementById('chip-pt3');
  el.chipPt3Val = document.getElementById('chip-pt3-val');
  el.btnResetCreatePoly = document.getElementById('btn-reset-create-poly');
  el.btnExitCreatePoly = document.getElementById('btn-exit-create-poly');

  el.createPointBar = document.getElementById('create-point-bar');
  el.transformBar = document.getElementById('transform-bar');
  el.transformStep = document.getElementById('transform-step');
  el.tsPivot = document.getElementById('ts-pivot');
  el.btnApplyTransform = document.getElementById('btn-apply-transform');
  el.btnSelectAllTransform = document.getElementById('btn-select-all-transform');
  el.btnClearTransform = document.getElementById('btn-clear-transform');
  el.btnExitTransform = document.getElementById('btn-exit-transform');

  el.createPointStep = document.getElementById('create-point-step');
  el.chipPointCoords = document.getElementById('chip-point-coords');
  el.chipPointSnap = document.getElementById('chip-point-snap');
  el.btnExitCreatePoint = document.getElementById('btn-exit-create-point');

  el.uvEditToolbar = document.getElementById('uv-edit-toolbar');
  el.uvEditingPolyBadge = document.getElementById('uv-editing-poly-badge');
  el.chkSnapPixels = document.getElementById('chk-snap-pixels');
  el.btnUvFlipH = document.getElementById('btn-uv-flip-h');
  el.btnUvFlipV = document.getElementById('btn-uv-flip-v');
  el.btnUvRotCw = document.getElementById('btn-uv-rot-cw');
  el.btnUvReset = document.getElementById('btn-uv-reset');

  el.viewportStats = document.getElementById('viewport-stats');
  el.chkShowGrid = document.getElementById('chk-show-grid');
  el.selGridSize = document.getElementById('sel-grid-size');
  el.inputCustomGrid = document.getElementById('input-custom-grid');
  el.gridBoxBadge = document.getElementById('grid-box-badge');
  el.inputGridY = document.getElementById('input-grid-y');
  el.btnGridYUp = document.getElementById('btn-grid-y-up');
  el.btnGridYDown = document.getElementById('btn-grid-y-down');
  el.btnGridYReset = document.getElementById('btn-grid-y-reset');
  el.btnGridYSnap = document.getElementById('btn-grid-y-snap');

  el.hudTooltip = document.getElementById('hud-tooltip');
  el.hudFaceSection = document.getElementById('hud-face-section');
  el.hudVertexSection = document.getElementById('hud-vertex-section');
  el.hudPolyNum = document.getElementById('hud-poly-num');
  el.hudLineNum = document.getElementById('hud-line-num');
  el.hudIndices = document.getElementById('hud-indices');
  el.hudUV0 = document.getElementById('hud-uv0');
  el.hudUV1 = document.getElementById('hud-uv1');
  el.hudUV2 = document.getElementById('hud-uv2');

  el.hudVertNum = document.getElementById('hud-vert-num');
  el.hudVertLineNum = document.getElementById('hud-vert-line-num');
  el.hudVertCoords = document.getElementById('hud-vert-coords');
  el.hudVertPolys = document.getElementById('hud-vert-polys');
  el.hudVertUVs = document.getElementById('hud-vert-uvs');
  
  el.texFilename = document.getElementById('tex-filename');
  el.chkShowAllUVs = document.getElementById('chk-show-all-uvs');
  el.chkAutoCenterUV = document.getElementById('chk-auto-center-uv');
  el.btnZoomIn = document.getElementById('btn-zoom-in');
  el.btnZoomOut = document.getElementById('btn-zoom-out');
  el.btnZoomFit = document.getElementById('btn-zoom-fit');
  el.btnZoom100 = document.getElementById('btn-zoom-100');

  // Saved UV Box elements
  el.btnSaveUvPinned = document.getElementById('btn-save-uv-pinned');
  el.btnClearSavedUvs = document.getElementById('btn-clear-saved-uvs');
  el.savedUvCount = document.getElementById('saved-uv-count');
  el.savedUvList = document.getElementById('saved-uv-list');
  el.btnUvSavePreset = document.getElementById('btn-uv-save-preset');
  el.savedUvBox = document.getElementById('saved-uv-box');
  el.pieCodeBox = document.getElementById('pie-code-box');
  el.gutterSavedUv = document.getElementById('gutter-saved-uv');
  el.texCursorPos = document.getElementById('tex-cursor-pos');
  el.texCursorUV = document.getElementById('tex-cursor-uv');
  el.texZoomStat = document.getElementById('tex-zoom-stat');
  el.texHoverInfo = document.getElementById('tex-hover-info');
  
  el.toast = document.getElementById('toast');
  el.loadingOverlay = document.getElementById('loading-overlay');
  el.loadingText = document.getElementById('loading-text');

  // Secondary Reference Model UI Elements
  el.btnOpenRefModal = document.getElementById('btn-open-ref-modal');
  el.badgeRefActive = document.getElementById('badge-ref-active');
  el.refModelHud = document.getElementById('ref-model-hud');
  el.refHudName = document.getElementById('ref-hud-name');
  el.btnRefToggleVisible = document.getElementById('btn-ref-toggle-visible');
  el.refIconEyeOn = document.getElementById('ref-icon-eye-on');
  el.refIconEyeOff = document.getElementById('ref-icon-eye-off');
  el.btnRefChangeModel = document.getElementById('btn-ref-change-model');
  el.btnRefClear = document.getElementById('btn-ref-clear');
  el.sliderRefOpacity = document.getElementById('slider-ref-opacity');
  el.refOpacityVal = document.getElementById('ref-opacity-val');
  el.selRefShading = document.getElementById('sel-ref-shading');
  el.btnRefResetOffset = document.getElementById('btn-ref-reset-offset');
  el.btnRefSnapConn = document.getElementById('btn-ref-snap-conn');
  el.inputRefOffX = document.getElementById('input-ref-off-x');
  el.inputRefOffY = document.getElementById('input-ref-off-y');
  el.inputRefOffZ = document.getElementById('input-ref-off-z');
  el.fileInputRefPie = document.getElementById('file-input-ref-pie');

  // Reference Model Modal Elements
  el.refModal = document.getElementById('ref-modal');
  el.btnCloseRefModal = document.getElementById('btn-close-ref-modal');
  el.refSearchInput = document.getElementById('ref-search-input');
  el.btnClearRefSearch = document.getElementById('btn-clear-ref-search');
  el.refSearchSuggestions = document.getElementById('ref-search-suggestions');
  el.refModelSelect = document.getElementById('ref-model-select');
  el.btnBrowseRefFile = document.getElementById('btn-browse-ref-file');
  el.btnModalClearRef = document.getElementById('btn-modal-clear-ref');
}

/**
 * -------------------------------------------------------------
 * 3D Engine Setup (Three.js)
 * -------------------------------------------------------------
 */
function init3DScene() {
  container3D = document.getElementById('threejs-canvas-container');
  const width = container3D.clientWidth;
  const height = container3D.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1117);

  camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
  camera.position.set(220, 220, -280);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.style.outline = 'none';
  container3D.appendChild(renderer.domElement);

  // OrbitControls (Rotation pivot locked to Origin (0, 0, 0), Panning disabled)
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false; // Disable right-click & middle-click panning entirely
  controls.enableKeys = false;
  controls.target.set(0, 0, 0);

  // Prevent browser context menu on right-click in 3D viewport
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  // Lighting
  const ambLight = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
  dirLight1.position.set(200, 400, 300);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x90b0e0, 0.4);
  dirLight2.position.set(-200, -100, -200);
  scene.add(dirLight2);

  // Ground Grid (Variable size)
  updateGridHelper(state.grid.size, state.grid.visible);

  // Axis helper
  const axesHelper = new THREE.AxesHelper(40);
  axesHelper.position.y = 0.1;
  // WMIT draws X, Y and -Z (negative Z is the model "front"), so the blue
  // Z arm points toward -Z to match.
  axesHelper.scale.z = VIEW_X_FLIP;
  scene.add(axesHelper);

  // Connector Markers Group
  connectorsGroup = new THREE.Group();
  scene.add(connectorsGroup);

  // Raycaster & Mouse
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2(-100, -100);

  // Highlight overlay mesh (for hovered face)
  const highlightGeo = new THREE.BufferGeometry();
  const highlightMat = new THREE.MeshBasicMaterial({
    color: 0xffcc00,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  highlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
  highlightMesh.visible = false;
  scene.add(highlightMesh);

  // Highlight outline line
  const lineGeo = new THREE.BufferGeometry();
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    linewidth: 3,
    depthTest: false,
    transparent: true,
    opacity: 0.95
  });
  highlightLine = new THREE.LineLoop(lineGeo, lineMat);
  highlightLine.visible = false;
  highlightLine.renderOrder = 9998;
  scene.add(highlightLine);

  // 3D Face Point Dots for selected face:
  // Point 1: Blue Dot with "1" directly on vertex
  // Point 2: Green Dot with "2" directly on vertex
  // Point 3: Red Dot with "3" directly on vertex
  facePointDotsGroup = new THREE.Group();
  facePointDotsGroup.name = 'FacePointDots';
  facePointDotsGroup.visible = false;
  scene.add(facePointDotsGroup);

  facePointDots = [];
  for (let i = 0; i < 4; i++) {
    const theme = FACE_POINT_THEMES[i];
    const dotGroup = new THREE.Group();
    dotGroup.name = `FacePointDot_${theme.num}`;

    // 1. Crisp numbered billboard badge sprite directly at vertex (0, 0, 0)
    const sprite = createDotSprite(`${theme.num}`, theme.hex);
    sprite.position.set(0, 0, 0);
    sprite.renderOrder = 10006;
    dotGroup.add(sprite);

    // 2. White outer halo ring at (0, 0, 0)
    const haloGeo = new THREE.RingGeometry(3.6, 5.2, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.8
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.renderOrder = 10004;
    dotGroup.add(haloMesh);

    dotGroup.visible = false;
    facePointDotsGroup.add(dotGroup);
    facePointDots.push({
      group: dotGroup,
      halo: haloMesh,
      sprite: sprite
    });
  }

  // 3D In-Progress Create Polygon Visualizer Group
  createPolyPreviewGroup = new THREE.Group();
  createPolyPreviewGroup.name = 'CreatePolyPreview';
  scene.add(createPolyPreviewGroup);

  createPolyDots = [];
  for (let i = 0; i < 3; i++) {
    const theme = FACE_POINT_THEMES[i];
    const dGroup = new THREE.Group();

    // 1. Numbered billboard sprite directly at vertex (0, 0, 0)
    const sp = createDotSprite(`${theme.num}`, theme.hex);
    sp.position.set(0, 0, 0);
    sp.renderOrder = 10006;
    dGroup.add(sp);

    // 2. White outer halo ring
    const hMesh = new THREE.Mesh(
      new THREE.RingGeometry(3.6, 5.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.8 })
    );
    hMesh.renderOrder = 10004;
    dGroup.add(hMesh);

    dGroup.visible = false;
    createPolyPreviewGroup.add(dGroup);
    createPolyDots.push({ group: dGroup, sprite: sp, halo: hMesh });
  }

  // Preview Line for in-progress polygon
  const cpLineGeo = new THREE.BufferGeometry();
  const cpLineMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    linewidth: 3,
    depthTest: false,
    transparent: true,
    opacity: 0.9
  });
  createPolyLine = new THREE.Line(cpLineGeo, cpLineMat);
  createPolyLine.visible = false;
  createPolyLine.renderOrder = 10003;
  createPolyPreviewGroup.add(createPolyLine);

  // Preview Mesh for in-progress polygon
  const cpMeshGeo = new THREE.BufferGeometry();
  const cpMeshMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthTest: false
  });
  createPolyPreviewMesh = new THREE.Mesh(cpMeshGeo, cpMeshMat);
  createPolyPreviewMesh.visible = false;
  createPolyPreviewMesh.renderOrder = 10002;
  createPolyPreviewGroup.add(createPolyPreviewMesh);

  // Highlight marker for hovered vertex
  const vertMarkerGeo = new THREE.SphereGeometry(3.5, 16, 16);
  const vertMarkerMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.9,
    roughness: 0.2
  });
  hoveredVertexMesh = new THREE.Mesh(vertMarkerGeo, vertMarkerMat);
  const vertRingGeo = new THREE.RingGeometry(4.5, 6.5, 32);
  const vertRingMat = new THREE.MeshBasicMaterial({ color: 0xffea00, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(vertRingGeo, vertRingMat);
  ring.rotation.x = Math.PI / 2;
  hoveredVertexMesh.add(ring);
  hoveredVertexMesh.visible = false;
  scene.add(hoveredVertexMesh);

  // Create Point Snapping Cursor Indicator
  createPointPreviewGroup = new THREE.Group();
  createPointPreviewGroup.name = 'CreatePointPreviewGroup';

  createPointIndicatorGroup = new THREE.Group();
  createPointIndicatorGroup.name = 'CreatePointIndicatorHead';

  const ptSnapGeo = new THREE.SphereGeometry(3.0, 16, 16);
  const ptSnapMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.95,
    roughness: 0.2,
    depthTest: false,
    transparent: true,
    opacity: 0.95
  });
  const ptSnapMesh = new THREE.Mesh(ptSnapGeo, ptSnapMat);
  ptSnapMesh.renderOrder = 10005;
  createPointIndicatorGroup.add(ptSnapMesh);

  const ptRingGeo = new THREE.RingGeometry(3.5, 5.5, 32);
  const ptRingMat = new THREE.MeshBasicMaterial({
    color: 0xffea00,
    side: THREE.DoubleSide,
    depthTest: false,
    transparent: true,
    opacity: 0.9
  });
  const ptRingMesh = new THREE.Mesh(ptRingGeo, ptRingMat);
  ptRingMesh.rotation.x = Math.PI / 2;
  ptRingMesh.renderOrder = 10006;
  createPointIndicatorGroup.add(ptRingMesh);

  // Precision Crosshair alignment lines on grid plane
  const chGeo = new THREE.BufferGeometry();
  const chPos = new Float32Array([
    -8.0, 0, 0,  8.0, 0, 0,
    0, 0, -8.0,  0, 0, 8.0
  ]);
  chGeo.setAttribute('position', new THREE.BufferAttribute(chPos, 3));
  const chMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    depthTest: false,
    transparent: true,
    opacity: 0.85
  });
  const chLines = new THREE.LineSegments(chGeo, chMat);
  chLines.renderOrder = 10004;
  createPointIndicatorGroup.add(chLines);

  createPointPreviewGroup.add(createPointIndicatorGroup);

  const stemGeo = new THREE.BufferGeometry();
  const stemPos = new Float32Array([0, 0, 0, 0, 0, 0]);
  stemGeo.setAttribute('position', new THREE.BufferAttribute(stemPos, 3));
  const stemMat = new THREE.LineDashedMaterial({
    color: 0xffea00,
    dashSize: 3,
    gapSize: 2,
    depthTest: false,
    transparent: true,
    opacity: 0.8
  });
  createPointStem = new THREE.Line(stemGeo, stemMat);
  createPointStem.renderOrder = 10004;
  createPointStem.visible = false;
  createPointPreviewGroup.add(createPointStem);

  createPointPreviewGroup.visible = false;
  scene.add(createPointPreviewGroup);

  // Transform Points ghost preview markers (gold, one per selected vertex)
  transformPreviewGroup = new THREE.Group();
  transformPreviewGroup.name = 'TransformPreviewGroup';
  transformPreviewGroup.visible = false;
  scene.add(transformPreviewGroup);

  // 3D Canvas Events
  renderer.domElement.addEventListener('mousemove', on3DMouseMove);
  renderer.domElement.addEventListener('mouseleave', () => {
    if (state.mode === 'vertices') {
      onHoverVertex(null, '3d');
    } else if (state.mode === 'faces' || state.mode === 'edit_uv') {
      onHoverFace(null, '3d');
    } else if (state.mode === 'create_poly') {
      state.createPoly.hoveredPtIndex = null;
      updateCreatePolyPreview();
    } else if (state.mode === 'create_point') {
      if (createPointPreviewGroup) createPointPreviewGroup.visible = false;
      state.createPoint.hasHit = false;
    } else if (state.mode === 'transform') {
      state.transform.hoveredPtIndex = null;
      if (hoveredVertexMesh) hoveredVertexMesh.visible = false;
    }
  });

  // Animation Loop
  function animate() {
    requestAnimationFrame(animate);
    if (state.autoRotate && controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 2.0;
    } else if (controls) {
      controls.autoRotate = false;
    }

    // Keep all 3D markers across every mode dynamically resized to camera zoom level
    if (camera) {
      updateFacePointDotsScale();
      updateCreatePolyDotsScale();
      updateHoveredVertexMeshScale();
      updateConnectorsScale();
      updateRefConnectorsScale();

      // Dynamic zoom-adaptive scaling for Create Point preview indicator
      if (state.mode === 'create_point') {
        updateCreatePointIndicatorScale();
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // Resize Observer for 3D container
  const resizeObserver = new ResizeObserver(() => handle3DResize());
  resizeObserver.observe(container3D);
}

function handle3DResize() {
  if (!container3D || !renderer || !camera) return;
  const width = container3D.clientWidth;
  const height = container3D.clientHeight;
  if (width === 0 || height === 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

/**
 * Accurately finds the vertex closest to the mouse cursor on screen across ALL zoom levels.
 * Projects each 3D vertex to 2D viewport coordinates and finds the point with the minimum screen pixel distance.
 */
function getClosestVertexToMouse(event, maxPixelRadius = 36) {
  if (!state.pieData || !state.pieData.points || !camera || !renderer) return null;

  const rect = renderer.domElement.getBoundingClientRect();
  const mousePxX = event.clientX - rect.left;
  const mousePxY = event.clientY - rect.top;

  let closestIndex = null;
  let minPixelDist = Infinity;
  let closestDepth = Infinity;

  const pts = state.pieData.points;
  const vProj = new THREE.Vector3();

  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    if (!pt) continue;

    vProj.set(toViewportX(pt.x), pt.y, pt.z);
    vProj.project(camera);

    // If point is behind camera plane, skip
    if (vProj.z < -1.0 || vProj.z > 1.0) continue;

    const screenX = (vProj.x * 0.5 + 0.5) * rect.width;
    const screenY = (-vProj.y * 0.5 + 0.5) * rect.height;

    const distPx = Math.hypot(screenX - mousePxX, screenY - mousePxY);

    if (distPx <= maxPixelRadius) {
      // Primary: closest 2D pixel distance to mouse cursor.
      // Secondary tie-breaker: if two vertices are within 2px on screen, prefer the one closer to the camera.
      if (distPx < minPixelDist - 2.0 || (Math.abs(distPx - minPixelDist) <= 2.0 && vProj.z < closestDepth)) {
        minPixelDist = distPx;
        closestDepth = vProj.z;
        closestIndex = i;
      }
    }
  }

  return closestIndex;
}

function on3DMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  if (state.mode === 'create_point') {
    updateCreatePointCursor(event);
    return;
  }

  if (state.mode === 'create_poly') {
    const closestIdx = getClosestVertexToMouse(event, 36);
    if (closestIdx !== null) {
      state.createPoly.hoveredPtIndex = closestIdx;
      onHoverVertex(closestIdx, '3d', event);
      updateCreatePolyPreview();
    } else {
      state.createPoly.hoveredPtIndex = null;
      onHoverVertex(null, '3d');
      updateCreatePolyPreview();
    }
    return;
  }

  if (state.mode === 'vertices') {
    const closestIdx = getClosestVertexToMouse(event, 32);
    if (closestIdx !== null) {
      onHoverVertex(closestIdx, '3d', event);
    } else {
      onHoverVertex(null, '3d');
    }
    return;
  }

  if (state.mode === 'transform') {
    const closestIdx = getClosestVertexToMouse(event, 32);
    state.transform.hoveredPtIndex = closestIdx;
    if (closestIdx !== null && state.pieData && state.pieData.points[closestIdx]) {
      const pt = state.pieData.points[closestIdx];
      hoveredVertexMesh.position.set(toViewportX(pt.x), pt.y, pt.z);
      hoveredVertexMesh.visible = true;
      updateHoveredVertexMeshScale();
    } else if (hoveredVertexMesh) {
      hoveredVertexMesh.visible = false;
    }
    return;
  } else {
    if (!mainMesh) return;
    const intersects = raycaster.intersectObject(mainMesh);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const faceIndex = hit.faceIndex;
      onHoverFace(faceIndex, '3d', event);
    } else {
      onHoverFace(null, '3d');
    }
  }
}

/**
 * Update Ground Reference Grid with variable box size and Y elevation in coordinate units
 */
function updateGridHelper(boxSize = state.grid.size, visible = state.grid.visible, yLevel = state.grid.y) {
  state.grid.size = boxSize;
  state.grid.visible = visible;
  state.grid.y = Math.round(yLevel);

  if (gridHelper && scene) {
    scene.remove(gridHelper);
    if (gridHelper.geometry) gridHelper.geometry.dispose();
    if (gridHelper.material) {
      if (Array.isArray(gridHelper.material)) gridHelper.material.forEach(m => m.dispose());
      else gridHelper.material.dispose();
    }
    gridHelper = null;
  }

  // Update UI badge & input
  if (el.gridBoxBadge) {
    if (!visible) {
      el.gridBoxBadge.textContent = 'Hidden';
      el.gridBoxBadge.classList.add('grid-badge-hidden');
    } else {
      el.gridBoxBadge.textContent = `${boxSize}×${boxSize}u`;
      el.gridBoxBadge.classList.remove('grid-badge-hidden');
    }
  }

  if (el.inputGridY && el.inputGridY.value !== String(state.grid.y)) {
    el.inputGridY.value = state.grid.y;
  }

  if (!visible || !scene) return;

  // Grid extent: at least 512 coordinate units, or wider if boxSize is large
  const targetExtent = Math.max(512, boxSize * 8);
  const divisions = Math.max(2, Math.round(targetExtent / boxSize));
  const totalSize = divisions * boxSize;

  // Center axes lines (bright cyan), interior grid lines (slate/blue)
  gridHelper = new THREE.GridHelper(totalSize, divisions, 0x38bdf8, 0x1f2937);
  gridHelper.position.y = state.grid.y === 0 ? -0.1 : state.grid.y;
  gridHelper.visible = true;
  scene.add(gridHelper);
}

/**
 * Shift Ground Reference Grid up or down along the Y axis
 */
function setGridY(newY, notify = true) {
  state.grid.y = Math.round(newY);

  if (el.inputGridY) {
    el.inputGridY.value = state.grid.y;
  }

  // If grid was hidden, turn it on
  if (!state.grid.visible) {
    state.grid.visible = true;
    if (el.chkShowGrid) el.chkShowGrid.checked = true;
    updateGridHelper(state.grid.size, true, state.grid.y);
  } else if (gridHelper) {
    gridHelper.position.y = state.grid.y === 0 ? -0.1 : state.grid.y;
  } else {
    updateGridHelper(state.grid.size, true, state.grid.y);
  }

  if (notify) {
    showToast(`Grid elevation: Y = ${state.grid.y} units`);
  }
}

/**
 * -------------------------------------------------------------
 * Tileset Canvas Setup & 2D UV Interaction
 * -------------------------------------------------------------
 */
function initTilesetCanvas() {
  tilesetCanvas = document.getElementById('tileset-canvas');
  tilesetCtx = tilesetCanvas.getContext('2d');
  const container = document.getElementById('tileset-canvas-container');

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    tilesetCanvas.width = container.clientWidth * dpr;
    tilesetCanvas.height = container.clientHeight * dpr;
    tilesetCanvas.style.width = container.clientWidth + 'px';
    tilesetCanvas.style.height = container.clientHeight + 'px';
    renderTileset();
  }

  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(container);

  // Mouse wheel zoom
  tilesetCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = tilesetCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(0.1, Math.min(15, state.tileset.zoom * zoomFactor));

    // Zoom centered around mouse
    state.tileset.panX = mouseX - (mouseX - state.tileset.panX) * (newZoom / state.tileset.zoom);
    state.tileset.panY = mouseY - (mouseY - state.tileset.panY) * (newZoom / state.tileset.zoom);
    state.tileset.zoom = newZoom;

    updateTilesetZoomStat();
    renderTileset();
  }, { passive: false });

  // Mousedown for UV Dragging or Pan
  tilesetCanvas.addEventListener('mousedown', (e) => {
    const rect = tilesetCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if we hit a UV handle or active UV polygon in Edit UV mode (or when face is active)
    const activePolyIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
    if (activePolyIdx !== null && state.pieData && state.textureImage) {
      const poly = state.pieData.polygons[activePolyIdx];
      if (poly && poly.normUVs && poly.normUVs.length >= 3) {
        const imgW = state.textureImage.naturalWidth || 1024;
        const imgH = state.textureImage.naturalHeight || 1024;
        const zoom = state.tileset.zoom;
        const panX = state.tileset.panX;
        const panY = state.tileset.panY;

        const screenPts = poly.normUVs.map(uv => ({
          x: panX + uv.u * imgW * zoom,
          y: panY + uv.v * imgH * zoom
        }));

        // 1. Check vertex handles (UV1, UV2, UV3)
        let clickedHandle = null;
        for (let i = 0; i < screenPts.length; i++) {
          const dist = Math.hypot(mouseX - screenPts[i].x, mouseY - screenPts[i].y);
          if (dist <= 14) {
            clickedHandle = i;
            break;
          }
        }

        // 2. Check center / inside triangle for translating whole UV triangle
        let clickedInside = false;
        if (clickedHandle === null) {
          const imgX = (mouseX - panX) / zoom;
          const imgY = (mouseY - panY) / zoom;
          const p0 = { x: poly.normUVs[0].u * imgW, y: poly.normUVs[0].v * imgH };
          const p1 = { x: poly.normUVs[1].u * imgW, y: poly.normUVs[1].v * imgH };
          const p2 = { x: poly.normUVs[2].u * imgW, y: poly.normUVs[2].v * imgH };
          clickedInside = pointInTriangle(imgX, imgY, p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
        }

        if (clickedHandle !== null || (clickedInside && state.mode === 'edit_uv')) {
          state.uvEdit.isDraggingHandle = true;
          state.uvEdit.activeHandleIndex = (clickedHandle !== null) ? clickedHandle : 'center';
          state.uvEdit.dragStartMouseX = e.clientX;
          state.uvEdit.dragStartMouseY = e.clientY;
          state.uvEdit.origNormUVs = poly.normUVs.map(uv => ({ u: uv.u, v: uv.v }));
          state.uvEdit.origRawUVs = poly.rawUVs.map(uv => ({ u: uv.u, v: uv.v }));
          tilesetCanvas.style.cursor = 'grabbing';
          e.preventDefault();
          return;
        }
      }
    }

    // Default: Pan interaction
    state.tileset.isDragging = true;
    state.tileset.dragStartX = e.clientX;
    state.tileset.dragStartY = e.clientY;
    state.tileset.origPanX = state.tileset.panX;
    state.tileset.origPanY = state.tileset.panY;
    tilesetCanvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    // 1. Handle UV Dragging
    if (state.uvEdit.isDraggingHandle) {
      handleUVDragging(e);
      return;
    }

    // 2. Handle Canvas Pan Dragging
    if (state.tileset.isDragging) {
      const dx = e.clientX - state.tileset.dragStartX;
      const dy = e.clientY - state.tileset.dragStartY;
      state.tileset.panX = state.tileset.origPanX + dx;
      state.tileset.panY = state.tileset.origPanY + dy;
      renderTileset();
      return;
    }

    // 3. Hover detection over UV polygons and handles
    if (e.target === tilesetCanvas) {
      const rect = tilesetCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      handleTilesetMouseMove(mouseX, mouseY);
    }
  });

  let justDraggedUV = false;

  window.addEventListener('mouseup', () => {
    if (state.uvEdit.isDraggingHandle) {
      state.uvEdit.isDraggingHandle = false;
      justDraggedUV = true;
      setTimeout(() => { justDraggedUV = false; }, 150);

      const activePolyIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
      if (activePolyIdx !== null && state.pieData) {
        // Keep the Polygon pinned after dragging and releasing a UV dot on the UV map
        state.pinnedFaceIndex = activePolyIdx;
        const poly = state.pieData.polygons[activePolyIdx];
        if (poly) {
          // Persist updated UVs into PIE raw text
          const updatedText = PieParser.updatePolygonUVs(state.rawText, poly.lineNum, poly.rawUVs, poly);
          state.rawText = updatedText;
          if (el.textEditor) el.textEditor.value = updatedText;

          try {
            const newParsed = PieParser.parse(updatedText);
            state.pieData = newParsed;
            buildModelGeometry(newParsed);
            renderTextView(newParsed, updatedText);
            renderTileset();
            state.pinnedFaceIndex = activePolyIdx;
            onHoverFace(activePolyIdx, 'pin');
          } catch (err) {
            console.error('Error re-parsing PIE after UV drag:', err);
            renderTextView(state.pieData, updatedText);
          }
          showToast(`Pinned Polygon #${activePolyIdx} (UV coordinates updated)`);
        }
      }
      state.uvEdit.activeHandleIndex = null;
      tilesetCanvas.style.cursor = (state.mode === 'edit_uv') ? 'crosshair' : 'default';
      renderTileset();
      return;
    }

    if (state.tileset.isDragging) {
      state.tileset.isDragging = false;
      tilesetCanvas.style.cursor = (state.mode === 'edit_uv') ? 'crosshair' : 'default';
    }
  });

  tilesetCanvas.addEventListener('mouseleave', () => {
    el.texCursorPos.textContent = 'Pixel: (---, ---)';
    el.texCursorUV.textContent = 'UV: (---, ---)';
    if (state.hoverSource === 'canvas') {
      if (state.mode === 'vertices') {
        onHoverVertex(null, 'canvas');
      } else if (state.mode === 'faces') {
        onHoverFace(null, 'canvas');
      }
    }
  });
}

function handleUVDragging(e) {
  const activePolyIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
  if (activePolyIdx === null || !state.pieData || !state.textureImage) return;

  const poly = state.pieData.polygons[activePolyIdx];
  if (!poly || !poly.normUVs) return;

  const imgW = state.textureImage.naturalWidth || 1024;
  const imgH = state.textureImage.naturalHeight || 1024;
  const zoom = state.tileset.zoom;

  const dxScreen = e.clientX - state.uvEdit.dragStartMouseX;
  const dyScreen = e.clientY - state.uvEdit.dragStartMouseY;
  const dxImg = dxScreen / zoom;
  const dyImg = dyScreen / zoom;

  const isPie2 = (state.pieData.version < 3);
  const snap = state.uvEdit.snapToPixels;

  if (typeof state.uvEdit.activeHandleIndex === 'number') {
    const idx = state.uvEdit.activeHandleIndex;
    const origNorm = state.uvEdit.origNormUVs[idx];
    if (!origNorm) return;

    let newNormU = origNorm.u + dxImg / imgW;
    let newNormV = origNorm.v + dyImg / imgH;

    if (snap) {
      if (isPie2) {
        // PIE 2 standard coordinate scale is 0..256
        const rawU = Math.round(newNormU * 256.0);
        const rawV = Math.round(newNormV * 256.0);
        newNormU = rawU / 256.0;
        newNormV = rawV / 256.0;
      } else {
        const pixX = Math.round(newNormU * imgW);
        const pixY = Math.round(newNormV * imgH);
        newNormU = pixX / imgW;
        newNormV = pixY / imgH;
      }
    }

    newNormU = Math.max(0, Math.min(1, newNormU));
    newNormV = Math.max(0, Math.min(1, newNormV));

    poly.normUVs[idx].u = newNormU;
    poly.normUVs[idx].v = newNormV;

    if (isPie2) {
      poly.rawUVs[idx].u = Math.round(newNormU * 256.0);
      poly.rawUVs[idx].v = Math.round(newNormV * 256.0);
    } else {
      poly.rawUVs[idx].u = parseFloat(newNormU.toFixed(6));
      poly.rawUVs[idx].v = parseFloat(newNormV.toFixed(6));
    }
  } else if (state.uvEdit.activeHandleIndex === 'center') {
    // Translate whole UV triangle
    for (let i = 0; i < poly.normUVs.length; i++) {
      const origNorm = state.uvEdit.origNormUVs[i];
      if (!origNorm) continue;

      let newNormU = origNorm.u + dxImg / imgW;
      let newNormV = origNorm.v + dyImg / imgH;

      if (snap) {
        if (isPie2) {
          const rawU = Math.round(newNormU * 256.0);
          const rawV = Math.round(newNormV * 256.0);
          newNormU = rawU / 256.0;
          newNormV = rawV / 256.0;
        } else {
          const pixX = Math.round(newNormU * imgW);
          const pixY = Math.round(newNormV * imgH);
          newNormU = pixX / imgW;
          newNormV = pixY / imgH;
        }
      }

      newNormU = Math.max(0, Math.min(1, newNormU));
      newNormV = Math.max(0, Math.min(1, newNormV));

      poly.normUVs[i].u = newNormU;
      poly.normUVs[i].v = newNormV;

      if (isPie2) {
        poly.rawUVs[i].u = Math.round(newNormU * 256.0);
        poly.rawUVs[i].v = Math.round(newNormV * 256.0);
      } else {
        poly.rawUVs[i].u = parseFloat(newNormU.toFixed(6));
        poly.rawUVs[i].v = parseFloat(newNormV.toFixed(6));
      }
    }
  }

  // Live update Three.js BufferGeometry UV attribute for real-time model feedback!
  // Note: viewport geometry stores verts as (p0, p2, p1) due to the X-mirror winding swap.
  if (mainMesh && mainMesh.geometry && mainMesh.geometry.attributes.uv) {
    const uvAttr = mainMesh.geometry.attributes.uv;
    const baseUV = poly.globalIndex * 6;
    if (baseUV + 5 < uvAttr.array.length) {
      uvAttr.array[baseUV + 0] = poly.normUVs[0].u;
      uvAttr.array[baseUV + 1] = 1.0 - poly.normUVs[0].v;

      uvAttr.array[baseUV + 2] = poly.normUVs[2].u;
      uvAttr.array[baseUV + 3] = 1.0 - poly.normUVs[2].v;

      uvAttr.array[baseUV + 4] = poly.normUVs[1].u;
      uvAttr.array[baseUV + 5] = 1.0 - poly.normUVs[1].v;
      uvAttr.needsUpdate = true;
    }
  }

  // Live update code viewer & text editor during drag so user sees numbers in real time
  const updatedText = PieParser.updatePolygonUVs(state.rawText, poly.lineNum, poly.rawUVs, poly);
  state.rawText = updatedText;
  if (el.textEditor) el.textEditor.value = updatedText;
  renderTextView(state.pieData, updatedText);

  // Live render tileset & HUD
  renderTileset();
  updateHUD(activePolyIdx);
  updateUvEditToolbar();
}

function handleTilesetMouseMove(screenX, screenY) {
  if (!state.textureImage || !state.pieData) return;

  const imgW = state.textureImage.naturalWidth || 1024;
  const imgH = state.textureImage.naturalHeight || 1024;

  const imgX = (screenX - state.tileset.panX) / state.tileset.zoom;
  const imgY = (screenY - state.tileset.panY) / state.tileset.zoom;

  // Readout
  if (imgX >= 0 && imgX <= imgW && imgY >= 0 && imgY <= imgH) {
    el.texCursorPos.textContent = `Pixel: (${Math.round(imgX)}, ${Math.round(imgY)})`;
    el.texCursorUV.textContent = `UV: (${(imgX / imgW).toFixed(6)}, ${(imgY / imgH).toFixed(6)})`;
  } else {
    el.texCursorPos.textContent = `Pixel: (${Math.round(imgX)}, ${Math.round(imgY)})`;
    el.texCursorUV.textContent = `UV: (Out of bounds)`;
  }

  // If in Vertices Mode, detect nearest UV vertex
  if (state.mode === 'vertices') {
    let closestVertIdx = null;
    let minDist = 14 / state.tileset.zoom;

    const points = state.pieData.points;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (!pt.uvReferences) continue;
      for (const ref of pt.uvReferences) {
        const vx = ref.normU * imgW;
        const vy = ref.normV * imgH;
        const dist = Math.hypot(imgX - vx, imgY - vy);
        if (dist < minDist) {
          minDist = dist;
          closestVertIdx = i;
        }
      }
    }

    if (closestVertIdx !== null) {
      // In vertices mode, do not react on UV map
    }
    return;
  }

  // In Edit UV or Faces mode: Check UV handle hover cursor for the active/selected polygon
  const activePolyIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
  if (activePolyIdx !== null && state.pieData) {
    const poly = state.pieData.polygons[activePolyIdx];
    if (poly && poly.normUVs) {
      const zoom = state.tileset.zoom;
      const panX = state.tileset.panX;
      const panY = state.tileset.panY;
      for (const uv of poly.normUVs) {
        const hx = panX + uv.u * imgW * zoom;
        const hy = panY + uv.v * imgH * zoom;
        if (Math.hypot(screenX - hx, screenY - hy) <= 14) {
          tilesetCanvas.style.cursor = 'grab';
          return;
        }
      }

      // Check if hovering inside active polygon triangle in edit mode
      if (state.mode === 'edit_uv') {
        const ax = poly.normUVs[0].u * imgW;
        const ay = poly.normUVs[0].v * imgH;
        const bx = poly.normUVs[1].u * imgW;
        const by = poly.normUVs[1].v * imgH;
        const cx = poly.normUVs[2].u * imgW;
        const cy = poly.normUVs[2].v * imgH;
        if (pointInTriangle(imgX, imgY, ax, ay, bx, by, cx, cy)) {
          tilesetCanvas.style.cursor = 'move';
          return;
        }
      }
    }
  }

  tilesetCanvas.style.cursor = (state.mode === 'edit_uv') ? 'crosshair' : 'default';
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);

  const hasNeg = (d1 < -0.001) || (d2 < -0.001) || (d3 < -0.001);
  const hasPos = (d1 > 0.001) || (d2 > 0.001) || (d3 > 0.001);

  return !(hasNeg && hasPos);
}

function updateTilesetZoomStat() {
  el.texZoomStat.textContent = `Zoom: ${Math.round(state.tileset.zoom * 100)}%`;
}

function renderTileset() {
  if (!tilesetCtx || !tilesetCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = tilesetCanvas.width / dpr;
  const ch = tilesetCanvas.height / dpr;

  tilesetCtx.save();
  tilesetCtx.clearRect(0, 0, tilesetCanvas.width, tilesetCanvas.height);
  tilesetCtx.scale(dpr, dpr);

  const img = state.textureImage;
  const zoom = state.tileset.zoom;
  const panX = state.tileset.panX;
  const panY = state.tileset.panY;

  if (img && img.complete) {
    const imgW = img.naturalWidth || 1024;
    const imgH = img.naturalHeight || 1024;

    // Draw dark checkerboard background
    drawCheckerboard(tilesetCtx, panX, panY, imgW * zoom, imgH * zoom);

    // Draw texture image
    tilesetCtx.imageSmoothingEnabled = (state.textureFilter === 'linear');
    tilesetCtx.drawImage(img, panX, panY, imgW * zoom, imgH * zoom);

    // Image border
    tilesetCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    tilesetCtx.lineWidth = 1;
    tilesetCtx.strokeRect(panX, panY, imgW * zoom, imgH * zoom);

    // Draw All UV Outlines
    if (state.showAllUVs && state.pieData) {
      tilesetCtx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      tilesetCtx.lineWidth = Math.max(1, 1 / zoom);
      tilesetCtx.beginPath();
      for (const poly of state.pieData.polygons) {
        if (!poly.normUVs || poly.normUVs.length < 3) continue;
        const x0 = panX + poly.normUVs[0].u * imgW * zoom;
        const y0 = panY + poly.normUVs[0].v * imgH * zoom;
        const x1 = panX + poly.normUVs[1].u * imgW * zoom;
        const y1 = panY + poly.normUVs[1].v * imgH * zoom;
        const x2 = panX + poly.normUVs[2].u * imgW * zoom;
        const y2 = panY + poly.normUVs[2].v * imgH * zoom;
        tilesetCtx.moveTo(x0, y0);
        tilesetCtx.lineTo(x1, y1);
        tilesetCtx.lineTo(x2, y2);
        tilesetCtx.lineTo(x0, y0);
      }
      tilesetCtx.stroke();
    }

    // Active Face to draw:
    const activeFaceIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;

    // Draw Active UV Face
    if (activeFaceIdx !== null && state.pieData) {
      const poly = state.pieData.polygons[activeFaceIdx];
      if (poly && poly.normUVs && poly.normUVs.length >= 3) {
        const pts = poly.normUVs.map((uv, idx) => ({
          x: panX + uv.u * imgW * zoom,
          y: panY + uv.v * imgH * zoom,
          rawU: poly.rawUVs[idx].u,
          rawV: poly.rawUVs[idx].v,
          normU: uv.u,
          normV: uv.v,
          ptIdx: poly.points[idx]
        }));

        // Fill hovered triangle with subtle vibrant translucent tint
        tilesetCtx.fillStyle = (state.mode === 'edit_uv') ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 204, 0, 0.32)';
        tilesetCtx.beginPath();
        tilesetCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          tilesetCtx.lineTo(pts[i].x, pts[i].y);
        }
        tilesetCtx.closePath();
        tilesetCtx.fill();

        // Draw UV triangle outline with color-coordinated edges:
        // Pt 1 (Blue) -> Pt 2 (Green) -> Pt 3 (Red)
        if (pts.length >= 3) {
          // Edge 0->1: Blue to Green
          const grad01 = tilesetCtx.createLinearGradient(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
          grad01.addColorStop(0, '#3b82f6');
          grad01.addColorStop(1, '#22c55e');
          tilesetCtx.beginPath();
          tilesetCtx.moveTo(pts[0].x, pts[0].y);
          tilesetCtx.lineTo(pts[1].x, pts[1].y);
          tilesetCtx.strokeStyle = grad01;
          tilesetCtx.lineWidth = 3;
          tilesetCtx.stroke();

          // Edge 1->2: Green to Red
          const grad12 = tilesetCtx.createLinearGradient(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
          grad12.addColorStop(0, '#22c55e');
          grad12.addColorStop(1, '#ef4444');
          tilesetCtx.beginPath();
          tilesetCtx.moveTo(pts[1].x, pts[1].y);
          tilesetCtx.lineTo(pts[2].x, pts[2].y);
          tilesetCtx.strokeStyle = grad12;
          tilesetCtx.lineWidth = 3;
          tilesetCtx.stroke();

          // Edge 2->0: Red to Blue
          const lastIdx = pts.length - 1;
          const gradLast0 = tilesetCtx.createLinearGradient(pts[lastIdx].x, pts[lastIdx].y, pts[0].x, pts[0].y);
          gradLast0.addColorStop(0, '#ef4444');
          gradLast0.addColorStop(1, '#3b82f6');
          tilesetCtx.beginPath();
          tilesetCtx.moveTo(pts[lastIdx].x, pts[lastIdx].y);
          tilesetCtx.lineTo(pts[0].x, pts[0].y);
          tilesetCtx.strokeStyle = gradLast0;
          tilesetCtx.lineWidth = 3;
          tilesetCtx.stroke();
        }

        // Draw vertices and draggable handles:
        // Point 1 and UV1: Blue Dot
        // Point 2 and UV2: Green Dot
        // Point 3 and UV3: Red Dot
        pts.forEach((pt, i) => {
          const theme = FACE_POINT_THEMES[i % FACE_POINT_THEMES.length];
          const isDraggingThis = (state.uvEdit.isDraggingHandle && state.uvEdit.activeHandleIndex === i);

          // 1. Glowing outer halo
          tilesetCtx.beginPath();
          tilesetCtx.arc(pt.x, pt.y, isDraggingThis ? 16 : 12, 0, Math.PI * 2);
          tilesetCtx.fillStyle = theme.glow;
          tilesetCtx.fill();

          // 2. White outer border ring
          tilesetCtx.beginPath();
          tilesetCtx.arc(pt.x, pt.y, isDraggingThis ? 9.5 : 7.5, 0, Math.PI * 2);
          tilesetCtx.fillStyle = '#ffffff';
          tilesetCtx.fill();
          tilesetCtx.strokeStyle = '#0f172a';
          tilesetCtx.lineWidth = 1.5;
          tilesetCtx.stroke();

          // 3. Central colored dot
          tilesetCtx.beginPath();
          tilesetCtx.arc(pt.x, pt.y, isDraggingThis ? 7 : 5.5, 0, Math.PI * 2);
          tilesetCtx.fillStyle = theme.hex;
          tilesetCtx.fill();
        });
      }
    }
  } else {
    tilesetCtx.fillStyle = '#64748b';
    tilesetCtx.font = '13px sans-serif';
    tilesetCtx.fillText('Loading tileset texture...', cw / 2 - 80, ch / 2);
  }

  tilesetCtx.restore();
}

function drawCheckerboard(ctx, x, y, w, h) {
  const size = 16;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < w; i += size) {
    for (let j = 0; j < h; j += size) {
      ctx.fillStyle = ((i / size + j / size) % 2 === 0) ? '#181b22' : '#222733';
      ctx.fillRect(x + i, y + j, size, size);
    }
  }
  ctx.restore();
}

function fitTilesetToView() {
  if (!state.textureImage || !tilesetCanvas) return;
  const container = document.getElementById('tileset-canvas-container');
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const imgW = state.textureImage.naturalWidth || 1024;
  const imgH = state.textureImage.naturalHeight || 1024;

  const scale = Math.min((cw - 32) / imgW, (ch - 32) / imgH);
  state.tileset.zoom = Math.max(0.1, scale);
  state.tileset.panX = (cw - imgW * state.tileset.zoom) / 2;
  state.tileset.panY = (ch - imgH * state.tileset.zoom) / 2;

  updateTilesetZoomStat();
  renderTileset();
}

/**
 * -------------------------------------------------------------
 * PIE Model & Texture Construction
 * -------------------------------------------------------------
 */
function buildModelGeometry(pieData) {
  if (!pieData || !pieData.polygons || !pieData.points) return;

  if (mainMesh) {
    scene.remove(mainMesh);
    if (mainMesh.geometry) mainMesh.geometry.dispose();
  }
  if (wireframeMesh) {
    scene.remove(wireframeMesh);
    if (wireframeMesh.geometry) wireframeMesh.geometry.dispose();
  }
  if (normalsHelper) {
    scene.remove(normalsHelper);
    if (normalsHelper.geometry) normalsHelper.geometry.dispose();
  }
  while (connectorsGroup.children.length > 0) {
    connectorsGroup.remove(connectorsGroup.children[0]);
  }

  const polys = pieData.polygons;
  const points = pieData.points;

  const positions = new Float32Array(polys.length * 3 * 3);
  const uvs = new Float32Array(polys.length * 3 * 2);

  for (let i = 0; i < polys.length; i++) {
    const poly = polys[i];
    const p0 = points[poly.points[0]];
    const p1 = points[poly.points[1]];
    const p2 = points[poly.points[2]];

    if (!p0 || !p1 || !p2) continue;

    // X mirror (PIE -X renders as viewport +X) with swapped winding to keep
    // FrontSide faces outward after mirroring, matching WMIT.
    const basePos = i * 9;
    positions[basePos + 0] = toViewportX(p0.x);
    positions[basePos + 1] = p0.y;
    positions[basePos + 2] = p0.z;

    positions[basePos + 3] = toViewportX(p2.x);
    positions[basePos + 4] = p2.y;
    positions[basePos + 5] = p2.z;

    positions[basePos + 6] = toViewportX(p1.x);
    positions[basePos + 7] = p1.y;
    positions[basePos + 8] = p1.z;

    const baseUV = i * 6;
    uvs[baseUV + 0] = poly.normUVs[0].u;
    uvs[baseUV + 1] = 1.0 - poly.normUVs[0].v;

    uvs[baseUV + 2] = poly.normUVs[2].u;
    uvs[baseUV + 3] = 1.0 - poly.normUVs[2].v;

    uvs[baseUV + 4] = poly.normUVs[1].u;
    uvs[baseUV + 5] = 1.0 - poly.normUVs[1].v;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: currentTexture,
    roughness: 0.6,
    metalness: 0.15,
    side: THREE.FrontSide
  });

  mainMesh = new THREE.Mesh(geometry, material);
  scene.add(mainMesh);

  // Wireframe Overlay
  const wireGeo = new THREE.WireframeGeometry(geometry);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.4
  });
  wireframeMesh = new THREE.LineSegments(wireGeo, wireMat);
  wireframeMesh.visible = state.wireframe;
  scene.add(wireframeMesh);

  // Vertices Point Cloud
  if (verticesPointCloud) {
    scene.remove(verticesPointCloud);
    if (verticesPointCloud.geometry) verticesPointCloud.geometry.dispose();
  }
  const pointPositions = new Float32Array(points.length * 3);
  const pointColors = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    pointPositions[i * 3 + 0] = toViewportX(pt.x);
    pointPositions[i * 3 + 1] = pt.y;
    pointPositions[i * 3 + 2] = pt.z;
    pointColors[i * 3 + 0] = 0.22;
    pointColors[i * 3 + 1] = 0.74;
    pointColors[i * 3 + 2] = 0.97;
  }
  const ptGeo = new THREE.BufferGeometry();
  ptGeo.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
  ptGeo.setAttribute('color', new THREE.BufferAttribute(pointColors, 3));
  const ptMat = new THREE.PointsMaterial({
    size: 11,
    vertexColors: true,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9
  });
  verticesPointCloud = new THREE.Points(ptGeo, ptMat);
  verticesPointCloud.visible = (state.mode === 'vertices' || state.mode === 'create_poly' || state.mode === 'create_point' || state.mode === 'transform');
  scene.add(verticesPointCloud);

  // Keep transform selection valid across geometry rebuilds
  if (state.mode === 'transform' && state.pieData) {
    state.transform.selected = state.transform.selected.filter(i => i >= 0 && i < points.length);
    updateTransformSelectionColors();
    updateTransformPreview();
  }

  // Connectors Visualizer
  buildConnectorsVisualizer(pieData.connectors);

  // Position camera around model with rotation pivot centered at the Origin (0, 0, 0)
  if (!state.cameraInitialized) {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 20);

    controls.target.set(0, 0, 0);
    // WMIT default view looks at the model front (-Z) from above, so sit at +X, +Y, -Z.
    camera.position.set(maxDim * 1.4, maxDim * 1.1, -maxDim * 1.5);
    camera.lookAt(0, 0, 0);
    controls.update();
    state.cameraInitialized = true;
  }
}

function buildConnectorsVisualizer(connectors) {
  if (!connectors || connectors.length === 0) return;

  const sphereGeo = new THREE.SphereGeometry(3.5, 16, 16);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xea580c,
    emissiveIntensity: 0.8,
    roughness: 0.3
  });

  connectors.forEach((conn) => {
    const marker = new THREE.Mesh(sphereGeo, sphereMat);
    marker.position.set(toViewportX(conn.x), conn.y, conn.z);
    
    const ringGeo = new THREE.RingGeometry(4, 5.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    marker.add(ring);

    connectorsGroup.add(marker);
  });

  connectorsGroup.visible = state.showConnectors;
  updateConnectorsScale();
}

/**
 * -------------------------------------------------------------
 * Secondary Visual Reference Model (View Only, Semi-Transparent)
 * -------------------------------------------------------------
 */

function buildReferenceModelGeometry(pieData) {
  if (!pieData || !pieData.polygons || !pieData.points) return;

  if (!state.refModel.group) {
    state.refModel.group = new THREE.Group();
    state.refModel.group.name = 'ReferenceModelGroup';
    scene.add(state.refModel.group);
  }

  // Clear existing children
  while (state.refModel.group.children.length > 0) {
    const child = state.refModel.group.children[0];
    state.refModel.group.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  }

  const polys = pieData.polygons;
  const points = pieData.points;
  const positions = new Float32Array(polys.length * 3 * 3);
  const uvs = new Float32Array(polys.length * 3 * 2);

  for (let i = 0; i < polys.length; i++) {
    const poly = polys[i];
    const p0 = points[poly.points[0]];
    const p1 = points[poly.points[1]];
    const p2 = points[poly.points[2]];
    if (!p0 || !p1 || !p2) continue;

    // X mirror with swapped winding to keep outward normals/lighting
    // correct after mirroring, matching WMIT.
    const basePos = i * 9;
    positions[basePos + 0] = toViewportX(p0.x);
    positions[basePos + 1] = p0.y;
    positions[basePos + 2] = p0.z;

    positions[basePos + 3] = toViewportX(p2.x);
    positions[basePos + 4] = p2.y;
    positions[basePos + 5] = p2.z;

    positions[basePos + 6] = toViewportX(p1.x);
    positions[basePos + 7] = p1.y;
    positions[basePos + 8] = p1.z;

    const baseUV = i * 6;
    uvs[baseUV + 0] = poly.normUVs[0].u;
    uvs[baseUV + 1] = 1.0 - poly.normUVs[0].v;

    uvs[baseUV + 2] = poly.normUVs[2].u;
    uvs[baseUV + 3] = 1.0 - poly.normUVs[2].v;

    uvs[baseUV + 4] = poly.normUVs[1].u;
    uvs[baseUV + 5] = 1.0 - poly.normUVs[1].v;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const material = createReferenceMaterial();
  const refMesh = new THREE.Mesh(geometry, material);
  refMesh.renderOrder = 2; // Render after opaque geometries
  state.refModel.mesh = refMesh;
  state.refModel.group.add(refMesh);

  // Subtle Wireframe overlay for reference model alignment
  const wireGeo = new THREE.WireframeGeometry(geometry);
  const wireMat = new THREE.LineBasicMaterial({
    color: getRefWireframeColor(),
    transparent: true,
    opacity: Math.min(0.8, Math.max(0.15, state.refModel.opacity * 0.7)),
    depthWrite: false
  });
  const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
  wireMesh.renderOrder = 3;
  state.refModel.wireframeMesh = wireMesh;
  state.refModel.group.add(wireMesh);

  // Reference Model Connectors visualizer
  if (pieData.connectors && pieData.connectors.length > 0) {
    const connGroup = new THREE.Group();
    const sphereGeo = new THREE.SphereGeometry(3, 14, 14);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xc084fc,
      emissive: 0x9333ea,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: state.refModel.opacity
    });

    pieData.connectors.forEach((conn) => {
      const marker = new THREE.Mesh(sphereGeo, sphereMat);
      marker.position.set(toViewportX(conn.x), conn.y, conn.z);
      connGroup.add(marker);
    });
    state.refModel.connectorsGroup = connGroup;
    state.refModel.group.add(connGroup);
  }

  state.refModel.group.position.set(toViewportX(state.refModel.offsetX), state.refModel.offsetY, state.refModel.offsetZ);
  state.refModel.group.visible = state.refModel.visible;
  updateRefConnectorsScale();
}

function getRefWireframeColor() {
  switch (state.refModel.shading) {
    case 'cyan': return 0x38bdf8;
    case 'green': return 0x4ade80;
    case 'white': return 0xffffff;
    case 'purple':
    case 'wireframe':
    case 'textured':
    default: return 0xc084fc;
  }
}

function createReferenceMaterial() {
  const opacity = state.refModel.opacity;
  const shading = state.refModel.shading;

  if (shading === 'wireframe') {
    return new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0xc084fc,
      transparent: true,
      opacity: opacity,
      depthWrite: false
    });
  }

  if (shading === 'cyan') {
    return new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: opacity,
      roughness: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  if (shading === 'purple') {
    return new THREE.MeshStandardMaterial({
      color: 0xc084fc,
      emissive: 0x7e22ce,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: opacity,
      roughness: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  if (shading === 'green') {
    return new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      emissive: 0x15803d,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: opacity,
      roughness: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  if (shading === 'white') {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x475569,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: opacity,
      roughness: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  // Default 'textured'
  return new THREE.MeshStandardMaterial({
    map: state.refModel.currentTexture,
    transparent: true,
    opacity: opacity,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false
  });
}

function updateReferenceModelMaterial() {
  if (!state.refModel.mesh) return;

  if (state.refModel.mesh.material) {
    if (Array.isArray(state.refModel.mesh.material)) state.refModel.mesh.material.forEach(m => m.dispose());
    else state.refModel.mesh.material.dispose();
  }

  state.refModel.mesh.material = createReferenceMaterial();
  state.refModel.mesh.material.needsUpdate = true;

  if (state.refModel.wireframeMesh && state.refModel.wireframeMesh.material) {
    state.refModel.wireframeMesh.material.color.setHex(getRefWireframeColor());
    state.refModel.wireframeMesh.material.opacity = Math.min(0.8, Math.max(0.15, state.refModel.opacity * 0.7));
    state.refModel.wireframeMesh.material.needsUpdate = true;
  }
}

function loadReferencePieFromText(text, filename, piePath = '') {
  try {
    const parsed = PieParser.parse(text);
    state.refModel.loaded = true;
    state.refModel.pieData = parsed;
    state.refModel.rawText = text;
    state.refModel.filename = filename;
    state.refModel.piePath = piePath;
    state.refModel.visible = true;

    // Determine reference model texture
    let texName = parsed.texture;
    if (!texName && parsed.textures && parsed.textures.length > 0) {
      texName = parsed.textures[0].filename;
    }
    if (!texName) {
      texName = 'page-12-player-buildings.png';
    }
    state.refModel.textureName = texName;

    // Load texture image for reference model asynchronously
    const texUrl = `/api/texture?name=${encodeURIComponent(texName)}&pie=${encodeURIComponent(piePath || '')}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      state.refModel.textureImage = img;
      if (state.refModel.currentTexture) state.refModel.currentTexture.dispose();
      state.refModel.currentTexture = new THREE.Texture(img);
      state.refModel.currentTexture.flipY = true;
      state.refModel.currentTexture.magFilter = THREE.NearestFilter;
      state.refModel.currentTexture.minFilter = THREE.NearestMipmapNearestFilter;
      state.refModel.currentTexture.needsUpdate = true;

      buildReferenceModelGeometry(parsed);
      updateReferenceModelMaterial();
    };
    img.onerror = () => {
      buildReferenceModelGeometry(parsed);
    };
    img.src = texUrl;

    // Initial build without waiting for texture
    buildReferenceModelGeometry(parsed);

    // Update UI HUD & Badges
    if (el.refModelHud) el.refModelHud.style.display = 'flex';
    if (el.refHudName) el.refHudName.textContent = filename;
    if (el.badgeRefActive) el.badgeRefActive.style.display = 'inline-block';
    if (el.btnRefToggleVisible) {
      if (el.refIconEyeOn) el.refIconEyeOn.style.display = 'block';
      if (el.refIconEyeOff) el.refIconEyeOff.style.display = 'none';
    }
    if (el.refModal) el.refModal.style.display = 'none';

    showToast(`Loaded reference: ${filename} (View Only, ${Math.round(state.refModel.opacity * 100)}% opacity)`);
  } catch (err) {
    console.error('Error loading reference PIE:', err);
    showToast('Failed to parse reference PIE: ' + err.message);
  }
}

async function loadReferencePieFromPath(piePath) {
  showLoading(`Loading reference model ${piePath.split('/').pop()}...`);
  try {
    const res = await fetch(`/api/pie?path=${encodeURIComponent(piePath)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    const filename = piePath.split('/').pop() || 'reference.pie';
    loadReferencePieFromText(text, filename, piePath);
  } catch (err) {
    console.error('Error loading reference PIE from path:', err);
    showToast('Failed to load reference PIE: ' + err.message);
  } finally {
    hideLoading();
  }
}

function clearReferenceModel() {
  if (state.refModel.group && scene) {
    scene.remove(state.refModel.group);
    while (state.refModel.group.children.length > 0) {
      const child = state.refModel.group.children[0];
      state.refModel.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }
    state.refModel.group = null;
  }

  if (state.refModel.currentTexture) {
    state.refModel.currentTexture.dispose();
    state.refModel.currentTexture = null;
  }

  state.refModel.loaded = false;
  state.refModel.pieData = null;
  state.refModel.rawText = '';
  state.refModel.filename = '';
  state.refModel.piePath = '';
  state.refModel.mesh = null;
  state.refModel.wireframeMesh = null;
  state.refModel.connectorsGroup = null;

  if (el.refModelHud) el.refModelHud.style.display = 'none';
  if (el.badgeRefActive) el.badgeRefActive.style.display = 'none';
  if (el.refModal) el.refModal.style.display = 'none';

  showToast('Reference model cleared');
}

function toggleReferenceVisibility() {
  if (!state.refModel.loaded) return;
  state.refModel.visible = !state.refModel.visible;
  if (state.refModel.group) {
    state.refModel.group.visible = state.refModel.visible;
  }
  if (el.refIconEyeOn) el.refIconEyeOn.style.display = state.refModel.visible ? 'block' : 'none';
  if (el.refIconEyeOff) el.refIconEyeOff.style.display = state.refModel.visible ? 'none' : 'block';
  showToast(state.refModel.visible ? 'Reference model visible' : 'Reference model hidden');
}

function setReferenceOffset(x, y, z) {
  state.refModel.offsetX = parseFloat(x) || 0;
  state.refModel.offsetY = parseFloat(y) || 0;
  state.refModel.offsetZ = parseFloat(z) || 0;

  if (el.inputRefOffX) el.inputRefOffX.value = state.refModel.offsetX;
  if (el.inputRefOffY) el.inputRefOffY.value = state.refModel.offsetY;
  if (el.inputRefOffZ) el.inputRefOffZ.value = state.refModel.offsetZ;

  if (state.refModel.group) {
    state.refModel.group.position.set(toViewportX(state.refModel.offsetX), state.refModel.offsetY, state.refModel.offsetZ);
  }
}

function snapReferenceToPrimaryConnector() {
  if (!state.pieData) {
    showToast('No primary model loaded');
    return;
  }

  // If primary model has connectors, use connector 0 (turret / weapon mount)
  if (state.pieData.connectors && state.pieData.connectors.length > 0) {
    const conn = state.pieData.connectors[0];
    setReferenceOffset(conn.x, conn.y, conn.z);
    showToast(`Snapped reference to primary Connector #0 at (${conn.x}, ${conn.y}, ${conn.z})`);
  } else if (state.refModel.pieData && state.refModel.pieData.connectors && state.refModel.pieData.connectors.length > 0) {
    // If reference model has connector 0, align inverse
    const refConn = state.refModel.pieData.connectors[0];
    setReferenceOffset(-refConn.x, -refConn.y, -refConn.z);
    showToast(`Aligned reference Connector #0 at ground`);
  } else {
    // Default: Reset to center
    setReferenceOffset(0, 0, 0);
    showToast('No connectors found in model. Centered reference at (0, 0, 0)');
  }
}

function loadTextureImage(url, onDone) {
  showLoading('Loading texture image...');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    state.textureImage = img;
    
    if (currentTexture) currentTexture.dispose();
    currentTexture = new THREE.Texture(img);
    currentTexture.flipY = true;
    currentTexture.magFilter = (state.textureFilter === 'nearest') ? THREE.NearestFilter : THREE.LinearFilter;
    currentTexture.minFilter = (state.textureFilter === 'nearest') ? THREE.NearestMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
    currentTexture.needsUpdate = true;

    if (mainMesh && mainMesh.material) {
      mainMesh.material.map = currentTexture;
      mainMesh.material.needsUpdate = true;
    }

    hideLoading();
    fitTilesetToView();
    renderTileset();
    if (onDone) onDone();
  };
  img.onerror = (err) => {
    console.warn('Could not load texture from', url, err);
    hideLoading();
    showToast('Failed to load texture image');
  };
  img.src = url;
}

/**
 * -------------------------------------------------------------
 * Syntax-Highlighted PIE Text Viewer
 * -------------------------------------------------------------
 */
function renderTextView(pieData, rawText) {
  const container = el.textViewerContainer;
  container.innerHTML = '';

  const lines = rawText.split(/\r?\n/);
  const fragment = document.createDocumentFragment();

  for (let idx = 0; idx < lines.length; idx++) {
    const lineNum = idx + 1;
    const lineStr = lines[idx];

    const row = document.createElement('div');
    row.className = 'code-line';
    row.id = `line-${lineNum}`;
    row.dataset.line = lineNum;

    const mapInfo = pieData.lineMap[lineNum];
    if (mapInfo && mapInfo.type === 'poly') {
      row.dataset.polyIndex = mapInfo.index;
    } else if (mapInfo && mapInfo.type === 'point') {
      row.dataset.pointIndex = mapInfo.index;
    }

    const numSpan = document.createElement('span');
    numSpan.className = 'line-num';
    numSpan.textContent = lineNum;

    const contentSpan = document.createElement('span');
    contentSpan.className = 'line-content';
    contentSpan.innerHTML = formatLineSyntax(lineStr, mapInfo, pieData);

    row.appendChild(numSpan);
    row.appendChild(contentSpan);

    row.addEventListener('mouseenter', () => {
      if (row.dataset.polyIndex !== undefined) {
        onHoverFace(parseInt(row.dataset.polyIndex, 10), 'text');
      } else if (row.dataset.pointIndex !== undefined) {
        onHoverVertex(parseInt(row.dataset.pointIndex, 10), 'text');
      } else {
        if (state.mode === 'vertices') {
          onHoverVertex(null, 'text');
        } else {
          onHoverFace(null, 'text');
        }
      }
    });

    row.addEventListener('click', () => {
      if (row.dataset.polyIndex !== undefined) {
        togglePinFace(parseInt(row.dataset.polyIndex, 10));
      } else if (row.dataset.pointIndex !== undefined) {
        togglePinVertex(parseInt(row.dataset.pointIndex, 10));
      }
    });

    fragment.appendChild(row);
  }

  container.appendChild(fragment);

  container.addEventListener('mouseleave', () => {
    if (state.hoverSource === 'text') {
      if (state.mode === 'vertices') {
        onHoverVertex(null, 'text');
      } else {
        onHoverFace(null, 'text');
      }
    }
  });

  el.textEditor.value = rawText;
}

function formatLineSyntax(line, mapInfo, pieData) {
  if (!line) return '&nbsp;';
  
  const hashIdx = line.indexOf('#');
  if (hashIdx !== -1) {
    const codePart = line.substring(0, hashIdx);
    const commentPart = line.substring(hashIdx);
    return formatCodeTokens(codePart, mapInfo, pieData) + `<span class="tok-comment">${escapeHtml(commentPart)}</span>`;
  }
  return formatCodeTokens(line, mapInfo, pieData);
}

function formatCodeTokens(str, mapInfo, pieData) {
  if (mapInfo && mapInfo.type === 'poly' && pieData) {
    const poly = pieData.polygons[mapInfo.index];
    if (poly && poly.points && poly.points.length >= 3) {
      return formatPolyLineTokens(str, poly);
    }
  }

  const tokens = str.split(/(\s+)/);
  let html = '';
  let isFirstToken = true;

  for (let tok of tokens) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) {
      html += tok;
      continue;
    }

    const upper = tok.toUpperCase();
    if (isFirstToken && ['PIE', 'TYPE', 'TEXTURE', 'LEVELS', 'LEVEL', 'POINTS', 'NORMALS', 'POLYGONS', 'CONNECTORS', 'ANIMOBJECT', 'INTERPOLATE', 'TCMASK', 'NORMALMAP', 'SPECULARMAP'].includes(upper)) {
      html += `<span class="tok-cmd">${escapeHtml(tok)}</span>`;
      isFirstToken = false;
    } else if (['200', '10200', '4200'].includes(tok)) {
      html += `<span class="tok-flag">${escapeHtml(tok)}</span>`;
    } else if (!isNaN(parseFloat(tok))) {
      html += `<span class="tok-val">${escapeHtml(tok)}</span>`;
    } else {
      html += escapeHtml(tok);
    }
  }
  return html;
}

function formatPolyLineTokens(str, poly) {
  const tokens = str.split(/(\s+)/);
  const nonWs = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] && !/^\s+$/.test(tokens[i])) {
      nonWs.push({ text: tokens[i], idx: i });
    }
  }

  if (nonWs.length >= 5) {
    const npoints = parseInt(nonWs[1].text, 10) || 3;
    const ptStart = 2;
    let uvStart = ptStart + npoints;
    if (poly.anim) uvStart += 4;

    const classMap = {};
    for (let p = 0; p < npoints; p++) {
      const ptIdx = ptStart + p;
      if (ptIdx < nonWs.length) {
        classMap[nonWs[ptIdx].idx] = `tok-point-${p + 1}`;
      }
      const uIdx = uvStart + p * 2;
      const vIdx = uvStart + p * 2 + 1;
      if (uIdx < nonWs.length) classMap[nonWs[uIdx].idx] = `tok-uv-${p + 1}`;
      if (vIdx < nonWs.length) classMap[nonWs[vIdx].idx] = `tok-uv-${p + 1}`;
    }

    let html = '';
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!tok) continue;
      if (/^\s+$/.test(tok)) {
        html += tok;
        continue;
      }
      if (classMap[i]) {
        const cls = classMap[i];
        let tip = '';
        if (cls === 'tok-point-1') tip = 'Point 1 (Blue Dot)';
        else if (cls === 'tok-point-2') tip = 'Point 2 (Green Dot)';
        else if (cls === 'tok-point-3') tip = 'Point 3 (Red Dot)';
        else if (cls === 'tok-uv-1') tip = 'UV1 (Blue Dot)';
        else if (cls === 'tok-uv-2') tip = 'UV2 (Green Dot)';
        else if (cls === 'tok-uv-3') tip = 'UV3 (Red Dot)';
        html += `<span class="${cls}" title="${tip}">${escapeHtml(tok)}</span>`;
      } else if (i === nonWs[0].idx) {
        html += `<span class="tok-flag">${escapeHtml(tok)}</span>`;
      } else if (i === nonWs[1].idx) {
        html += `<span class="tok-val" style="color:var(--text-muted);">${escapeHtml(tok)}</span>`;
      } else if (!isNaN(parseFloat(tok))) {
        html += `<span class="tok-val">${escapeHtml(tok)}</span>`;
      } else {
        html += escapeHtml(tok);
      }
    }
    return html;
  }

  return formatCodeTokens(str);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * -------------------------------------------------------------
 * Bidirectional Hover Synchronization
 * -------------------------------------------------------------
 */
function onHoverFace(polyIndex, source, mouseEvent) {
  // When a polygon is pinned, hovering over other polygons has no effect!
  if (state.pinnedFaceIndex !== null) {
    if (source !== 'force' && source !== 'pin') {
      return;
    }
  }

  let targetIndex = polyIndex;
  if (polyIndex === null && state.pinnedFaceIndex !== null && source !== 'force') {
    targetIndex = state.pinnedFaceIndex;
  }

  if (state.hoveredFaceIndex === targetIndex && state.hoverSource === source && source !== 'force' && source !== 'pin') return;

  state.hoveredFaceIndex = targetIndex;
  if (source !== 'force') state.hoverSource = source;

  update3DHighlight(targetIndex);
  updateTextHighlight(targetIndex, source);
  updateTilesetHighlight(targetIndex, source);
  updateHUD(targetIndex, mouseEvent);
  updateUvEditToolbar();
}

function togglePinFace(polyIndex) {
  state.pinnedFaceIndex = polyIndex;
  showToast(`Pinned Face #${polyIndex} (Press Esc to unpin)`);
  onHoverFace(polyIndex, 'pin');
}

function update3DHighlight(polyIndex) {
  if (!mainMesh || polyIndex === null || !state.pieData) {
    highlightMesh.visible = false;
    highlightLine.visible = false;
    if (facePointDotsGroup) facePointDotsGroup.visible = false;
    return;
  }

  const poly = state.pieData.polygons[polyIndex];
  if (!poly) {
    highlightMesh.visible = false;
    highlightLine.visible = false;
    if (facePointDotsGroup) facePointDotsGroup.visible = false;
    return;
  }

  const p0 = state.pieData.points[poly.points[0]];
  const p1 = state.pieData.points[poly.points[1]];
  const p2 = state.pieData.points[poly.points[2]];

  if (!p0 || !p1 || !p2) return;

  const positions = new Float32Array([
    toViewportX(p0.x), p0.y, p0.z,
    toViewportX(p1.x), p1.y, p1.z,
    toViewportX(p2.x), p2.y, p2.z
  ]);

  highlightMesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  highlightMesh.geometry.computeVertexNormals();
  highlightMesh.visible = true;

  const linePositions = new Float32Array([
    toViewportX(p0.x), p0.y, p0.z,
    toViewportX(p1.x), p1.y, p1.z,
    toViewportX(p2.x), p2.y, p2.z
  ]);
  const lineColors = new Float32Array([
    0.231, 0.510, 0.965, // Pt 1: Blue (#3b82f6)
    0.133, 0.773, 0.369, // Pt 2: Green (#22c55e)
    0.937, 0.267, 0.267  // Pt 3: Red (#ef4444)
  ]);
  highlightLine.geometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  highlightLine.geometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  highlightLine.visible = true;

  if (facePointDotsGroup && facePointDots) {
    const pts = [p0, p1, p2];
    if (poly.points.length >= 4) {
      const p3 = state.pieData.points[poly.points[3]];
      if (p3) pts.push(p3);
    }

    facePointDots.forEach((dotObj, i) => {
      if (i < pts.length) {
        const pt = pts[i];
        dotObj.group.position.set(toViewportX(pt.x), pt.y, pt.z);
        dotObj.group.visible = true;
      } else {
        dotObj.group.visible = false;
      }
    });
    facePointDotsGroup.visible = true;
    updateFacePointDotsScale();
  }
}

/**
 * Dynamically resizes the Red/Green/Blue/Yellow face vertex dots according to camera zoom distance,
 * shrinking smoothly when zooming in closely so vertices remain distinct and never overwhelm the face.
 */
function updateFacePointDotsScale() {
  if (!facePointDotsGroup || !facePointDotsGroup.visible || !camera) return;

  for (let i = 0; i < facePointDots.length; i++) {
    const dotObj = facePointDots[i];
    if (!dotObj || !dotObj.group || !dotObj.group.visible) continue;

    const dist = camera.position.distanceTo(dotObj.group.position);
    // Smooth zoom-adaptive scaling
    let scale = dist / 220.0;
    scale = Math.max(0.08, Math.min(scale, 2.5));

    dotObj.group.scale.set(scale, scale, scale);
    if (dotObj.halo) {
      dotObj.halo.quaternion.copy(camera.quaternion);
    }
  }
}

/**
 * Dynamically resizes in-progress polygon creation vertex dots according to camera zoom distance
 */
function updateCreatePolyDotsScale() {
  if (!createPolyPreviewGroup || !camera) return;

  for (let i = 0; i < createPolyDots.length; i++) {
    const dotObj = createPolyDots[i];
    if (!dotObj || !dotObj.group || !dotObj.group.visible) continue;

    const dist = camera.position.distanceTo(dotObj.group.position);
    let scale = dist / 220.0;
    scale = Math.max(0.08, Math.min(scale, 2.5));

    dotObj.group.scale.set(scale, scale, scale);
    if (dotObj.halo) {
      dotObj.halo.quaternion.copy(camera.quaternion);
    }
  }
}

/**
 * Dynamically resizes the hovered / pinned vertex indicator in Vertices Mode
 */
function updateHoveredVertexMeshScale() {
  if (!hoveredVertexMesh || !hoveredVertexMesh.visible || !camera) return;
  const dist = camera.position.distanceTo(hoveredVertexMesh.position);
  let scale = dist / 220.0;
  scale = Math.max(0.08, Math.min(scale, 2.5));
  hoveredVertexMesh.scale.set(scale, scale, scale);
}

/**
 * Dynamically resizes primary model connector markers according to camera zoom
 */
function updateConnectorsScale() {
  if (!connectorsGroup || !connectorsGroup.visible || !camera) return;
  for (let i = 0; i < connectorsGroup.children.length; i++) {
    const marker = connectorsGroup.children[i];
    if (!marker || !marker.visible) continue;
    const dist = camera.position.distanceTo(marker.position);
    let scale = dist / 220.0;
    scale = Math.max(0.08, Math.min(scale, 2.5));
    marker.scale.set(scale, scale, scale);
  }
}

/**
 * Dynamically resizes secondary reference model connector markers according to camera zoom
 */
function updateRefConnectorsScale() {
  if (!state.refModel || !state.refModel.connectorsGroup || !state.refModel.group || !state.refModel.group.visible || !camera) return;
  const connGroup = state.refModel.connectorsGroup;
  if (!connGroup.visible) return;
  const groupPos = state.refModel.group.position;

  for (let i = 0; i < connGroup.children.length; i++) {
    const marker = connGroup.children[i];
    if (!marker || !marker.visible) continue;
    const worldPos = marker.position.clone().add(groupPos);
    const dist = camera.position.distanceTo(worldPos);
    let scale = dist / 220.0;
    scale = Math.max(0.08, Math.min(scale, 2.5));
    marker.scale.set(scale, scale, scale);
  }
}

function updateTextHighlight(polyIndex, source) {
  if (state.activeLineEl) {
    state.activeLineEl.classList.remove('active-face-line');
    state.activeLineEl = null;
  }

  if (polyIndex === null || !state.pieData) return;
  const poly = state.pieData.polygons[polyIndex];
  if (!poly) return;

  const lineEl = document.getElementById(`line-${poly.lineNum}`);
  if (lineEl) {
    lineEl.classList.add('active-face-line');
    state.activeLineEl = lineEl;

    if (source !== 'text') {
      lineEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function updateTilesetHighlight(polyIndex, source) {
  renderTileset();

  if (state.autoCenterUV && polyIndex !== null && source !== 'canvas' && state.textureImage && state.pieData) {
    const poly = state.pieData.polygons[polyIndex];
    if (poly && poly.normUVs && poly.normUVs.length >= 3) {
      const imgW = state.textureImage.naturalWidth || 1024;
      const imgH = state.textureImage.naturalHeight || 1024;
      const container = document.getElementById('tileset-canvas-container');
      const cw = container.clientWidth;
      const ch = container.clientHeight;

      const cu = (poly.normUVs[0].u + poly.normUVs[1].u + poly.normUVs[2].u) / 3;
      const cv = (poly.normUVs[0].v + poly.normUVs[1].v + poly.normUVs[2].v) / 3;
      const targetImgX = cu * imgW;
      const targetImgY = cv * imgH;

      state.tileset.panX = cw / 2 - targetImgX * state.tileset.zoom;
      state.tileset.panY = ch / 2 - targetImgY * state.tileset.zoom;
      renderTileset();
    }
  }
}

function updateHUD(polyIndex, mouseEvent) {
  if (polyIndex === null || !state.pieData) {
    if (state.mode === 'faces' || state.mode === 'edit_uv') {
      if (el.hudTooltip) el.hudTooltip.style.display = 'none';
      el.viewportStats.textContent = (state.mode === 'edit_uv') ? 'Edit UV Mode: Drag UV dots on tileset texture' : 'Faces Mode: Hover or click any polygon face to inspect';
      el.texHoverInfo.innerHTML = 'Hovered: <span class="highlight">None</span>';
    }
    return;
  }

  const poly = state.pieData.polygons[polyIndex];
  if (!poly) return;

  const isPinned = (state.pinnedFaceIndex === polyIndex);
  if (el.hudTooltip) el.hudTooltip.style.display = 'none';

  el.viewportStats.innerHTML = `Polygon #${polyIndex} (Line ${poly.lineNum})${isPinned ? ' <span style="color:#f87171;font-weight:bold;">[PINNED]</span>' : ''}`;
  el.texHoverInfo.innerHTML = `Hovered: <span class="highlight">Poly #${polyIndex} (Line ${poly.lineNum})${isPinned ? ' [PINNED]' : ''}</span>`;
}

/**
 * -------------------------------------------------------------
 * Vertices Mode Hover & Inspection Logic
 * -------------------------------------------------------------
 */
function onHoverVertex(vertIndex, source, mouseEvent) {
  if (state.pinnedVertexIndex !== null) {
    if (source !== 'force' && source !== 'pin') {
      return;
    }
  }

  let targetIndex = vertIndex;
  if (vertIndex === null && state.pinnedVertexIndex !== null && source !== 'force') {
    targetIndex = state.pinnedVertexIndex;
  }

  if (state.hoveredVertexIndex === targetIndex && state.hoverSource === source && source !== 'force' && source !== 'pin') return;

  state.hoveredVertexIndex = targetIndex;
  if (source !== 'force') state.hoverSource = source;

  update3DVertexHighlight(targetIndex);
  updateTextVertexHighlight(targetIndex, source);
  updateVertexHUD(targetIndex, mouseEvent);
}

function togglePinVertex(vertIndex) {
  state.pinnedVertexIndex = vertIndex;
  showToast(`Pinned Vertex #${vertIndex} (Press Esc to unpin)`);
  onHoverVertex(vertIndex, 'pin');
}

function update3DVertexHighlight(vertIndex) {
  if (!hoveredVertexMesh || vertIndex === null || !state.pieData || !state.pieData.points[vertIndex]) {
    if (hoveredVertexMesh) hoveredVertexMesh.visible = false;
    return;
  }

  const pt = state.pieData.points[vertIndex];
  hoveredVertexMesh.position.set(toViewportX(pt.x), pt.y, pt.z);
  hoveredVertexMesh.visible = true;
  updateHoveredVertexMeshScale();
}

function updateTextVertexHighlight(vertIndex, source) {
  if (state.activeVertexLineEl) {
    state.activeVertexLineEl.classList.remove('active-vertex-line');
    state.activeVertexLineEl = null;
  }
  if (state.relatedFaceLineEls && state.relatedFaceLineEls.length > 0) {
    state.relatedFaceLineEls.forEach(el => el.classList.remove('related-face-line'));
    state.relatedFaceLineEls = [];
  }

  if (vertIndex === null || !state.pieData || !state.pieData.points[vertIndex]) return;
  const pt = state.pieData.points[vertIndex];

  const lineEl = document.getElementById(`line-${pt.lineNum}`);
  if (lineEl) {
    lineEl.classList.add('active-vertex-line');
    state.activeVertexLineEl = lineEl;

    if (source !== 'text') {
      lineEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  if (pt.polygons && pt.polygons.length > 0) {
    for (const pIdx of pt.polygons) {
      const poly = state.pieData.polygons[pIdx];
      if (poly) {
        const pLine = document.getElementById(`line-${poly.lineNum}`);
        if (pLine) {
          pLine.classList.add('related-face-line');
          state.relatedFaceLineEls.push(pLine);
        }
      }
    }
  }
}

function updateVertexHUD(vertIndex, mouseEvent) {
  if (vertIndex === null || !state.pieData || !state.pieData.points[vertIndex]) {
    if (state.mode === 'vertices') {
      if (el.hudTooltip) el.hudTooltip.style.display = 'none';
      el.viewportStats.textContent = 'Vertices Mode: Hover over any vertex point in 3D or in POINTS block';
    }
    return;
  }

  const pt = state.pieData.points[vertIndex];
  const isPinned = (state.pinnedVertexIndex === vertIndex);
  if (el.hudTooltip) el.hudTooltip.style.display = 'none';

  el.viewportStats.innerHTML = `Vertex #${vertIndex} (Line ${pt.lineNum}) &mdash; (${pt.x}, ${pt.y}, ${pt.z})${isPinned ? ' <span style="color:#f87171;font-weight:bold;">[PINNED]</span>' : ''}`;
}

/**
 * -------------------------------------------------------------
 * Create Polygon Mode in 3D Viewport
 * -------------------------------------------------------------
 */
function resetCreatePolyState() {
  state.createPoly.selectedPoints = [];
  state.createPoly.hoveredPtIndex = null;
  updateCreatePolyUI();
  updateCreatePolyPreview();
}

function updateCreatePolyUI() {
  const pts = state.createPoly.selectedPoints;
  const count = pts.length;

  if (count === 0) {
    el.createPolyStep.textContent = 'Click 1st vertex in 3D viewport (0/3)';
    el.chipPt1Val.textContent = 'None';
    el.chipPt2Val.textContent = 'None';
    el.chipPt3Val.textContent = 'None';
    el.chipPt1.className = 'pt-chip';
    el.chipPt2.className = 'pt-chip';
    el.chipPt3.className = 'pt-chip';
  } else if (count === 1) {
    el.createPolyStep.textContent = `Pt 1 selected (P${pts[0]}). Click 2nd vertex (1/3)`;
    el.chipPt1Val.textContent = `P${pts[0]}`;
    el.chipPt2Val.textContent = 'None';
    el.chipPt3Val.textContent = 'None';
    el.chipPt1.className = 'pt-chip chip-active-blue';
    el.chipPt2.className = 'pt-chip';
    el.chipPt3.className = 'pt-chip';
  } else if (count === 2) {
    el.createPolyStep.textContent = `Pt 1: P${pts[0]}, Pt 2: P${pts[1]}. Click 3rd vertex to create face (2/3)`;
    el.chipPt1Val.textContent = `P${pts[0]}`;
    el.chipPt2Val.textContent = `P${pts[1]}`;
    el.chipPt3Val.textContent = 'None';
    el.chipPt1.className = 'pt-chip chip-active-blue';
    el.chipPt2.className = 'pt-chip chip-active-green';
    el.chipPt3.className = 'pt-chip';
  }
}

function updateCreatePolyPreview() {
  if (state.mode !== 'create_poly' || !state.pieData) {
    if (createPolyPreviewGroup) {
      createPolyDots.forEach(d => d.group.visible = false);
      if (createPolyLine) createPolyLine.visible = false;
      if (createPolyPreviewMesh) createPolyPreviewMesh.visible = false;
    }
    return;
  }

  const pts = state.createPoly.selectedPoints;
  const hovered = state.createPoly.hoveredPtIndex;

  // 1. Position dots for selected points
  createPolyDots.forEach((d, i) => {
    if (i < pts.length) {
      const ptObj = state.pieData.points[pts[i]];
      if (ptObj) {
        d.group.position.set(toViewportX(ptObj.x), ptObj.y, ptObj.z);
        d.group.visible = true;
      }
    } else {
      d.group.visible = false;
    }
  });
  updateCreatePolyDotsScale();

  // 2. Build preview line & mesh
  const previewCoords = [];
  for (let i = 0; i < pts.length; i++) {
    const ptObj = state.pieData.points[pts[i]];
    if (ptObj) previewCoords.push(ptObj);
  }
  if (hovered !== null && !pts.includes(hovered)) {
    const hObj = state.pieData.points[hovered];
    if (hObj) previewCoords.push(hObj);
  }

  if (previewCoords.length >= 2) {
    const linePoss = [];
    for (let i = 0; i < previewCoords.length; i++) {
      linePoss.push(toViewportX(previewCoords[i].x), previewCoords[i].y, previewCoords[i].z);
    }
    if (previewCoords.length === 3) {
      linePoss.push(toViewportX(previewCoords[0].x), previewCoords[0].y, previewCoords[0].z);
    }
    createPolyLine.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePoss), 3));
    createPolyLine.visible = true;

    if (previewCoords.length === 3) {
      const meshPoss = new Float32Array([
        toViewportX(previewCoords[0].x), previewCoords[0].y, previewCoords[0].z,
        toViewportX(previewCoords[1].x), previewCoords[1].y, previewCoords[1].z,
        toViewportX(previewCoords[2].x), previewCoords[2].y, previewCoords[2].z
      ]);
      createPolyPreviewMesh.geometry.setAttribute('position', new THREE.BufferAttribute(meshPoss, 3));
      createPolyPreviewMesh.geometry.computeVertexNormals();
      createPolyPreviewMesh.visible = true;
    } else {
      createPolyPreviewMesh.visible = false;
    }
  } else {
    createPolyLine.visible = false;
    createPolyPreviewMesh.visible = false;
  }
}

function onSelectPointForPoly(vertIndex) {
  if (state.mode !== 'create_poly' || !state.pieData) return;

  const pts = state.createPoly.selectedPoints;
  if (pts.includes(vertIndex)) {
    showToast(`Vertex P${vertIndex} is already selected in this polygon! Please pick distinct vertices.`);
    return;
  }

  pts.push(vertIndex);
  updateCreatePolyUI();
  updateCreatePolyPreview();

  if (pts.length === 3) {
    const p0 = pts[0];
    const p1 = pts[1];
    const p2 = pts[2];

    // Compute sensible initial UVs (center of texture)
    const imgW = state.textureImage ? (state.textureImage.naturalWidth || 256) : 256;
    const imgH = state.textureImage ? (state.textureImage.naturalHeight || 256) : 256;
    const isPie2 = (state.pieData.version < 3);

    const rawUVs = isPie2 ? [
      { u: Math.round(imgW * 0.25), v: Math.round(imgH * 0.25) },
      { u: Math.round(imgW * 0.75), v: Math.round(imgH * 0.25) },
      { u: Math.round(imgW * 0.50), v: Math.round(imgH * 0.75) }
    ] : [
      { u: 0.25, v: 0.25 },
      { u: 0.75, v: 0.25 },
      { u: 0.50, v: 0.75 }
    ];

    // Add polygon into PIE text with automatic winding validation
    const updatedText = PieParser.addPolygon(state.rawText, p0, p1, p2, rawUVs, '200', state.pieData ? state.pieData.points : null);
    state.rawText = updatedText;
    const newParsed = PieParser.parse(updatedText);
    state.pieData = newParsed;

    buildModelGeometry(newParsed);
    renderTextView(newParsed, updatedText);
    renderTileset();

    const newPolyIndex = newParsed.polygons.length - 1;
    state.pinnedFaceIndex = newPolyIndex;
    onHoverFace(newPolyIndex, 'force');

    showToast(`Created Polygon #${newPolyIndex} with vertices [P${p0}, P${p1}, P${p2}]!`);
    resetCreatePolyState();
  }
}

/**
 * -------------------------------------------------------------
 * Create Points Mode Logic (Snaps to 3D Reference Grid)
 * -------------------------------------------------------------
 */

/**
 * Dynamically resizes the preview point snapping cursor indicator according to:
 * 1. Camera zoom distance (shrinking as user zooms in closely for high-precision inspection)
 * 2. Fine grid sizes (scaling down on 1x1, 2x2, 4x4 grids to fit neatly at the grid intersections)
 */
function updateCreatePointIndicatorScale() {
  if (!createPointPreviewGroup || !createPointIndicatorGroup || !camera) return;
  if (!createPointPreviewGroup.visible) return;

  const gridSize = (state.grid && typeof state.grid.size === 'number') ? state.grid.size : 16;
  const dist = camera.position.distanceTo(createPointPreviewGroup.position);

  // Distance-based adaptive scale: ensures crisp and comfortable on-screen visibility at standard zoom
  let scale = dist / 220.0;

  // Grid-aware constraint for fine grids (especially 1x1, 2x2, 4x4, 8x8):
  // Prevent the preview sphere/crosshair from overlapping adjacent grid points or masking the fine grid cells
  if (gridSize <= 8) {
    const maxWorldRadius = Math.max(0.18, gridSize * 0.45);
    const maxScaleForGrid = maxWorldRadius / 3.0; // Base sphere radius is 3.0
    // When zooming in, scale down freely with distance; when zoomed out, cap at grid constraint
    scale = Math.min(scale, Math.max(0.02, maxScaleForGrid));
  }

  // Ensure healthy limits
  scale = Math.max(0.015, Math.min(scale, 2.5));
  createPointIndicatorGroup.scale.set(scale, scale, scale);
}

function updateCreatePointCursor(event) {
  if (!scene || !camera || !renderer) return;

  const yLevel = (state.grid && typeof state.grid.y === 'number') ? state.grid.y : 0;
  const gridPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yLevel);
  const intersectPoint = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(gridPlane, intersectPoint);

  if (hit) {
    const snapSize = (state.grid && state.grid.size) ? state.grid.size : 16;
    // intersectPoint.x is viewport space (X-mirrored vs PIE); convert to PIE for storage/display.
    const snappedXView = Math.round(intersectPoint.x / snapSize) * snapSize;
    const snappedX = toPieX(snappedXView);
    const snappedY = Math.round(yLevel);
    const snappedZ = Math.round(intersectPoint.z / snapSize) * snapSize;

    state.createPoint.currentPos = { x: snappedX, y: snappedY, z: snappedZ };
    state.createPoint.hasHit = true;

    if (createPointPreviewGroup) {
      createPointPreviewGroup.position.set(snappedXView, snappedY, snappedZ);
      createPointPreviewGroup.visible = true;

      // Adjust scale dynamically for current camera distance and grid size
      updateCreatePointIndicatorScale();

      if (createPointStem) {
        if (Math.abs(snappedY) > 0.5) {
          const stemGeo = createPointStem.geometry;
          const posAttr = stemGeo.attributes.position;
          posAttr.setXYZ(0, 0, 0, 0);
          posAttr.setXYZ(1, 0, -snappedY, 0);
          posAttr.needsUpdate = true;
          createPointStem.computeLineDistances();
          createPointStem.visible = true;
        } else {
          createPointStem.visible = false;
        }
      }
    }

    if (el.chipPointCoords) {
      el.chipPointCoords.textContent = `X: ${snappedX}, Y: ${snappedY}, Z: ${snappedZ}`;
    }
    if (el.chipPointSnap) {
      el.chipPointSnap.textContent = `${snapSize}u Grid (Y: ${snappedY})`;
    }
    if (el.viewportStats) {
      const nextPointIdx = state.pieData ? state.pieData.points.length : 0;
      el.viewportStats.textContent = `Point #${nextPointIdx} Preview: (${snappedX}, ${snappedY}, ${snappedZ}) [${snapSize}u Grid] — Click to place`;
    }
  } else {
    state.createPoint.hasHit = false;
    if (createPointPreviewGroup) {
      createPointPreviewGroup.visible = false;
    }
  }
}

function createNewPointAt(x, y, z) {
  if (!state.rawText) {
    showToast('No PIE model loaded.');
    return;
  }

  const result = PieParser.addPoint(state.rawText, x, y, z);
  state.rawText = result.text;
  if (el.textEditor) el.textEditor.value = result.text;

  try {
    const newParsed = PieParser.parse(result.text);
    state.pieData = newParsed;

    // Rebuild geometry, text view, and tileset
    buildModelGeometry(newParsed);
    renderTextView(newParsed, result.text);
    renderTileset();

    const newVertIndex = result.pointIndex;
    state.pinnedVertexIndex = newVertIndex;
    onHoverVertex(newVertIndex, 'pin');

    showToast(`Created Point #${newVertIndex} at (${x}, ${y}, ${z}) snapped to ${state.grid.size}u grid!`);

    if (el.createPointStep) {
      el.createPointStep.textContent = `Created Point #${newVertIndex} at (${x}, ${y}, ${z}). Click to place another!`;
    }
  } catch (err) {
    console.error('Error re-parsing PIE model after adding point:', err);
    showToast('Error adding new point.');
  }
}

/**
 * -------------------------------------------------------------
 * Transform Points Mode Logic (Select Vertices, Transform, Generate New Points)
 * All math runs in PIE data space; only markers/preview use viewport mapping.
 * Order per point: uniform scale in the 2D plane of the selection about the
 * pivot -> rotate (XYZ, degrees) about the pivot -> translate.
 * -------------------------------------------------------------
 */
function readTransformParams() {
  const num = (elm, def) => {
    if (!elm) return def;
    const v = parseFloat(elm.value);
    return Number.isFinite(v) ? v : def;
  };
  const byId = (id, def) => num(document.getElementById(id), def);
  return {
    s: byId('ts-s', 1),
    rx: byId('ts-rx', 0), ry: byId('ts-ry', 0), rz: byId('ts-rz', 0),
    tx: byId('ts-tx', 0), ty: byId('ts-ty', 0), tz: byId('ts-tz', 0),
    pivotMode: el.tsPivot ? el.tsPivot.value : 'centroid'
  };
}

function computeTransformPivot() {
  const sel = state.transform.selected;
  if (!state.pieData || sel.length === 0) return { x: 0, y: 0, z: 0 };
  const params = readTransformParams();
  if (params.pivotMode === 'origin') return { x: 0, y: 0, z: 0 };
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const idx of sel) {
    const pt = state.pieData.points[idx];
    if (!pt) continue;
    cx += pt.x; cy += pt.y; cz += pt.z; n++;
  }
  if (n === 0) return { x: 0, y: 0, z: 0 };
  return { x: cx / n, y: cy / n, z: cz / n };
}

const _transformEuler = { e: null, v: null };
// Plane normal from the first three non-collinear selected points.
// Returns a unit {x,y,z} or null when the selection is a single point,
// empty, or collinear (caller falls back to uniform 3D scaling).
function computeSelectionPlaneNormal() {
  if (!state.pieData || state.transform.selected.length < 3) return null;
  // Search all selected points for a non-collinear triple.
  const all = state.transform.selected
    .map(idx => state.pieData.points[idx])
    .filter(Boolean);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const ax = all[j].x - all[i].x, ay = all[j].y - all[i].y, az = all[j].z - all[i].z;
      for (let k = j + 1; k < all.length; k++) {
        const bx = all[k].x - all[i].x, by = all[k].y - all[i].y, bz = all[k].z - all[i].z;
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 1e-9) return { x: nx / len, y: ny / len, z: nz / len };
      }
    }
  }
  return null;
}

function applyTransformToPoint(pt, pivot, params, planeNormal) {
  if (!_transformEuler.e) {
    _transformEuler.e = new THREE.Euler(0, 0, 0, 'XYZ');
    _transformEuler.v = new THREE.Vector3();
  }
  const deg2rad = Math.PI / 180;
  _transformEuler.e.set(params.rx * deg2rad, params.ry * deg2rad, params.rz * deg2rad);

  // Uniform scale in the selection plane: scale the in-plane component only,
  // leaving the distance along the plane normal untouched. Without a valid
  // plane this degrades to uniform 3D scaling about the pivot.
  let dx = pt.x - pivot.x, dy = pt.y - pivot.y, dz = pt.z - pivot.z;
  if (planeNormal && params.s !== 1) {
    const along = dx * planeNormal.x + dy * planeNormal.y + dz * planeNormal.z;
    const k = params.s - 1;
    dx += k * (dx - along * planeNormal.x);
    dy += k * (dy - along * planeNormal.y);
    dz += k * (dz - along * planeNormal.z);
  } else if (params.s !== 1) {
    dx *= params.s; dy *= params.s; dz *= params.s;
  }

  _transformEuler.v.set(dx, dy, dz).applyEuler(_transformEuler.e);
  return {
    x: _transformEuler.v.x + pivot.x + params.tx,
    y: _transformEuler.v.y + pivot.y + params.ty,
    z: _transformEuler.v.z + pivot.z + params.tz
  };
}

function toggleTransformSelection(vertIndex) {
  if (!state.pieData || !state.pieData.points[vertIndex]) return;
  const sel = state.transform.selected;
  const at = sel.indexOf(vertIndex);
  if (at >= 0) {
    sel.splice(at, 1);
  } else {
    sel.push(vertIndex);
  }
  updateTransformSelectionColors();
  updateTransformPreview();
  updateTransformStats();
}

function clearTransformSelection() {
  state.transform.selected = [];
  state.transform.hoveredPtIndex = null;
  if (hoveredVertexMesh) hoveredVertexMesh.visible = false;
  resetPointCloudColors();
  updateTransformPreview();
  updateTransformStats();
}

function resetPointCloudColors() {
  if (!verticesPointCloud || !verticesPointCloud.geometry) return;
  const colAttr = verticesPointCloud.geometry.attributes.color;
  if (!colAttr) return;
  for (let i = 0; i < colAttr.count; i++) {
    colAttr.setXYZ(i, 0.22, 0.74, 0.97);
  }
  colAttr.needsUpdate = true;
}

function updateTransformSelectionColors() {
  if (!verticesPointCloud || !verticesPointCloud.geometry) return;
  const colAttr = verticesPointCloud.geometry.attributes.color;
  if (!colAttr || !state.pieData) return;
  const sel = new Set(state.transform.selected);
  const n = Math.min(colAttr.count, state.pieData.points.length);
  for (let i = 0; i < n; i++) {
    if (sel.has(i)) {
      colAttr.setXYZ(i, 1.0, 0.75, 0.1); // gold = selected
    } else {
      colAttr.setXYZ(i, 0.22, 0.74, 0.97); // cyan = unselected
    }
  }
  colAttr.needsUpdate = true;
}

function updateTransformPreview() {
  if (!transformPreviewGroup) return;
  const sel = state.transform.selected;
  if (state.mode !== 'transform' || !state.pieData || sel.length === 0) {
    transformPreviewGroup.visible = false;
    return;
  }

  const pivot = computeTransformPivot();
  const params = readTransformParams();
  const planeNormal = computeSelectionPlaneNormal();

  // Grow marker pool as needed (shared geometry/material)
  while (transformPreviewMarkers.length < sel.length) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(5.0, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.9, depthTest: false })
    );
    m.renderOrder = 10005;
    transformPreviewGroup.add(m);
    transformPreviewMarkers.push(m);
  }

  transformPreviewMarkers.forEach((m, i) => {
    if (i < sel.length) {
      const pt = state.pieData.points[sel[i]];
      if (pt) {
        const np = applyTransformToPoint(pt, pivot, params, planeNormal);
        m.position.set(toViewportX(np.x), np.y, np.z);
        m.visible = true;
      } else {
        m.visible = false;
      }
    } else {
      m.visible = false;
    }
  });
  transformPreviewGroup.visible = true;
}

function updateTransformStats() {
  const n = state.transform.selected.length;
  if (el.transformStep) {
    el.transformStep.textContent = `Click vertices in 3D viewport to select (${n} selected)`;
  }
  if (el.btnApplyTransform) {
    el.btnApplyTransform.textContent = n > 0 ? `Create ${n} point${n === 1 ? '' : 's'}` : 'Create points';
  }
  if (state.mode === 'transform' && el.viewportStats) {
    el.viewportStats.textContent = n > 0
      ? `Transform Mode: ${n} selected — adjust scale / rotate / move, then Create`
      : 'Transform Mode: Click vertices in 3D viewport to select';
  }
}

function applyTransformCreatePoints() {
  if (!state.pieData || !state.rawText) {
    showToast('No PIE model loaded.');
    return;
  }
  const sel = state.transform.selected.filter(idx => state.pieData.points[idx]);
  if (sel.length === 0) {
    showToast('Select at least one vertex first.');
    return;
  }

  const pivot = computeTransformPivot();
  const params = readTransformParams();
  const planeNormal = computeSelectionPlaneNormal();
  let text = state.rawText;
  let created = 0;
  for (const idx of sel) {
    const pt = state.pieData.points[idx];
    if (!pt) continue;
    const np = applyTransformToPoint(pt, pivot, params, planeNormal);
    const result = PieParser.addPoint(text, np.x, np.y, np.z);
    text = result.text;
    created++;
  }

  state.rawText = text;
  if (el.textEditor) el.textEditor.value = text;

  try {
    const newParsed = PieParser.parse(text);
    state.pieData = newParsed;
    buildModelGeometry(newParsed);
    renderTextView(newParsed, text);
    renderTileset();
    clearTransformSelection();
    showToast(`Created ${created} transformed point${created === 1 ? '' : 's'}!`);
  } catch (err) {
    console.error('Error re-parsing PIE model after transform:', err);
    showToast('Error creating transformed points.');
  }
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Scan all polygons in current PIE model and fix any inverted winding (swapping 2nd/3rd vertex & UVs)
 * to ensure outward-facing normals for game engine back-face culling.
 */
function fixAllPolygonWindingsAction() {
  if (!state.pieData) {
    showToast('No PIE model loaded.');
    return;
  }
  const { updatedText, fixedCount, zeroAreaCount } = PieParser.fixAllPolygonWindings(state.rawText, state.pieData);
  if (fixedCount > 0 || zeroAreaCount > 0) {
    state.rawText = updatedText;
    if (el.textEditor) el.textEditor.value = updatedText;
    try {
      const newParsed = PieParser.parse(updatedText);
      state.pieData = newParsed;
      buildModelGeometry(newParsed);
      renderTextView(newParsed, updatedText);
      renderTileset();
      showToast(`Corrected winding on ${fixedCount} face(s) to outward-facing normals!${zeroAreaCount > 0 ? ` (${zeroAreaCount} zero-area faces detected)` : ''}`);
    } catch (err) {
      console.error('Error re-parsing after winding fix:', err);
    }
  } else {
    showToast('All polygon windings are already correctly facing outward!');
  }
}

/**
 * Delete currently pinned polygon from PIE model and text
 */
function deletePinnedPolygon() {
  const polyIndex = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
  if (polyIndex === null || !state.pieData || !state.pieData.polygons[polyIndex]) {
    showToast('No polygon is currently selected to delete.');
    return;
  }

  const poly = state.pieData.polygons[polyIndex];
  const lineNum = poly.lineNum;
  const updatedText = PieParser.deletePolygon(state.rawText, lineNum, poly);
  state.rawText = updatedText;
  if (el.textEditor) el.textEditor.value = updatedText;

  // Unpin before rebuilding geometry
  state.pinnedFaceIndex = null;
  state.hoveredFaceIndex = null;

  try {
    const newParsed = PieParser.parse(updatedText);
    state.pieData = newParsed;
    buildModelGeometry(newParsed);
    renderTextView(newParsed, updatedText);
    renderTileset();
    onHoverFace(null, 'force');
    showToast(`Deleted Polygon #${polyIndex} (Line ${lineNum}) from PIE!`);
  } catch (err) {
    console.error('Error updating PIE after polygon deletion:', err);
    showToast('Deleted line, error rebuilding model: ' + err.message);
  }
}

/**
 * Delete currently pinned vertex from PIE model and text (in Vertices mode)
 */
function deletePinnedVertex() {
  if (state.pinnedVertexIndex === null || !state.pieData) {
    showToast('No vertex is currently selected/pinned to delete.');
    return;
  }

  const vertIndex = state.pinnedVertexIndex;
  const pt = state.pieData.points[vertIndex];
  if (!pt) return;

  const lineNum = pt.lineNum;
  const result = PieParser.deleteVertex(state.rawText, vertIndex, lineNum);
  const updatedText = typeof result === 'string' ? result : result.text;
  const delPolys = (typeof result === 'object' && result.deletedPolysCount) ? result.deletedPolysCount : 0;

  state.rawText = updatedText;
  if (el.textEditor) el.textEditor.value = updatedText;

  // Unpin before rebuilding geometry
  state.pinnedVertexIndex = null;
  state.hoveredVertexIndex = null;
  state.pinnedFaceIndex = null;
  state.hoveredFaceIndex = null;

  try {
    const newParsed = PieParser.parse(updatedText);
    state.pieData = newParsed;
    buildModelGeometry(newParsed);
    renderTextView(newParsed, updatedText);
    renderTileset();
    onHoverVertex(null, 'force');
    const polyMsg = delPolys > 0 ? ` and ${delPolys} referencing polygon${delPolys > 1 ? 's' : ''}` : '';
    showToast(`Deleted Vertex #${vertIndex} (Line ${lineNum})${polyMsg}`);
  } catch (err) {
    console.error('Error updating PIE after vertex deletion:', err);
    showToast('Deleted vertex line, error rebuilding model: ' + err.message);
  }
}

/**
 * -------------------------------------------------------------
 * UV Quick Actions & Toolbar Updates
 * -------------------------------------------------------------
 */
function updateUvEditToolbar() {
  if (!el.uvEditingPolyBadge) return;
  const activePolyIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
  if (activePolyIdx !== null && state.pieData) {
    const poly = state.pieData.polygons[activePolyIdx];
    if (poly) {
      el.uvEditingPolyBadge.innerHTML = `Editing <strong style="color:var(--accent-cyan);">Poly #${activePolyIdx}</strong> (Line ${poly.lineNum}) &mdash; Verts: [P${poly.points.join(', ')}]`;
      return;
    }
  }
  el.uvEditingPolyBadge.textContent = 'Select or hover a polygon to edit its UVs';
}

function applyUvTransformation(fn) {
  const activePolyIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
  if (activePolyIdx === null || !state.pieData || !state.textureImage) {
    showToast('Please select a polygon face first to transform its UVs');
    return;
  }

  const poly = state.pieData.polygons[activePolyIdx];
  if (!poly || !poly.normUVs) return;

  const imgW = state.textureImage.naturalWidth || 1024;
  const imgH = state.textureImage.naturalHeight || 1024;
  const isPie2 = (state.pieData.version < 3);

  fn(poly, imgW, imgH, isPie2);

  // Live update Three.js BufferGeometry UVs
  // Note: viewport geometry stores verts as (p0, p2, p1) due to the X-mirror winding swap.
  if (mainMesh && mainMesh.geometry && mainMesh.geometry.attributes.uv) {
    const uvAttr = mainMesh.geometry.attributes.uv;
    const baseUV = poly.globalIndex * 6;
    if (baseUV + 5 < uvAttr.array.length) {
      uvAttr.array[baseUV + 0] = poly.normUVs[0].u;
      uvAttr.array[baseUV + 1] = 1.0 - poly.normUVs[0].v;
      uvAttr.array[baseUV + 2] = poly.normUVs[2].u;
      uvAttr.array[baseUV + 3] = 1.0 - poly.normUVs[2].v;
      uvAttr.array[baseUV + 4] = poly.normUVs[1].u;
      uvAttr.array[baseUV + 5] = 1.0 - poly.normUVs[1].v;
      uvAttr.needsUpdate = true;
    }
  }

  // Update text & view
  const updatedText = PieParser.updatePolygonUVs(state.rawText, poly.lineNum, poly.rawUVs, poly);
  state.rawText = updatedText;
  if (el.textEditor) el.textEditor.value = updatedText;
  renderTextView(state.pieData, updatedText);
  renderTileset();
  updateHUD(activePolyIdx);
  showToast(`Updated UVs for Polygon #${activePolyIdx}`);
}

/**
 * -------------------------------------------------------------
 * Saved UV Values Library (Save & Apply UVs)
 * -------------------------------------------------------------
 */
function loadSavedUvPresetsFromStorage() {
  try {
    const raw = localStorage.getItem('wz_saved_uvs');
    if (raw) {
      state.savedUvs = JSON.parse(raw);
    } else {
      state.savedUvs = [];
    }
  } catch (err) {
    console.warn('Could not load saved UVs from localStorage', err);
    state.savedUvs = [];
  }
  renderSavedUvList();
}

function saveUvPresetsToStorage() {
  try {
    localStorage.setItem('wz_saved_uvs', JSON.stringify(state.savedUvs));
  } catch (err) {
    console.warn('Could not persist saved UVs to localStorage', err);
  }
}

function saveUvFromPinnedFace(customName = null) {
  const activePolyIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
  if (activePolyIdx === null || !state.pieData || !state.pieData.polygons[activePolyIdx]) {
    showToast('Please pin or click a face on the 3D model or in code first to save its UVs!');
    return;
  }

  const poly = state.pieData.polygons[activePolyIdx];
  if (!poly || !poly.normUVs || poly.normUVs.length < 3) {
    showToast('Could not extract UV coordinates for active face.');
    return;
  }

  const modelName = state.pieFilename || 'Model';
  const name = customName || `Poly #${activePolyIdx} UVs (${modelName})`;

  const newPreset = {
    id: 'uv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name,
    timestamp: Date.now(),
    textureName: state.textureName || '',
    pieFilename: state.pieFilename || '',
    polyIndex: activePolyIdx,
    points: [...poly.points],
    rawUVs: poly.rawUVs.map(uv => ({ u: uv.u, v: uv.v })),
    normUVs: poly.normUVs.map(uv => ({ u: uv.u, v: uv.v })),
    version: state.pieData.version || 2
  };

  state.savedUvs.unshift(newPreset);
  saveUvPresetsToStorage();
  renderSavedUvList();
  showToast(`Saved UV values for Polygon #${activePolyIdx}!`);
}

function applySavedUvPreset(presetId) {
  const preset = state.savedUvs.find(p => p.id === presetId);
  if (!preset) {
    showToast('Saved UV preset not found.');
    return;
  }

  const activePolyIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
  if (activePolyIdx === null || !state.pieData || !state.pieData.polygons || !state.pieData.polygons[activePolyIdx]) {
    showToast('Please click or pin a face on the 3D model or in code first to apply UVs!');
    return;
  }

  const poly = state.pieData.polygons[activePolyIdx];
  if (!poly || !poly.normUVs) return;

  const imgW = state.textureImage ? (state.textureImage.naturalWidth || 1024) : 1024;
  const imgH = state.textureImage ? (state.textureImage.naturalHeight || 1024) : 1024;
  const isPie2 = (state.pieData.version < 3);

  // Apply normalized and raw coordinates
  for (let i = 0; i < Math.min(poly.normUVs.length, preset.normUVs ? preset.normUVs.length : 3); i++) {
    if (preset.rawUVs && preset.rawUVs[i] !== undefined) {
      poly.rawUVs[i].u = preset.rawUVs[i].u;
      poly.rawUVs[i].v = preset.rawUVs[i].v;
      poly.normUVs[i].u = isPie2 ? (preset.rawUVs[i].u / imgW) : preset.rawUVs[i].u;
      poly.normUVs[i].v = isPie2 ? (preset.rawUVs[i].v / imgH) : preset.rawUVs[i].v;
    } else if (preset.normUVs && preset.normUVs[i] !== undefined) {
      poly.normUVs[i].u = preset.normUVs[i].u;
      poly.normUVs[i].v = preset.normUVs[i].v;
      poly.rawUVs[i].u = isPie2 ? Math.round(preset.normUVs[i].u * imgW) : parseFloat(preset.normUVs[i].u.toFixed(6));
      poly.rawUVs[i].v = isPie2 ? Math.round(preset.normUVs[i].v * imgH) : parseFloat(preset.normUVs[i].v.toFixed(6));
    }
  }

  // Update text with new raw UV values
  const updatedText = PieParser.updatePolygonUVs(state.rawText, poly.lineNum, poly.rawUVs, poly);
  state.rawText = updatedText;
  if (el.textEditor) el.textEditor.value = updatedText;

  // Re-parse and rebuild model geometry so PIE code & Viewport are 100% in sync
  try {
    const newParsed = PieParser.parse(updatedText);
    state.pieData = newParsed;
    buildModelGeometry(newParsed);
    renderTextView(newParsed, updatedText);
    renderTileset();
    
    // Maintain pinned state
    state.pinnedFaceIndex = activePolyIdx;
    onHoverFace(activePolyIdx, 'pin');

    updateHUD(activePolyIdx);
    updateUvEditToolbar();
    showToast(`Applied UV values from "${preset.name}" to Polygon #${activePolyIdx}!`);
  } catch (err) {
    console.error('Error re-parsing PIE code after UV update:', err);
    renderTextView(state.pieData, updatedText);
    renderTileset();
    updateHUD(activePolyIdx);
  }
}

function deleteSavedUvPreset(presetId) {
  state.savedUvs = state.savedUvs.filter(p => p.id !== presetId);
  saveUvPresetsToStorage();
  renderSavedUvList();
  showToast('Removed saved UV preset.');
}

function clearAllSavedUvPresets() {
  if (state.savedUvs.length === 0) return;
  state.savedUvs = [];
  saveUvPresetsToStorage();
  renderSavedUvList();
  showToast('Cleared all saved UV presets.');
}

function copySavedUvPreset(presetId) {
  const preset = state.savedUvs.find(p => p.id === presetId);
  if (!preset || !preset.rawUVs) return;

  const uvText = preset.rawUVs.map((uv, idx) => `UV${idx + 1}: (${uv.u}, ${uv.v})`).join('  ');
  navigator.clipboard.writeText(uvText).then(() => {
    showToast('Copied UV coordinates to clipboard!');
  });
}

function renderSavedUvList() {
  if (!el.savedUvList) return;
  if (el.savedUvCount) el.savedUvCount.textContent = state.savedUvs.length.toString();

  if (state.savedUvs.length === 0) {
    el.savedUvList.innerHTML = `
      <div class="saved-uv-empty">
        No saved UVs yet.<br>
        Pin a polygon face (in 3D or in code) and click <strong>"+ Save from Pinned"</strong> to save its UV coordinates.
      </div>
    `;
    return;
  }

  el.savedUvList.innerHTML = '';
  const frag = document.createDocumentFragment();

  state.savedUvs.forEach((preset) => {
    const isEditing = (state.editingUvPresetId === preset.id);
    const card = document.createElement('div');
    card.className = isEditing ? 'saved-uv-card saved-uv-edit-box' : 'saved-uv-card';
    card.dataset.presetId = preset.id;

    const uvs = preset.rawUVs || [];
    const uv0 = uvs[0] || { u: 0, v: 0 };
    const uv1 = uvs[1] || { u: 0, v: 0 };
    const uv2 = uvs[2] || { u: 0, v: 0 };

    if (isEditing) {
      // Edit Mode Form
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:700; color:var(--accent-cyan);">Edit Saved UV Values</span>
          <span style="font-size:10px; color:var(--text-muted);">${preset.version === 3 ? 'PIE 3 (Floats)' : 'PIE 2 (Pixels)'}</span>
        </div>
        <div>
          <input type="text" class="saved-uv-name-input edit-preset-name" value="${escapeHtml(preset.name)}" placeholder="Preset Name">
        </div>
        <div class="saved-uv-edit-grid">
          <div class="saved-uv-edit-point">
            <div class="saved-uv-edit-point-header">
              <span class="dot-indicator" style="background:#3b82f6; width:7px; height:7px; border-radius:50%;"></span>
              <span>Point 1 (UV1)</span>
            </div>
            <div class="saved-uv-input-row">
              <label>U:</label>
              <input type="number" step="any" class="saved-uv-coord-input edit-u0" value="${uv0.u}">
            </div>
            <div class="saved-uv-input-row">
              <label>V:</label>
              <input type="number" step="any" class="saved-uv-coord-input edit-v0" value="${uv0.v}">
            </div>
          </div>
          <div class="saved-uv-edit-point">
            <div class="saved-uv-edit-point-header">
              <span class="dot-indicator" style="background:#22c55e; width:7px; height:7px; border-radius:50%;"></span>
              <span>Point 2 (UV2)</span>
            </div>
            <div class="saved-uv-input-row">
              <label>U:</label>
              <input type="number" step="any" class="saved-uv-coord-input edit-u1" value="${uv1.u}">
            </div>
            <div class="saved-uv-input-row">
              <label>V:</label>
              <input type="number" step="any" class="saved-uv-coord-input edit-v1" value="${uv1.v}">
            </div>
          </div>
          <div class="saved-uv-edit-point">
            <div class="saved-uv-edit-point-header">
              <span class="dot-indicator" style="background:#ef4444; width:7px; height:7px; border-radius:50%;"></span>
              <span>Point 3 (UV3)</span>
            </div>
            <div class="saved-uv-input-row">
              <label>U:</label>
              <input type="number" step="any" class="saved-uv-coord-input edit-u2" value="${uv2.u}">
            </div>
            <div class="saved-uv-input-row">
              <label>V:</label>
              <input type="number" step="any" class="saved-uv-coord-input edit-v2" value="${uv2.v}">
            </div>
          </div>
        </div>
        <div class="saved-uv-actions">
          <button class="btn btn-xs btn-primary btn-save-edit" title="Save changes to this UV preset">&#x1F4BE; Save</button>
          <button class="btn btn-xs btn-cancel-edit" title="Cancel editing">Cancel</button>
        </div>
      `;

      const saveChanges = () => {
        const nameInput = card.querySelector('.edit-preset-name');
        const u0Input = card.querySelector('.edit-u0');
        const v0Input = card.querySelector('.edit-v0');
        const u1Input = card.querySelector('.edit-u1');
        const v1Input = card.querySelector('.edit-v1');
        const u2Input = card.querySelector('.edit-u2');
        const v2Input = card.querySelector('.edit-v2');

        const newName = nameInput ? nameInput.value.trim() : preset.name;
        const u0 = parseFloat(u0Input.value) || 0;
        const v0 = parseFloat(v0Input.value) || 0;
        const u1 = parseFloat(u1Input.value) || 0;
        const v1 = parseFloat(v1Input.value) || 0;
        const u2 = parseFloat(u2Input.value) || 0;
        const v2 = parseFloat(v2Input.value) || 0;

        preset.name = newName || preset.name;
        preset.rawUVs = [
          { u: u0, v: v0 },
          { u: u1, v: v1 },
          { u: u2, v: v2 }
        ];

        // Recalculate normalized UVs
        const imgW = state.textureImage ? (state.textureImage.naturalWidth || 1024) : 1024;
        const imgH = state.textureImage ? (state.textureImage.naturalHeight || 1024) : 1024;
        const isPie2 = (preset.version === undefined || preset.version < 3);

        preset.normUVs = preset.rawUVs.map(pt => ({
          u: isPie2 ? (pt.u / imgW) : pt.u,
          v: isPie2 ? (pt.v / imgH) : pt.v
        }));

        state.editingUvPresetId = null;
        state.editingUvFocusPoint = null;
        saveUvPresetsToStorage();
        renderSavedUvList();
        showToast(`Saved updated UV values for "${preset.name}"!`);
      };

      const btnSave = card.querySelector('.btn-save-edit');
      if (btnSave) btnSave.addEventListener('click', saveChanges);

      const btnCancel = card.querySelector('.btn-cancel-edit');
      if (btnCancel) {
        btnCancel.addEventListener('click', () => {
          state.editingUvPresetId = null;
          state.editingUvFocusPoint = null;
          renderSavedUvList();
        });
      }

      // Handle Enter and Escape keys in inputs
      card.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveChanges();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            state.editingUvPresetId = null;
            state.editingUvFocusPoint = null;
            renderSavedUvList();
          }
        });
      });

      // Auto-focus requested field if clicked directly from a chip
      setTimeout(() => {
        if (state.editingUvFocusPoint === 0) {
          const elU0 = card.querySelector('.edit-u0');
          if (elU0) elU0.focus();
        } else if (state.editingUvFocusPoint === 1) {
          const elU1 = card.querySelector('.edit-u1');
          if (elU1) elU1.focus();
        } else if (state.editingUvFocusPoint === 2) {
          const elU2 = card.querySelector('.edit-u2');
          if (elU2) elU2.focus();
        }
      }, 50);

    } else {
      // Normal Display View
      const uv0Str = `${uv0.u}, ${uv0.v}`;
      const uv1Str = `${uv1.u}, ${uv1.v}`;
      const uv2Str = `${uv2.u}, ${uv2.v}`;
      const timeStr = new Date(preset.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      card.innerHTML = `
        <div class="saved-uv-card-header">
          <span class="saved-uv-title" title="${escapeHtml(preset.name)}">${escapeHtml(preset.name)}</span>
          <span class="saved-uv-time">${timeStr}</span>
        </div>
        <div class="saved-uv-points-grid">
          <div class="saved-uv-point-chip chip-pt0" title="Click to edit Point 1 (UV1: ${uv0Str})">
            <span class="dot-indicator" style="background:#3b82f6;"></span>
            <span class="saved-uv-chip-label">UV1: ${escapeHtml(uv0Str)}</span>
          </div>
          <div class="saved-uv-point-chip chip-pt1" title="Click to edit Point 2 (UV2: ${uv1Str})">
            <span class="dot-indicator" style="background:#22c55e;"></span>
            <span class="saved-uv-chip-label">UV2: ${escapeHtml(uv1Str)}</span>
          </div>
          <div class="saved-uv-point-chip chip-pt2" title="Click to edit Point 3 (UV3: ${uv2Str})">
            <span class="dot-indicator" style="background:#ef4444;"></span>
            <span class="saved-uv-chip-label">UV3: ${escapeHtml(uv2Str)}</span>
          </div>
        </div>
        <div class="saved-uv-actions">
          <button class="btn btn-xs btn-primary btn-apply-saved-uv" title="Apply these UV coordinates to currently pinned face">&#x2714; Apply to Pinned</button>
          <button class="btn btn-xs btn-edit-saved-uv" title="Edit individual UV values for this preset">&#x270E; Edit</button>
          <button class="btn btn-xs btn-copy-saved-uv" title="Copy UV coordinate numbers to clipboard">&#x1F4CB; Copy</button>
          <button class="btn btn-xs btn-delete-saved-uv" title="Delete this saved UV preset" style="color:#ef4444;">&times;</button>
        </div>
      `;

      // Click on chip 0, 1, or 2 to immediately edit that point
      const chip0 = card.querySelector('.chip-pt0');
      if (chip0) {
        chip0.addEventListener('click', (e) => {
          e.stopPropagation();
          state.editingUvPresetId = preset.id;
          state.editingUvFocusPoint = 0;
          renderSavedUvList();
        });
      }

      const chip1 = card.querySelector('.chip-pt1');
      if (chip1) {
        chip1.addEventListener('click', (e) => {
          e.stopPropagation();
          state.editingUvPresetId = preset.id;
          state.editingUvFocusPoint = 1;
          renderSavedUvList();
        });
      }

      const chip2 = card.querySelector('.chip-pt2');
      if (chip2) {
        chip2.addEventListener('click', (e) => {
          e.stopPropagation();
          state.editingUvPresetId = preset.id;
          state.editingUvFocusPoint = 2;
          renderSavedUvList();
        });
      }

      const btnApply = card.querySelector('.btn-apply-saved-uv');
      if (btnApply) {
        btnApply.addEventListener('click', (e) => {
          e.stopPropagation();
          applySavedUvPreset(preset.id);
        });
      }

      const btnEdit = card.querySelector('.btn-edit-saved-uv');
      if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
          e.stopPropagation();
          state.editingUvPresetId = preset.id;
          state.editingUvFocusPoint = 0;
          renderSavedUvList();
        });
      }

      const btnCopy = card.querySelector('.btn-copy-saved-uv');
      if (btnCopy) {
        btnCopy.addEventListener('click', (e) => {
          e.stopPropagation();
          copySavedUvPreset(preset.id);
        });
      }

      const btnDel = card.querySelector('.btn-delete-saved-uv');
      if (btnDel) {
        btnDel.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteSavedUvPreset(preset.id);
        });
      }
    }

    frag.appendChild(card);
  });

  el.savedUvList.appendChild(frag);
}

/**
 * -------------------------------------------------------------
 * Mode Switcher
 * -------------------------------------------------------------
 */
function setInspectionMode(mode) {
  const wasTransform = state.mode === 'transform';
  state.mode = mode;
  if (el.btnModeFaces) el.btnModeFaces.classList.toggle('active', mode === 'faces');
  if (el.btnModeVertices) el.btnModeVertices.classList.toggle('active', mode === 'vertices');
  if (el.btnModeCreatePoly) el.btnModeCreatePoly.classList.toggle('active', mode === 'create_poly');
  if (el.btnModeCreatePoint) el.btnModeCreatePoint.classList.toggle('active', mode === 'create_point');
  if (el.btnModeTransform) el.btnModeTransform.classList.toggle('active', mode === 'transform');
  if (el.btnModeEditUV) el.btnModeEditUV.classList.toggle('active', mode === 'edit_uv');

  // Leaving Transform mode: hide its panel/preview and restore point colors
  if (wasTransform && mode !== 'transform') {
    if (el.transformBar) el.transformBar.style.display = 'none';
    if (transformPreviewGroup) transformPreviewGroup.visible = false;
    if (hoveredVertexMesh) hoveredVertexMesh.visible = false;
    resetPointCloudColors();
  }

  if (verticesPointCloud) {
    verticesPointCloud.visible = (mode === 'vertices' || mode === 'create_poly' || mode === 'create_point' || mode === 'transform');
  }

  if (mode === 'create_point') {
    if (el.createPointBar) el.createPointBar.style.display = 'flex';
    if (el.createPolyBar) el.createPolyBar.style.display = 'none';
    if (el.uvEditToolbar) el.uvEditToolbar.style.display = 'none';
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'crosshair';

    // Ensure ground grid is visible
    if (!state.grid.visible) {
      if (el.chkShowGrid) el.chkShowGrid.checked = true;
      updateGridHelper(state.grid.size, true, state.grid.y);
    }

    showToast(`Create Points Mode: Click on 3D grid plane (Y = ${state.grid.y}) to place vertices`);
    if (el.viewportStats) {
      el.viewportStats.textContent = `Create Points: Snap to ${state.grid.size}u grid at Y = ${state.grid.y} — Click to place`;
    }
  } else if (mode === 'create_poly') {
    if (el.createPointBar) el.createPointBar.style.display = 'none';
    if (createPointPreviewGroup) createPointPreviewGroup.visible = false;
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'default';
    el.createPolyBar.style.display = 'flex';
    el.uvEditToolbar.style.display = 'none';
    resetCreatePolyState();
    showToast('Create Polygon Mode: Click 3 points in 3D viewport');
    el.viewportStats.textContent = 'Create Poly Mode: Select 3 points on the 3D model';
  } else if (mode === 'transform') {
    if (el.createPointBar) el.createPointBar.style.display = 'none';
    if (createPointPreviewGroup) createPointPreviewGroup.visible = false;
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'default';
    el.createPolyBar.style.display = 'none';
    el.uvEditToolbar.style.display = 'none';
    if (el.transformBar) el.transformBar.style.display = 'flex';
    if (hoveredVertexMesh) hoveredVertexMesh.visible = false;
    updateTransformSelectionColors();
    updateTransformPreview();
    updateTransformStats();
    showToast('Transform Points Mode: Click vertices to select, then scale / rotate / move');
  } else if (mode === 'edit_uv') {
    if (el.createPointBar) el.createPointBar.style.display = 'none';
    if (createPointPreviewGroup) createPointPreviewGroup.visible = false;
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'default';
    el.createPolyBar.style.display = 'none';
    el.uvEditToolbar.style.display = 'flex';
    updateUvEditToolbar();
    showToast('Edit UV Mode: Click & drag UV handles directly on the texture');
    el.viewportStats.textContent = 'Edit UV Mode: Drag UV dots on tileset texture';
  } else {
    if (el.createPointBar) el.createPointBar.style.display = 'none';
    if (createPointPreviewGroup) createPointPreviewGroup.visible = false;
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'default';
    el.createPolyBar.style.display = 'none';
    el.uvEditToolbar.style.display = 'none';
    if (mode === 'vertices') {
      showToast('Switched to Vertices Mode (Inspect Points & Coordinates)');
      el.viewportStats.textContent = 'Vertices Mode: Hover or click any vertex point in 3D';
    } else {
      showToast('Switched to Faces Mode (Inspect Polygons & UVs)');
      el.viewportStats.textContent = 'Faces Mode: Hover or click any polygon face in 3D';
    }
  }

  updateCreatePolyPreview();
  renderTileset();
}

/**
 * -------------------------------------------------------------
 * Event Listeners & UI Controls
 * -------------------------------------------------------------
 */
function initEventListeners() {
  if (el.btnModeFaces) el.btnModeFaces.addEventListener('click', () => setInspectionMode('faces'));
  if (el.btnModeVertices) el.btnModeVertices.addEventListener('click', () => setInspectionMode('vertices'));
  if (el.btnModeCreatePoly) el.btnModeCreatePoly.addEventListener('click', () => setInspectionMode('create_poly'));
  if (el.btnModeCreatePoint) el.btnModeCreatePoint.addEventListener('click', () => setInspectionMode('create_point'));
  if (el.btnModeTransform) el.btnModeTransform.addEventListener('click', () => setInspectionMode('transform'));
  if (el.btnModeEditUV) el.btnModeEditUV.classList.toggle('active', false);

  if (el.btnResetCreatePoly) el.btnResetCreatePoly.addEventListener('click', () => resetCreatePolyState());
  if (el.btnExitCreatePoly) el.btnExitCreatePoly.addEventListener('click', () => setInspectionMode('faces'));
  if (el.btnExitCreatePoint) el.btnExitCreatePoint.addEventListener('click', () => setInspectionMode('vertices'));
  if (el.btnApplyTransform) el.btnApplyTransform.addEventListener('click', () => applyTransformCreatePoints());
  if (el.btnSelectAllTransform) el.btnSelectAllTransform.addEventListener('click', () => {
    if (!state.pieData) return;
    state.transform.selected = state.pieData.points.map((_, i) => i);
    updateTransformSelectionColors();
    updateTransformPreview();
    updateTransformStats();
  });
  if (el.btnClearTransform) el.btnClearTransform.addEventListener('click', () => clearTransformSelection());
  if (el.btnExitTransform) el.btnExitTransform.addEventListener('click', () => setInspectionMode('vertices'));
  ['ts-s', 'ts-rx', 'ts-ry', 'ts-rz', 'ts-tx', 'ts-ty', 'ts-tz'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.addEventListener('input', () => updateTransformPreview());
  });
  if (el.tsPivot) el.tsPivot.addEventListener('change', () => updateTransformPreview());
  if (el.btnFixWinding) el.btnFixWinding.addEventListener('click', () => fixAllPolygonWindingsAction());

  // 3D Viewport Ground Grid Controls
  if (el.chkShowGrid) {
    el.chkShowGrid.addEventListener('change', (e) => {
      const isVisible = e.target.checked;
      updateGridHelper(state.grid.size, isVisible);
      showToast(`Ground grid ${isVisible ? 'enabled' : 'hidden'}`);
    });
  }

  if (el.selGridSize) {
    el.selGridSize.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        if (el.inputCustomGrid) {
          el.inputCustomGrid.style.display = 'inline-block';
          el.inputCustomGrid.value = state.grid.size;
          el.inputCustomGrid.focus();
          el.inputCustomGrid.select();
        }
      } else {
        if (el.inputCustomGrid) {
          el.inputCustomGrid.style.display = 'none';
        }
        const newSize = parseInt(val, 10) || 16;
        if (el.chkShowGrid) el.chkShowGrid.checked = true;
        updateGridHelper(newSize, true);
        showToast(`Grid box size set to ${newSize}×${newSize} units`);
      }
    });
  }

  if (el.inputCustomGrid) {
    const handleCustomGridChange = () => {
      let val = parseInt(el.inputCustomGrid.value, 10);
      if (isNaN(val) || val < 1) val = 16;
      if (val > 2048) val = 2048;
      el.inputCustomGrid.value = val;
      if (el.chkShowGrid) el.chkShowGrid.checked = true;
      updateGridHelper(val, true);
      showToast(`Custom grid box size set to ${val}×${val} units`);
    };
    el.inputCustomGrid.addEventListener('change', handleCustomGridChange);
    el.inputCustomGrid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleCustomGridChange();
        el.inputCustomGrid.blur();
      }
    });
  }

  // Grid Y Elevation Controls (Shift grid up/down in coordinate units)
  const getStepDelta = (e) => {
    if (e.shiftKey) return 1;
    if (e.altKey) return 16;
    return 8;
  };

  if (el.btnGridYUp) {
    el.btnGridYUp.addEventListener('click', (e) => {
      const step = getStepDelta(e);
      setGridY(state.grid.y + step);
    });
  }

  if (el.btnGridYDown) {
    el.btnGridYDown.addEventListener('click', (e) => {
      const step = getStepDelta(e);
      setGridY(state.grid.y - step);
    });
  }

  if (el.btnGridYReset) {
    el.btnGridYReset.addEventListener('click', () => {
      setGridY(0);
      showToast('Grid elevation reset to Ground (Y = 0)');
    });
  }

  if (el.btnGridYSnap) {
    el.btnGridYSnap.addEventListener('click', () => {
      // 1. Try currently hovered or pinned vertex
      const vertIdx = state.hoveredVertexIndex !== null ? state.hoveredVertexIndex : state.pinnedVertexIndex;
      if (vertIdx !== null && state.pieData && state.pieData.points && state.pieData.points[vertIdx]) {
        const pt = state.pieData.points[vertIdx];
        setGridY(pt.y);
        showToast(`Grid snapped to Vertex #${vertIdx} (Y = ${pt.y})`);
        return;
      }

      // 2. Try currently hovered or pinned face
      const faceIdx = state.pinnedFaceIndex !== null ? state.pinnedFaceIndex : state.hoveredFaceIndex;
      if (faceIdx !== null && state.pieData && state.pieData.polygons && state.pieData.polygons[faceIdx]) {
        const poly = state.pieData.polygons[faceIdx];
        const pts = poly.points.map(idx => state.pieData.points[idx]).filter(Boolean);
        if (pts.length > 0) {
          const avgY = Math.round(pts.reduce((sum, p) => sum + p.y, 0) / pts.length);
          setGridY(avgY);
          showToast(`Grid snapped to Polygon #${faceIdx} (Y = ${avgY})`);
          return;
        }
      }

      // 3. Fallback: snap to connector elevation if present
      if (state.pieData && state.pieData.connectors && state.pieData.connectors.length > 0) {
        const connY = state.pieData.connectors[0].y;
        setGridY(connY);
        showToast(`Grid snapped to Connector #0 (Y = ${connY})`);
        return;
      }

      showToast('Select or hover a vertex or face to snap grid Y elevation');
    });
  }

  if (el.inputGridY) {
    const handleInputGridY = () => {
      let val = parseInt(el.inputGridY.value, 10);
      if (isNaN(val)) val = 0;
      setGridY(val, true);
    };

    el.inputGridY.addEventListener('change', handleInputGridY);
    el.inputGridY.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleInputGridY();
        el.inputGridY.blur();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const step = getStepDelta(e);
        setGridY(state.grid.y + step, false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const step = getStepDelta(e);
        setGridY(state.grid.y - step, false);
      }
    });

    el.inputGridY.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = getStepDelta(e);
      const dir = e.deltaY < 0 ? 1 : -1;
      setGridY(state.grid.y + dir * step, false);
    }, { passive: false });
  }

  // Snapping & UV Quick Actions
  if (el.chkSnapPixels) {
    el.chkSnapPixels.addEventListener('change', (e) => {
      state.uvEdit.snapToPixels = e.target.checked;
    });
  }

  if (el.btnUvFlipH) {
    el.btnUvFlipH.addEventListener('click', () => {
      applyUvTransformation((poly, imgW, imgH, isPie2) => {
        const uvs = poly.normUVs;
        const minU = Math.min(...uvs.map(p => p.u));
        const maxU = Math.max(...uvs.map(p => p.u));
        uvs.forEach((p, i) => {
          p.u = maxU - (p.u - minU);
          poly.rawUVs[i].u = isPie2 ? Math.round(p.u * 256.0) : parseFloat(p.u.toFixed(6));
        });
      });
    });
  }

  if (el.btnUvFlipV) {
    el.btnUvFlipV.addEventListener('click', () => {
      applyUvTransformation((poly, imgW, imgH, isPie2) => {
        const uvs = poly.normUVs;
        const minV = Math.min(...uvs.map(p => p.v));
        const maxV = Math.max(...uvs.map(p => p.v));
        uvs.forEach((p, i) => {
          p.v = maxV - (p.v - minV);
          poly.rawUVs[i].v = isPie2 ? Math.round(p.v * 256.0) : parseFloat(p.v.toFixed(6));
        });
      });
    });
  }

  if (el.btnUvRotCw) {
    el.btnUvRotCw.addEventListener('click', () => {
      applyUvTransformation((poly, imgW, imgH, isPie2) => {
        const uvs = poly.normUVs;
        const cu = (uvs[0].u + uvs[1].u + uvs[2].u) / 3;
        const cv = (uvs[0].v + uvs[1].v + uvs[2].v) / 3;
        uvs.forEach((p, i) => {
          const du = p.u - cu;
          const dv = p.v - cv;
          // Rotate 90 CW: newX = -y, newY = x
          p.u = Math.max(0, Math.min(1, cu - dv));
          p.v = Math.max(0, Math.min(1, cv + du));
          poly.rawUVs[i].u = isPie2 ? Math.round(p.u * 256.0) : parseFloat(p.u.toFixed(6));
          poly.rawUVs[i].v = isPie2 ? Math.round(p.v * 256.0) : parseFloat(p.v.toFixed(6));
        });
      });
    });
  }

  if (el.btnUvReset) {
    el.btnUvReset.addEventListener('click', () => {
      applyUvTransformation((poly, imgW, imgH, isPie2) => {
        poly.normUVs = [
          { u: 0.25, v: 0.25 },
          { u: 0.75, v: 0.25 },
          { u: 0.50, v: 0.75 }
        ];
        poly.rawUVs = [
          { u: isPie2 ? Math.round(256.0 * 0.25) : 0.25, v: isPie2 ? Math.round(256.0 * 0.25) : 0.25 },
          { u: isPie2 ? Math.round(256.0 * 0.75) : 0.75, v: isPie2 ? Math.round(256.0 * 0.25) : 0.25 },
          { u: isPie2 ? Math.round(256.0 * 0.50) : 0.50, v: isPie2 ? Math.round(256.0 * 0.75) : 0.75 }
        ];
      });
    });
  }

  // 3D Canvas pointer tracking to reliably detect clicks on polygons while ignoring rotation drags
  let pointerDownPos = { x: 0, y: 0 };
  let pointerDownTime = 0;

  if (renderer && renderer.domElement) {
    renderer.domElement.addEventListener('pointerdown', (event) => {
      pointerDownPos = { x: event.clientX, y: event.clientY };
      pointerDownTime = performance.now();
    });

    renderer.domElement.addEventListener('pointerup', (event) => {
      // Only process primary mouse button (left-click)
      if (event.button !== 0) return;

      const moveDist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
      const duration = performance.now() - pointerDownTime;

      // If mouse moved significantly (> 10px) or was dragged during camera rotation, ignore click
      if (moveDist > 10) return;
      if (duration > 500 && moveDist > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Ensure window and canvas have focus for keyboard shortcuts
      try {
        renderer.domElement.focus();
        window.focus();
      } catch (err) {
        // ignore
      }

      if (state.mode === 'create_point') {
        if (state.createPoint.hasHit && state.createPoint.currentPos) {
          const { x, y, z } = state.createPoint.currentPos;
          createNewPointAt(x, y, z);
        }
        return;
      }

      if (state.mode === 'create_poly') {
        const hitIdx = (state.createPoly.hoveredPtIndex !== null)
          ? state.createPoly.hoveredPtIndex
          : getClosestVertexToMouse(event, 36);
        if (hitIdx !== null) {
          onSelectPointForPoly(hitIdx);
        }
        return;
      }

      if (state.mode === 'vertices') {
        const hitIdx = (state.hoveredVertexIndex !== null)
          ? state.hoveredVertexIndex
          : getClosestVertexToMouse(event, 32);
        if (hitIdx !== null) {
          togglePinVertex(hitIdx);
          return;
        }
        return;
      }

      if (state.mode === 'transform') {
        const hitIdx = (state.transform.hoveredPtIndex !== null)
          ? state.transform.hoveredPtIndex
          : getClosestVertexToMouse(event, 32);
        if (hitIdx !== null) {
          toggleTransformSelection(hitIdx);
        }
        return;
      }

      // Faces or Edit UV mode: pin polygon on click
      if (mainMesh) {
        const intersects = raycaster.intersectObject(mainMesh);
        if (intersects.length > 0) {
          const faceIdx = intersects[0].faceIndex;
          if (typeof faceIdx === 'number' && state.pieData && faceIdx < state.pieData.polygons.length) {
            togglePinFace(faceIdx);
            return;
          }
        }
      }
    });
  }

  // Tileset Canvas click (unpin by Esc only)
  if (tilesetCanvas) {
    tilesetCanvas.addEventListener('click', () => {
      // Unpin is handled by Esc key only
    });
  }

  // Keyboard Shortcuts: Delete/Del/Backspace to delete pinned polygon/vertex, Escape to unpin
  function handleGlobalKeyDown(e) {
    // Skip shortcut processing only if actively typing inside an open text input or editable text area
    if (state.isEditMode && e.target === el.textEditor) {
      return;
    }
    if (e.target && e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'search')) {
      return;
    }

    const isDelKey = (
      e.key === 'Delete' ||
      e.key === 'Del' ||
      e.key === 'Backspace' ||
      e.code === 'Delete' ||
      e.code === 'Backspace' ||
      e.code === 'NumpadDecimal' ||
      e.keyCode === 46 ||
      e.keyCode === 8
    );

    if (isDelKey) {
      if (state.mode === 'vertices') {
        const vIdx = (state.pinnedVertexIndex !== null) ? state.pinnedVertexIndex : state.hoveredVertexIndex;
        if (vIdx !== null) {
          e.preventDefault();
          e.stopPropagation();
          deletePinnedVertex();
          return;
        }
      } else {
        const fIdx = (state.pinnedFaceIndex !== null) ? state.pinnedFaceIndex : state.hoveredFaceIndex;
        if (fIdx !== null) {
          e.preventDefault();
          e.stopPropagation();
          deletePinnedPolygon();
          return;
        }
      }
    }

    if (e.key === 'Escape' || e.keyCode === 27) {
      if (state.mode === 'create_point') {
        setInspectionMode('vertices');
        showToast('Exited Create Points mode');
        return;
      }
      if (state.mode === 'transform' && state.transform.selected.length > 0) {
        clearTransformSelection();
        showToast('Transform selection cleared');
        return;
      }
      if (state.mode === 'create_poly' && state.createPoly.selectedPoints.length > 0) {
        resetCreatePolyState();
        showToast('Create polygon selection reset');
      } else {
        const wasPinned = (state.pinnedFaceIndex !== null || state.pinnedVertexIndex !== null);
        state.pinnedFaceIndex = null;
        state.pinnedVertexIndex = null;
        onHoverFace(null, 'force');
        onHoverVertex(null, 'force');
        if (wasPinned) {
          showToast('Selection unpinned');
        }
      }
    }
  }

  window.addEventListener('keydown', handleGlobalKeyDown, true);
  document.addEventListener('keydown', handleGlobalKeyDown, true);

  // Tileset controls
  el.chkShowAllUVs.addEventListener('change', (e) => {
    state.showAllUVs = e.target.checked;
    renderTileset();
  });

  el.chkAutoCenterUV.addEventListener('change', (e) => {
    state.autoCenterUV = e.target.checked;
  });

  el.btnZoomIn.addEventListener('click', () => {
    state.tileset.zoom = Math.min(15, state.tileset.zoom * 1.3);
    updateTilesetZoomStat();
    renderTileset();
  });

  el.btnZoomOut.addEventListener('click', () => {
    state.tileset.zoom = Math.max(0.1, state.tileset.zoom * 0.7);
    updateTilesetZoomStat();
    renderTileset();
  });

  el.btnZoomFit.addEventListener('click', () => {
    fitTilesetToView();
  });

  el.btnZoom100.addEventListener('click', () => {
    state.tileset.zoom = 1.0;
    state.tileset.panX = 20;
    state.tileset.panY = 20;
    updateTilesetZoomStat();
    renderTileset();
  });

  // Text View / Edit mode toggle
  el.btnToggleEdit.addEventListener('click', () => {
    state.isEditMode = !state.isEditMode;
    if (state.isEditMode) {
      el.textViewerContainer.style.display = 'none';
      el.textEditor.style.display = 'block';
      el.btnToggleEdit.textContent = 'View';
      el.btnApplyText.style.display = 'inline-flex';
    } else {
      el.textViewerContainer.style.display = 'block';
      el.textEditor.style.display = 'none';
      el.btnToggleEdit.textContent = 'Edit';
      el.btnApplyText.style.display = 'none';
    }
  });

  // Apply Changes from text editor
  el.btnApplyText.addEventListener('click', () => {
    try {
      let text = el.textEditor.value;
      // Always verify and correct section counts after a manual edit
      const { text: fixedText, corrections } = PieParser.fixSectionCounts(text);
      if (corrections.length > 0) {
        text = fixedText;
        el.textEditor.value = fixedText;
      }
      const parsed = PieParser.parse(text);
      state.pieData = parsed;
      state.rawText = text;
      buildModelGeometry(parsed);
      renderTextView(parsed, text);
      renderTileset();
      const fixMsg = corrections.length > 0
        ? ` (corrected ${corrections.map(c => `${c.section} ${c.from === null ? '?' : c.from}→${c.to}`).join(', ')})`
        : '';
      showToast(`Model updated! (${parsed.points.length} pts, ${parsed.polygons.length} polys)${fixMsg}`);
    } catch (err) {
      console.error(err);
      showToast('Error parsing PIE file: ' + err.message);
    }
  });

  // Copy text to clipboard
  el.btnCopyText.addEventListener('click', () => {
    navigator.clipboard.writeText(state.rawText).then(() => {
      showToast('PIE text copied to clipboard!');
    });
  });

  // Download current PIE file
  if (el.btnDownloadPie) {
    el.btnDownloadPie.addEventListener('click', () => {
      if (!state.rawText) {
        showToast('No PIE model loaded to download.');
        return;
      }
      const blob = new Blob([state.rawText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = state.pieFilename || 'model.pie';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${a.download}`);
    });
  }

  // Open Local Files
  el.btnOpenPie.addEventListener('click', () => el.fileInputPie.click());
  el.fileInputPie.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      loadPieTextContent(evt.target.result, file.name);
    };
    reader.readAsText(file);
  });

  el.btnOpenTex.addEventListener('click', () => el.fileInputTex.click());
  el.fileInputTex.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    state.textureName = file.name;
    el.texFilename.textContent = file.name;
    loadTextureImage(url, () => URL.revokeObjectURL(url));
  });

  // Repository Model Selection
  if (el.modelSelect) {
    el.modelSelect.addEventListener('change', (e) => {
      const selectedPiePath = e.target.value;
      if (selectedPiePath) {
        state.selectedModelPath = selectedPiePath;
        loadModelFromPath(selectedPiePath);
      }
    });
  }

  // Model Filter Search Input (Searches PIE by filename and in-game structure/weapon/propulsion name)
  if (el.modelSearchInput) {
    el.modelSearchInput.addEventListener('input', (e) => {
      const query = e.target.value;
      if (el.btnClearModelSearch) {
        el.btnClearModelSearch.style.display = query.trim() ? 'block' : 'none';
      }
      populateModelDropdown(state.allModels, query);
      renderSearchSuggestions(query);
    });

    el.modelSearchInput.addEventListener('focus', () => {
      if (el.modelSearchInput.value.trim()) {
        renderSearchSuggestions(el.modelSearchInput.value);
      }
    });

    el.modelSearchInput.addEventListener('keydown', (e) => {
      const items = el.modelSearchSuggestions
        ? Array.from(el.modelSearchSuggestions.querySelectorAll('.search-suggestion-item'))
        : [];

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length > 0) {
          activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
          updateActiveSuggestionHighlight(items);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length > 0) {
          activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
          updateActiveSuggestionHighlight(items);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items.length > 0 && activeSuggestionIndex >= 0 && activeSuggestionIndex < items.length) {
          const selectedItem = items[activeSuggestionIndex];
          const path = selectedItem.dataset.path;
          const matchedModel = (state.allModels || []).find(m => (m.piePath || m.path) === path);
          if (matchedModel) {
            selectModelFromSuggestion(matchedModel);
            return;
          }
        }

        // Fallback: pick first match or value from modelSelect
        if (el.modelSelect && el.modelSelect.value) {
          state.selectedModelPath = el.modelSelect.value;
          loadModelFromPath(el.modelSelect.value);
          if (el.modelSearchSuggestions) el.modelSearchSuggestions.style.display = 'none';
        }
      } else if (e.key === 'Escape') {
        if (el.modelSearchSuggestions && el.modelSearchSuggestions.style.display !== 'none') {
          el.modelSearchSuggestions.style.display = 'none';
        } else {
          el.modelSearchInput.value = '';
          if (el.btnClearModelSearch) el.btnClearModelSearch.style.display = 'none';
          populateModelDropdown(state.allModels, '');
        }
      }
    });
  }

  if (el.btnClearModelSearch) {
    el.btnClearModelSearch.addEventListener('click', () => {
      if (el.modelSearchInput) {
        el.modelSearchInput.value = '';
        el.modelSearchInput.focus();
      }
      el.btnClearModelSearch.style.display = 'none';
      if (el.modelSearchSuggestions) el.modelSearchSuggestions.style.display = 'none';
      populateModelDropdown(state.allModels, '');
    });
  }

  // Close search suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (el.modelSearchSuggestions && el.modelSearchSuggestions.style.display !== 'none') {
      const container = document.querySelector('.search-box-container');
      if (container && !container.contains(e.target)) {
        el.modelSearchSuggestions.style.display = 'none';
      }
    }
  });

  // Hotkey "/" or "Ctrl+F" to quickly search structures and PIE files
  window.addEventListener('keydown', (e) => {
    if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) &&
        e.target !== el.modelSearchInput &&
        e.target !== el.textEditor &&
        !(e.target && e.target.tagName === 'INPUT')) {
      e.preventDefault();
      if (el.modelSearchInput) {
        el.modelSearchInput.focus();
        el.modelSearchInput.select();
      }
    }
  });

  // Random Model Button
  if (el.btnRandomModel) {
    el.btnRandomModel.addEventListener('click', () => {
      if (!state.allModels || state.allModels.length === 0) return;
      const randIdx = Math.floor(Math.random() * state.allModels.length);
      const chosen = state.allModels[randIdx];
      if (chosen && chosen.piePath) {
        state.selectedModelPath = chosen.piePath;
        if (el.modelSelect) el.modelSelect.value = chosen.piePath;
        loadModelFromPath(chosen.piePath);
        showToast(`Loaded random model: ${chosen.filename} (${chosen.category})`);
      }
    });
  }

  // Custom Path Modal
  if (el.btnCustomPath && el.pathModal) {
    el.btnCustomPath.addEventListener('click', () => {
      el.pathModal.style.display = 'flex';
      if (el.inputCustomModelPath) el.inputCustomModelPath.focus();
    });
  }

  if (el.btnClosePathModal && el.pathModal) {
    el.btnClosePathModal.addEventListener('click', () => {
      el.pathModal.style.display = 'none';
    });
  }

  if (el.pathModal) {
    el.pathModal.addEventListener('click', (e) => {
      if (e.target === el.pathModal) {
        el.pathModal.style.display = 'none';
      }
    });

    // Preset quick chips
    el.pathModal.querySelectorAll('.quick-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const p = e.target.getAttribute('data-path');
        if (p) {
          if (el.inputCustomModelPath) el.inputCustomModelPath.value = p;
          el.pathModal.style.display = 'none';
          state.selectedModelPath = p;
          loadModelFromPath(p);
        }
      });
    });
  }

  if (el.btnLoadCustomPath) {
    el.btnLoadCustomPath.addEventListener('click', () => {
      const p = (el.inputCustomModelPath && el.inputCustomModelPath.value) ? el.inputCustomModelPath.value.trim() : '';
      if (p) {
        if (el.pathModal) el.pathModal.style.display = 'none';
        state.selectedModelPath = p;
        loadModelFromPath(p);
      }
    });
  }

  // Repository Live Sync Button
  if (el.btnSyncRepo) {
    el.btnSyncRepo.addEventListener('click', () => syncWithRepository());
  }

  // Tileset Selection Change
  if (el.tilesetSelect) {
    el.tilesetSelect.addEventListener('change', (e) => {
      const chosenTex = e.target.value;
      if (chosenTex) {
        switchTileset(chosenTex);
      }
    });
  }

  // Apply Selected Tileset to PIE directive
  if (el.btnApplyTilesetToPie) {
    el.btnApplyTilesetToPie.addEventListener('click', () => applySelectedTilesetToPie());
  }

  // Saved UV Library Buttons
  if (el.btnSaveUvPinned) el.btnSaveUvPinned.addEventListener('click', () => saveUvFromPinnedFace());
  if (el.btnUvSavePreset) el.btnUvSavePreset.addEventListener('click', () => saveUvFromPinnedFace());
  if (el.btnClearSavedUvs) el.btnClearSavedUvs.addEventListener('click', () => clearAllSavedUvPresets());

  // Secondary Visual Reference Model Controls
  if (el.btnOpenRefModal && el.refModal) {
    el.btnOpenRefModal.addEventListener('click', () => {
      el.refModal.style.display = 'flex';
      if (el.refSearchInput) el.refSearchInput.focus();
    });
  }

  if (el.btnCloseRefModal && el.refModal) {
    el.btnCloseRefModal.addEventListener('click', () => {
      el.refModal.style.display = 'none';
    });
  }

  if (el.refModal) {
    el.refModal.addEventListener('click', (e) => {
      if (e.target === el.refModal) el.refModal.style.display = 'none';
    });

    // Reference quick preset chips
    el.refModal.querySelectorAll('.ref-quick-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const p = btn.getAttribute('data-path');
        if (p) {
          loadReferencePieFromPath(p);
        }
      });
    });
  }

  if (el.btnRefChangeModel && el.refModal) {
    el.btnRefChangeModel.addEventListener('click', () => {
      el.refModal.style.display = 'flex';
      if (el.refSearchInput) el.refSearchInput.focus();
    });
  }

  if (el.btnRefClear) {
    el.btnRefClear.addEventListener('click', () => clearReferenceModel());
  }

  if (el.btnModalClearRef) {
    el.btnModalClearRef.addEventListener('click', () => clearReferenceModel());
  }

  if (el.btnRefToggleVisible) {
    el.btnRefToggleVisible.addEventListener('click', () => toggleReferenceVisibility());
  }

  if (el.sliderRefOpacity) {
    el.sliderRefOpacity.addEventListener('input', (e) => {
      state.refModel.opacity = parseFloat(e.target.value) / 100;
      if (el.refOpacityVal) el.refOpacityVal.textContent = `${e.target.value}%`;
      updateReferenceModelMaterial();
    });
  }

  if (el.selRefShading) {
    el.selRefShading.addEventListener('change', (e) => {
      state.refModel.shading = e.target.value;
      updateReferenceModelMaterial();
    });
  }

  if (el.btnRefResetOffset) {
    el.btnRefResetOffset.addEventListener('click', () => setReferenceOffset(0, 0, 0));
  }

  if (el.btnRefSnapConn) {
    el.btnRefSnapConn.addEventListener('click', () => snapReferenceToPrimaryConnector());
  }

  if (el.inputRefOffX) {
    el.inputRefOffX.addEventListener('input', (e) => setReferenceOffset(e.target.value, state.refModel.offsetY, state.refModel.offsetZ));
  }
  if (el.inputRefOffY) {
    el.inputRefOffY.addEventListener('input', (e) => setReferenceOffset(state.refModel.offsetX, e.target.value, state.refModel.offsetZ));
  }
  if (el.inputRefOffZ) {
    el.inputRefOffZ.addEventListener('input', (e) => setReferenceOffset(state.refModel.offsetX, state.refModel.offsetY, e.target.value));
  }

  if (el.btnBrowseRefFile && el.fileInputRefPie) {
    el.btnBrowseRefFile.addEventListener('click', () => el.fileInputRefPie.click());
  }

  if (el.fileInputRefPie) {
    el.fileInputRefPie.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        loadReferencePieFromText(evt.target.result, file.name);
      };
      reader.readAsText(file);
    });
  }

  if (el.refModelSelect) {
    el.refModelSelect.addEventListener('change', (e) => {
      const p = e.target.value;
      if (p) {
        loadReferencePieFromPath(p);
      }
    });
  }

  if (el.refSearchInput) {
    el.refSearchInput.addEventListener('input', (e) => {
      const q = e.target.value;
      if (el.btnClearRefSearch) el.btnClearRefSearch.style.display = q.trim() ? 'block' : 'none';
      populateRefModelDropdown(state.allModels, q);
      renderRefSearchSuggestions(q);
    });

    el.refSearchInput.addEventListener('focus', () => {
      if (el.refSearchInput.value.trim()) {
        renderRefSearchSuggestions(el.refSearchInput.value);
      }
    });

    el.refSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (el.refSearchSuggestions && el.refSearchSuggestions.style.display !== 'none') {
          el.refSearchSuggestions.style.display = 'none';
        }
      }
    });
  }

  if (el.btnClearRefSearch) {
    el.btnClearRefSearch.addEventListener('click', () => {
      if (el.refSearchInput) {
        el.refSearchInput.value = '';
        el.refSearchInput.focus();
      }
      el.btnClearRefSearch.style.display = 'none';
      if (el.refSearchSuggestions) el.refSearchSuggestions.style.display = 'none';
      populateRefModelDropdown(state.allModels, '');
    });
  }

  // Drag & drop files onto window
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of e.dataTransfer.files) {
        if (file.name.toLowerCase().endsWith('.pie')) {
          const reader = new FileReader();
          reader.onload = (evt) => loadPieTextContent(evt.target.result, file.name);
          reader.readAsText(file);
        } else if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.png')) {
          const url = URL.createObjectURL(file);
          state.textureName = file.name;
          el.texFilename.textContent = file.name;
          loadTextureImage(url, () => URL.revokeObjectURL(url));
        }
      }
    }
  });
}

/**
 * -------------------------------------------------------------
 * Split Pane Resizing
 * -------------------------------------------------------------
 */
function initSplitResizers() {
  const gutterH = document.getElementById('gutter-h');
  const leftPane = document.getElementById('left-pane');
  const mainSplit = document.getElementById('main-split');

  let isResizingH = false;

  gutterH.addEventListener('mousedown', (e) => {
    isResizingH = true;
    gutterH.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
  });

  const gutterV = document.getElementById('gutter-v');
  const viewportBox = document.getElementById('viewport-box');
  const rightPane = document.getElementById('right-pane');

  let isResizingV = false;

  gutterV.addEventListener('mousedown', (e) => {
    isResizingV = true;
    gutterV.classList.add('resizing');
    document.body.style.cursor = 'row-resize';
  });

  // Resizer for Saved UV Box inside left pane
  const gutterSavedUv = document.getElementById('gutter-saved-uv');
  const savedUvBox = document.getElementById('saved-uv-box');
  let isResizingSavedUv = false;

  if (gutterSavedUv && savedUvBox) {
    gutterSavedUv.addEventListener('mousedown', (e) => {
      isResizingSavedUv = true;
      gutterSavedUv.classList.add('resizing');
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (isResizingH) {
      const splitRect = mainSplit.getBoundingClientRect();
      const newWidth = e.clientX - splitRect.left;
      if (newWidth >= 250 && newWidth <= splitRect.width - 300) {
        leftPane.style.width = newWidth + 'px';
        handle3DResize();
        renderTileset();
      }
    } else if (isResizingV) {
      const rightRect = rightPane.getBoundingClientRect();
      const newHeight = e.clientY - rightRect.top;
      if (newHeight >= 150 && newHeight <= rightRect.height - 150) {
        viewportBox.style.height = newHeight + 'px';
        handle3DResize();
        renderTileset();
      }
    } else if (isResizingSavedUv && savedUvBox) {
      const leftRect = leftPane.getBoundingClientRect();
      const newHeight = leftRect.bottom - e.clientY;
      if (newHeight >= 80 && newHeight <= leftRect.height - 120) {
        savedUvBox.style.height = newHeight + 'px';
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizingH) {
      isResizingH = false;
      gutterH.classList.remove('resizing');
      document.body.style.cursor = 'default';
      handle3DResize();
    }
    if (isResizingV) {
      isResizingV = false;
      gutterV.classList.remove('resizing');
      document.body.style.cursor = 'default';
      renderTileset();
    }
    if (isResizingSavedUv) {
      isResizingSavedUv = false;
      if (gutterSavedUv) gutterSavedUv.classList.remove('resizing');
      document.body.style.cursor = 'default';
    }
  });
}

/**
 * -------------------------------------------------------------
 * Model Loading, Repository Catalog & Tileset Interactions
 * -------------------------------------------------------------
 */
async function loadInitialData() {
  loadSavedUvPresetsFromStorage();
  showLoading('Initializing Warzone 2100 catalog & engine...');
  try {
    const [modelsRes, tilesetsRes] = await Promise.all([
      fetch('/api/models'),
      fetch('/api/tilesets')
    ]);

    if (modelsRes.ok) {
      const modelsData = await modelsRes.json();
      state.allModels = modelsData.models || modelsData || [];
      populateModelDropdown(state.allModels);
      populateRefModelDropdown(state.allModels);
    }

    if (tilesetsRes.ok) {
      state.availableTilesets = await tilesetsRes.json();
    }
  } catch (err) {
    console.warn('Could not fetch initial catalog', err);
  }

  await loadModelFromPath('warzone2100/Struct_Mod/stwpfcan.pie');
}

/**
 * Populate repository model dropdown with category groupings and live query filter
 */
function populateModelDropdown(models, filterQuery = '') {
  if (!el.modelSelect) return;
  el.modelSelect.innerHTML = '';

  const q = (filterQuery || '').trim().toLowerCase();
  const queryTerms = q ? q.split(/\s+/).filter(Boolean) : [];
  const filtered = queryTerms.length > 0
    ? models.filter(m => {
        const itemNames = (m.relatedItems || []).map(it => `${it.name} ${it.id} ${it.type}`).join(' ');
        const fullSearchText = `${m.filename} ${m.name || ''} ${m.relatedItem || ''} ${m.inGameName || ''} ${m.relatedType || ''} ${m.inGameType || ''} ${m.category || ''} ${m.defaultTexture || ''} ${itemNames}`.toLowerCase();
        return queryTerms.every(term => fullSearchText.includes(term));
      })
    : models;

  state.filteredModels = filtered;

  if (filtered.length === 0) {
    const noOpt = document.createElement('option');
    noOpt.value = '';
    noOpt.textContent = `No models found matching "${filterQuery}"`;
    el.modelSelect.appendChild(noOpt);
    return;
  }

  // Pre-define ordered categories
  const categoriesOrder = [
    'Struct_Mod',
    'Structures',
    'Droid Bodies',
    'Weapons',
    'Propulsion',
    'Features & Environment',
    'Effects & Particles',
    'Multiplayer',
    'Miscellaneous',
    'Other'
  ];

  const categoryLabels = {
    'Struct_Mod': '⭐ Mod Models (Struct_Mod)',
    'Structures': '🏗️ Structures & Bases',
    'Droid Bodies': '🤖 Droid Bodies & Chassis',
    'Weapons': '⚔️ Weapons & Turrets',
    'Propulsion': '⚙️ Propulsion & Tracks',
    'Features & Environment': '🌲 Features & Terrain',
    'Effects & Particles': '💥 Effects & Particles',
    'Multiplayer': '🌐 Multiplayer Models',
    'Miscellaneous': '📂 Miscellaneous',
    'Other': '📦 Other'
  };

  const groups = {};
  for (const cat of categoriesOrder) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = categoryLabels[cat] || cat;
    groups[cat] = optgroup;
  }

  filtered.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.piePath || m.path;

    const relatedName = m.relatedItem || m.inGameName;
    const relatedType = m.relatedType || m.inGameType || 'Component';

    if (relatedName) {
      opt.textContent = `${m.filename} — [${relatedType}] ${relatedName}`;
    } else {
      opt.textContent = `${m.filename} (${m.category})`;
    }

    if (m.piePath === state.selectedModelPath || m.path === state.selectedModelPath) {
      opt.selected = true;
    }

    let catKey = m.category || 'Other';
    if (!groups[catKey]) {
      catKey = 'Other';
    }
    groups[catKey].appendChild(opt);
  });

  for (const cat of categoriesOrder) {
    if (groups[cat] && groups[cat].children.length > 0) {
      el.modelSelect.appendChild(groups[cat]);
    }
  }
}

/**
 * Helper to highlight matched query substring
 */
function highlightMatch(text, query) {
  if (!text || !query) return text || '';
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return text;
  const regex = new RegExp(`(${escaped.split(/\s+/).join('|')})`, 'gi');
  return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

let activeSuggestionIndex = -1;

function updateActiveSuggestionHighlight(items) {
  items.forEach((it, idx) => {
    if (idx === activeSuggestionIndex) {
      it.classList.add('active');
      it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      it.classList.remove('active');
    }
  });
}

/**
 * Render real-time search suggestions dropdown popup
 */
function renderSearchSuggestions(filterQuery = '') {
  if (!el.modelSearchSuggestions) return;
  const q = (filterQuery || '').trim().toLowerCase();

  if (!q) {
    el.modelSearchSuggestions.style.display = 'none';
    el.modelSearchSuggestions.innerHTML = '';
    activeSuggestionIndex = -1;
    return;
  }

  const queryTerms = q.split(/\s+/).filter(Boolean);
  const models = state.allModels || [];

  const matching = models.filter(m => {
    const itemNames = (m.relatedItems || []).map(it => `${it.name} ${it.id} ${it.type}`).join(' ');
    const fullSearchText = `${m.filename} ${m.name || ''} ${m.relatedItem || ''} ${m.inGameName || ''} ${m.relatedType || ''} ${m.inGameType || ''} ${m.category || ''} ${m.defaultTexture || ''} ${itemNames}`.toLowerCase();
    return queryTerms.every(term => fullSearchText.includes(term));
  });

  el.modelSearchSuggestions.innerHTML = '';
  activeSuggestionIndex = -1;

  if (matching.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-suggestions-empty';
    empty.textContent = `No structure, weapon, or PIE matching "${filterQuery}"`;
    el.modelSearchSuggestions.appendChild(empty);
    el.modelSearchSuggestions.style.display = 'block';
    return;
  }

  const header = document.createElement('div');
  header.className = 'search-suggestions-header';
  header.textContent = `Matches (${matching.length}) — Click or press Enter to load`;
  el.modelSearchSuggestions.appendChild(header);

  // Show top 15 results
  const topMatches = matching.slice(0, 15);
  topMatches.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'search-suggestion-item';
    item.dataset.index = idx;
    const modelPath = m.piePath || m.path;
    item.dataset.path = modelPath;

    const relatedName = m.relatedItem || m.inGameName || m.name || m.filename;
    const relatedType = m.relatedType || m.inGameType || 'Component';
    const typeClass = relatedType ? `tag-${relatedType.toLowerCase().split(' ')[0]}` : '';

    item.innerHTML = `
      <div class="suggestion-left">
        <div class="suggestion-name-row">
          <span class="in-game-item-tag ${typeClass}" style="font-size: 10px; padding: 1px 6px;">[${relatedType}]</span>
          <span class="suggestion-name">${highlightMatch(relatedName, filterQuery)}</span>
        </div>
        <span class="suggestion-file">${highlightMatch(m.filename, filterQuery)}</span>
      </div>
      <div class="suggestion-right">
        <span class="suggestion-cat">${m.category}</span>
        ${m.polyCount ? `<span class="suggestion-polys">${m.polyCount} polys</span>` : ''}
      </div>
    `;

    item.addEventListener('mousedown', (evt) => {
      evt.preventDefault();
      selectModelFromSuggestion(m);
    });

    el.modelSearchSuggestions.appendChild(item);
  });

  el.modelSearchSuggestions.style.display = 'block';
}

function selectModelFromSuggestion(model) {
  const modelPath = model.piePath || model.path;
  if (!modelPath) return;

  state.selectedModelPath = modelPath;
  if (el.modelSelect) {
    el.modelSelect.value = modelPath;
  }

  if (el.modelSearchInput) {
    el.modelSearchInput.value = model.relatedItem || model.inGameName || model.filename;
    if (el.btnClearModelSearch) el.btnClearModelSearch.style.display = 'block';
  }

  if (el.modelSearchSuggestions) {
    el.modelSearchSuggestions.style.display = 'none';
  }

  loadModelFromPath(modelPath);
}

/**
 * Populate repository Reference Model dropdown with category groupings and live query filter
 */
function populateRefModelDropdown(models, filterQuery = '') {
  if (!el.refModelSelect) return;
  el.refModelSelect.innerHTML = '';

  const q = (filterQuery || '').trim().toLowerCase();
  const queryTerms = q ? q.split(/\s+/).filter(Boolean) : [];
  const filtered = queryTerms.length > 0
    ? models.filter(m => {
        const itemNames = (m.relatedItems || []).map(it => `${it.name} ${it.id} ${it.type}`).join(' ');
        const fullSearchText = `${m.filename} ${m.name || ''} ${m.relatedItem || ''} ${m.inGameName || ''} ${m.relatedType || ''} ${m.inGameType || ''} ${m.category || ''} ${m.defaultTexture || ''} ${itemNames}`.toLowerCase();
        return queryTerms.every(term => fullSearchText.includes(term));
      })
    : models;

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = filtered.length > 0 ? '-- Select a reference model --' : `No models found matching "${filterQuery}"`;
  el.refModelSelect.appendChild(defaultOpt);

  if (filtered.length === 0) return;

  const categoriesOrder = [
    'Droid Bodies',
    'Weapons',
    'Propulsion',
    'Structures',
    'Struct_Mod',
    'Features & Environment',
    'Effects & Particles',
    'Multiplayer',
    'Miscellaneous',
    'Other'
  ];

  const categoryLabels = {
    'Droid Bodies': '🤖 Droid Bodies & Chassis',
    'Weapons': '⚔️ Weapons & Turrets',
    'Propulsion': '⚙️ Propulsion & Tracks',
    'Structures': '🏗️ Structures & Bases',
    'Struct_Mod': '⭐ Mod Models (Struct_Mod)',
    'Features & Environment': '🌲 Features & Terrain',
    'Effects & Particles': '💥 Effects & Particles',
    'Multiplayer': '🌐 Multiplayer Models',
    'Miscellaneous': '📂 Miscellaneous',
    'Other': '📦 Other'
  };

  const groups = {};
  for (const cat of categoriesOrder) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = categoryLabels[cat] || cat;
    groups[cat] = optgroup;
  }

  filtered.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.piePath || m.path;

    const relatedName = m.relatedItem || m.inGameName;
    const relatedType = m.relatedType || m.inGameType || 'Component';

    if (relatedName) {
      opt.textContent = `${m.filename} — [${relatedType}] ${relatedName}`;
    } else {
      opt.textContent = `${m.filename} (${m.category})`;
    }

    if (state.refModel.loaded && (m.piePath === state.refModel.piePath || m.filename === state.refModel.filename)) {
      opt.selected = true;
    }

    let catKey = m.category || 'Other';
    if (!groups[catKey]) {
      catKey = 'Other';
    }
    groups[catKey].appendChild(opt);
  });

  for (const cat of categoriesOrder) {
    if (groups[cat] && groups[cat].children.length > 0) {
      el.refModelSelect.appendChild(groups[cat]);
    }
  }
}

/**
 * Render real-time search suggestions for Reference Model
 */
function renderRefSearchSuggestions(filterQuery = '') {
  if (!el.refSearchSuggestions) return;
  const q = (filterQuery || '').trim().toLowerCase();

  if (!q) {
    el.refSearchSuggestions.style.display = 'none';
    el.refSearchSuggestions.innerHTML = '';
    return;
  }

  const queryTerms = q.split(/\s+/).filter(Boolean);
  const models = state.allModels || [];

  const matching = models.filter(m => {
    const itemNames = (m.relatedItems || []).map(it => `${it.name} ${it.id} ${it.type}`).join(' ');
    const fullSearchText = `${m.filename} ${m.name || ''} ${m.relatedItem || ''} ${m.inGameName || ''} ${m.relatedType || ''} ${m.inGameType || ''} ${m.category || ''} ${m.defaultTexture || ''} ${itemNames}`.toLowerCase();
    return queryTerms.every(term => fullSearchText.includes(term));
  });

  el.refSearchSuggestions.innerHTML = '';

  if (matching.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-suggestions-empty';
    empty.textContent = `No reference model matching "${filterQuery}"`;
    el.refSearchSuggestions.appendChild(empty);
    el.refSearchSuggestions.style.display = 'block';
    return;
  }

  const header = document.createElement('div');
  header.className = 'search-suggestions-header';
  header.textContent = `Reference Matches (${matching.length}) — Click to load`;
  el.refSearchSuggestions.appendChild(header);

  const topMatches = matching.slice(0, 15);
  topMatches.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'search-suggestion-item';
    item.dataset.index = idx;
    const modelPath = m.piePath || m.path;
    item.dataset.path = modelPath;

    const relatedName = m.relatedItem || m.inGameName || m.name || m.filename;
    const relatedType = m.relatedType || m.inGameType || 'Component';
    const typeClass = relatedType ? `tag-${relatedType.toLowerCase().split(' ')[0]}` : '';

    item.innerHTML = `
      <div class="suggestion-left">
        <div class="suggestion-name-row">
          <span class="in-game-item-tag ${typeClass}" style="font-size: 10px; padding: 1px 6px;">[${relatedType}]</span>
          <span class="suggestion-name">${highlightMatch(relatedName, filterQuery)}</span>
        </div>
        <span class="suggestion-file">${highlightMatch(m.filename, filterQuery)}</span>
      </div>
      <div class="suggestion-right">
        <span class="suggestion-cat">${m.category}</span>
        ${m.polyCount ? `<span class="suggestion-polys">${m.polyCount} polys</span>` : ''}
      </div>
    `;

    item.addEventListener('mousedown', (evt) => {
      evt.preventDefault();
      selectRefModelFromSuggestion(m);
    });

    el.refSearchSuggestions.appendChild(item);
  });

  el.refSearchSuggestions.style.display = 'block';
}

function selectRefModelFromSuggestion(model) {
  const modelPath = model.piePath || model.path;
  if (!modelPath) return;

  if (el.refModelSelect) {
    el.refModelSelect.value = modelPath;
  }

  if (el.refSearchInput) {
    el.refSearchInput.value = model.relatedItem || model.inGameName || model.filename;
    if (el.btnClearRefSearch) el.btnClearRefSearch.style.display = 'block';
  }

  if (el.refSearchSuggestions) {
    el.refSearchSuggestions.style.display = 'none';
  }

  loadReferencePieFromPath(modelPath);
}

/**
 * Populate Tileset / Texture Dropdown grouped by PIE specification and official categories
 */
function populateTilesetDropdown(currentTexture, specifiedTexturesList = []) {
  if (!el.tilesetSelect) return;
  el.tilesetSelect.innerHTML = '';

  const cleanCurrent = (currentTexture || '').toLowerCase();
  const specifiedFiles = specifiedTexturesList.map(t => (t.filename || '').toLowerCase());
  const isMatch = specifiedFiles.includes(cleanCurrent) || cleanCurrent.includes(specifiedFiles[0] || '___');

  // 1. Group: Specified in PIE File
  if (specifiedTexturesList && specifiedTexturesList.length > 0) {
    const groupSpecified = document.createElement('optgroup');
    groupSpecified.label = '⭐ Specified in Current PIE File';

    specifiedTexturesList.forEach((st) => {
      const opt = document.createElement('option');
      opt.value = st.filename;
      const climateName = getClimateNameForTileset(st.filename, st.tileset);
      opt.textContent = `★ ${st.filename} (Tileset ${st.tileset}: ${climateName})`;
      if (st.filename.toLowerCase() === cleanCurrent) {
        opt.selected = true;
      }
      groupSpecified.appendChild(opt);
    });

    el.tilesetSelect.appendChild(groupSpecified);
  }

  // 2. Group: Related Climate Variants (e.g. Arizona / Urban / Rockies)
  const relatedVariants = findRelatedTilesetVariants(currentTexture);
  if (relatedVariants && relatedVariants.length > 0) {
    const groupRelated = document.createElement('optgroup');
    groupRelated.label = '🏜️ Related Climate Variants (Arizona / Urban / Rockies)';
    relatedVariants.forEach((rv) => {
      const opt = document.createElement('option');
      opt.value = rv.file;
      opt.textContent = `${rv.file} — ${rv.name} (${rv.climate})`;
      if (rv.file.toLowerCase() === cleanCurrent) {
        opt.selected = true;
      }
      groupRelated.appendChild(opt);
    });
    el.tilesetSelect.appendChild(groupRelated);
  }

  // 3. Official Catalog Categories
  if (state.availableTilesets && state.availableTilesets.categories) {
    state.availableTilesets.categories.forEach((cat) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = cat.name;

      cat.tilesets.forEach((t) => {
        // Skip duplicate if already in specified group
        if (specifiedFiles.includes(t.file.toLowerCase())) return;

        const opt = document.createElement('option');
        opt.value = t.file;
        opt.textContent = `${t.file} — ${t.name}`;
        if (t.file.toLowerCase() === cleanCurrent) {
          opt.selected = true;
        }
        optgroup.appendChild(opt);
      });

      if (optgroup.children.length > 0) {
        el.tilesetSelect.appendChild(optgroup);
      }
    });
  }

  // If current texture is custom or not in catalog, append Custom option
  let hasSelected = false;
  for (let i = 0; i < el.tilesetSelect.options.length; i++) {
    if (el.tilesetSelect.options[i].value.toLowerCase() === cleanCurrent) {
      el.tilesetSelect.selectedIndex = i;
      hasSelected = true;
      break;
    }
  }

  if (!hasSelected && currentTexture) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = 'Custom / File Texture';
    const opt = document.createElement('option');
    opt.value = currentTexture;
    opt.textContent = `${currentTexture} (Active)`;
    opt.selected = true;
    customGroup.appendChild(opt);
    el.tilesetSelect.appendChild(customGroup);
  }

  // Update Status Badge and Apply Button
  updateTilesetMatchStatus(isMatch);
}

function updateTilesetMatchStatus(isMatch) {
  // Badge removed; keep the Apply-button visibility logic.
  if (el.btnApplyTilesetToPie) el.btnApplyTilesetToPie.style.display = isMatch ? 'none' : 'inline-flex';
}

/**
 * Determine climate name (Arizona, Urban, Rockies) from tileset index or filename
 */
function getClimateNameForTileset(filename, tilesetIndex) {
  const f = (filename || '').toLowerCase();
  if (f.includes('urban')) return 'Urban';
  if (f.includes('rockies') || f.includes('snow')) return 'Rockies';
  if (f.includes('arizona') || f.includes('sand')) return 'Arizona';
  if (tilesetIndex === 0) return 'Standard / Arizona';
  if (tilesetIndex === 1) return 'Urban';
  if (tilesetIndex === 2) return 'Rockies';
  return `Tileset ${tilesetIndex}`;
}

/**
 * Find related terrain/climate variants (Arizona / Urban / Rockies) for a given texture page
 */
function findRelatedTilesetVariants(filename) {
  if (!filename) return [];
  const baseMatch = filename.match(/^(page-\d+[^.-]*)/i);
  if (!baseMatch) return [];

  const prefix = baseMatch[1].toLowerCase();
  const variants = [
    { file: 'page-9-player-buildings-bases.png', name: 'Player Bases', climate: 'Arizona' },
    { file: 'page-9-player-buildings-bases-urban.png', name: 'Player Bases', climate: 'Urban' },
    { file: 'page-9-player-buildings-bases-rockies.png', name: 'Player Bases', climate: 'Rockies' },
    { file: 'page-8-player-buildings-bases.png', name: 'Factory Bases', climate: 'Arizona' },
    { file: 'page-8-player-buildings-bases-urban.png', name: 'Factory Bases', climate: 'Urban' },
    { file: 'page-8-player-buildings-bases-rockies.png', name: 'Factory Bases', climate: 'Rockies' },
    { file: 'page-7-barbarians-arizona.png', name: 'Barbarians / Scavs', climate: 'Arizona' },
    { file: 'page-7-barbarians-urban.png', name: 'Barbarians / Scavs', climate: 'Urban' },
    { file: 'page-29-features-arizona.png', name: 'Features & Rocks', climate: 'Arizona' },
    { file: 'page-31-features-urban.png', name: 'Features & Rubble', climate: 'Urban' },
    { file: 'page-30-features-rockies.png', name: 'Features & Snow', climate: 'Rockies' }
  ];

  return variants.filter(v => v.file.toLowerCase().startsWith(prefix));
}

/**
 * Render quick tileset variant switcher buttons for multi-tileset PIE models
 */
function updateTilesetVariantButtons(specifiedTexturesList) {
  if (!el.tilesetVariantButtons) return;
  el.tilesetVariantButtons.innerHTML = '';

  if (!specifiedTexturesList || specifiedTexturesList.length <= 1) {
    el.tilesetVariantButtons.style.display = 'none';
    return;
  }

  el.tilesetVariantButtons.style.display = 'flex';

  specifiedTexturesList.forEach((st) => {
    const btn = document.createElement('button');
    btn.className = 'tileset-variant-btn';
    const climate = getClimateNameForTileset(st.filename, st.tileset);
    btn.textContent = `${st.tileset}: ${climate}`;
    btn.title = `Switch to Tileset ${st.tileset} (${st.filename})`;

    if (st.filename.toLowerCase() === (state.textureName || '').toLowerCase()) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () => {
      switchTileset(st.filename, st.tileset);
    });

    el.tilesetVariantButtons.appendChild(btn);
  });
}

/**
 * Switch active tileset to another texture file and reload 3D and UV tileset
 */
function switchTileset(newTextureFile, tilesetIndex = 0) {
  if (!newTextureFile) return;

  state.textureName = newTextureFile;
  state.currentTilesetFile = newTextureFile;
  state.activeTilesetIndex = tilesetIndex;
  el.texFilename.textContent = newTextureFile;

  const specifiedFiles = (state.pieSpecifiedTextures || []).map(t => (t.filename || '').toLowerCase());
  const isMatch = specifiedFiles.includes(newTextureFile.toLowerCase());
  updateTilesetMatchStatus(isMatch);

  // Update variant buttons active state
  if (el.tilesetVariantButtons) {
    const btns = el.tilesetVariantButtons.querySelectorAll('.tileset-variant-btn');
    btns.forEach((b, idx) => {
      const st = state.pieSpecifiedTextures[idx];
      b.classList.toggle('active', st && st.filename.toLowerCase() === newTextureFile.toLowerCase());
    });
  }

  if (el.tilesetSelect) {
    el.tilesetSelect.value = newTextureFile;
  }

  const texUrl = `/api/texture?name=${encodeURIComponent(newTextureFile)}&pie=${encodeURIComponent(state.piePath || '')}`;
  loadTextureImage(texUrl, () => {
    showToast(`Tileset switched to: ${newTextureFile}`);
  });
}

/**
 * Apply currently selected tileset directly into the active PIE file's TEXTURE directive
 */
function applySelectedTilesetToPie() {
  if (!state.rawText || !state.textureName) return;

  const targetTileset = state.activeTilesetIndex || 0;
  const updatedText = PieParser.updateTexture(state.rawText, state.textureName, targetTileset);

  state.rawText = updatedText;
  if (el.textEditor) el.textEditor.value = updatedText;

  try {
    const newParsed = PieParser.parse(updatedText);
    state.pieData = newParsed;
    state.pieSpecifiedTextures = newParsed.textures || [];

    renderTextView(newParsed, updatedText);
    updateTilesetVariantButtons(state.pieSpecifiedTextures);
    populateTilesetDropdown(state.textureName, state.pieSpecifiedTextures);
    updateTilesetMatchStatus(true);

    showToast(`Updated PIE TEXTURE directive to: ${state.textureName}`);
  } catch (err) {
    console.error('Error re-parsing after updating texture:', err);
    showToast('Applied texture to PIE text.');
  }
}

/**
 * Synchronize catalog with live Warzone2100 repository on GitHub
 */
async function syncWithRepository() {
  if (!el.btnSyncRepo) return;
  el.btnSyncRepo.disabled = true;
  if (el.syncBtnLabel) el.syncBtnLabel.textContent = 'Syncing...';
  showLoading('Checking live Warzone 2100 repository for new PIEs and tilesets...');

  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      // Re-fetch updated models and tilesets
      const [modelsRes, tilesetsRes] = await Promise.all([
        fetch('/api/models'),
        fetch('/api/tilesets')
      ]);

      if (modelsRes.ok) {
        const mData = await modelsRes.json();
        state.allModels = mData.models || mData || [];
        populateModelDropdown(state.allModels, el.modelSearchInput ? el.modelSearchInput.value : '');
        populateRefModelDropdown(state.allModels, el.refSearchInput ? el.refSearchInput.value : '');
      }

      if (tilesetsRes.ok) {
        state.availableTilesets = await tilesetsRes.json();
        populateTilesetDropdown(state.textureName, state.pieSpecifiedTextures);
      }

      showToast(`Repository sync complete! ${data.totalPies} models, ${data.totalTextures} tilesets.`);
    } else {
      showToast(data.message || 'Repository sync completed.');
    }
  } catch (err) {
    console.error('Sync failed:', err);
    showToast('Failed to sync repository: ' + err.message);
  } finally {
    hideLoading();
    el.btnSyncRepo.disabled = false;
    if (el.syncBtnLabel) el.syncBtnLabel.textContent = 'Sync Repo';
  }
}

async function loadModelFromPath(piePath) {
  showLoading(`Loading ${piePath.split('/').pop()}...`);
  try {
    const res = await fetch(`/api/pie?path=${encodeURIComponent(piePath)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    state.piePath = piePath;
    state.selectedModelPath = piePath;

    if (el.modelSelect) {
      el.modelSelect.value = piePath;
    }

    loadPieTextContent(text, piePath.split('/').pop());
  } catch (err) {
    console.error('Error loading PIE file', err);
    showToast('Failed to load PIE file: ' + err.message);
    hideLoading();
  }
}

function updateModelInGameBadge(filename, piePath) {
  const cleanFilename = (filename || '').toLowerCase();
  const found = (state.allModels || []).find(m =>
    (m.filename && m.filename.toLowerCase() === cleanFilename) ||
    (m.piePath && m.piePath.toLowerCase().endsWith(cleanFilename)) ||
    (m.path && m.path.toLowerCase().endsWith(cleanFilename))
  );

  const relatedName = (found && (found.relatedItem || found.inGameName)) || (cleanFilename === 'stwpfcan.pie' ? 'Cannon Fortress' : '');
  const relatedType = (found && (found.relatedType || found.inGameType)) || (cleanFilename === 'stwpfcan.pie' ? 'Structure' : '');

  const typeClass = relatedType ? `tag-${relatedType.toLowerCase().split(' ')[0]}` : '';

  if (el.modelItemTag) {
    if (relatedName) {
      el.modelItemTag.textContent = `[${relatedType}] ${relatedName}`;
      el.modelItemTag.className = `in-game-item-tag ${typeClass}`;
      el.modelItemTag.style.display = 'inline-flex';
    } else {
      el.modelItemTag.textContent = `[Model] ${filename}`;
      el.modelItemTag.className = 'in-game-item-tag';
      el.modelItemTag.style.display = 'inline-flex';
    }
  }

  if (el.paneItemTag) {
    if (relatedName) {
      el.paneItemTag.textContent = `[${relatedType}] ${relatedName}`;
      el.paneItemTag.className = `in-game-item-tag ${typeClass}`;
      el.paneItemTag.style.display = 'inline-flex';
    } else {
      el.paneItemTag.style.display = 'none';
    }
  }
}

function loadPieTextContent(text, filename) {
  state.rawText = text;
  state.pieFilename = filename;
  el.textFilename.textContent = filename;

  // Update in-game item tags for weapon/structure/propulsion
  updateModelInGameBadge(filename, state.piePath);

  const parsed = PieParser.parse(text);
  state.pieData = parsed;
  state.pieSpecifiedTextures = parsed.textures || [];

  renderTextView(parsed, text);

  // Determine correct tileset specified in the PIE file:
  // 1. Check tileset 0 or primary texture
  let texName = parsed.texture;
  if (!texName && parsed.textures && parsed.textures.length > 0) {
    texName = parsed.textures[0].filename;
  }
  if (!texName) {
    texName = 'page-12-player-buildings.png';
  }

  state.textureName = texName;
  state.currentTilesetFile = texName;
  state.activeTilesetIndex = (parsed.textures && parsed.textures[0]) ? parsed.textures[0].tileset : 0;
  el.texFilename.textContent = texName;

  // Render tileset switcher and dropdown
  updateTilesetVariantButtons(state.pieSpecifiedTextures);
  populateTilesetDropdown(texName, state.pieSpecifiedTextures);

  buildModelGeometry(parsed);

  const texUrl = `/api/texture?name=${encodeURIComponent(texName)}&pie=${encodeURIComponent(state.piePath || '')}`;
  loadTextureImage(texUrl, () => {
    hideLoading();
    const tilesetCount = state.pieSpecifiedTextures.length;
    const tilesetMsg = tilesetCount > 1
      ? `Loaded ${filename} with ${tilesetCount} tilesets (Active: ${texName})`
      : `Loaded ${filename} with tileset: ${texName}`;
    showToast(tilesetMsg);
  });
}

function showLoading(msg) {
  el.loadingText.textContent = msg || 'Loading...';
  el.loadingOverlay.classList.add('active');
}

function hideLoading() {
  el.loadingOverlay.classList.remove('active');
}

let toastTimer = null;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');
  }, 3000);
}
