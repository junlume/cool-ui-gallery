import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This checks the real Three.js model and scene without a renderer or network.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'motdes/src');
const read = (name) => fs.readFileSync(path.join(src, name), 'utf8');
const profileCss = read('styles/profile-story.css');
const load = (name) => import(pathToFileURL(path.join(src, name)));
const THREE = await import(pathToFileURL(path.join(root, 'motdes/node_modules/three/build/three.module.js')));
const timeline = await load('lib/profile-timeline.js');
const geometry = await load('scripts/gl/logo-geometry.js');
const shaders = await load('scripts/gl/shaders/index.js');
const { Animator, animator } = await load('scripts/gl/animator.js');
const { Lerper } = await load('scripts/core/lerper.js');
const { MissionVisionScene } = await load('scripts/gl/mission-vision-scene.js');
const { profileLogoFrame, profileLogoLayout, profileBackdropFrame } = timeline;
assert.equal(typeof profileLogoFrame, 'function', 'Production timeline must provide profileLogoFrame');
assert.equal(typeof profileBackdropFrame, 'function', 'Production timeline must provide profileBackdropFrame');
let checks = 0;
const check = (condition, description) => { assert.ok(condition, description); checks += 1; };
const equal = (a, b, description) => { assert.deepEqual(a, b, description); checks += 1; };
const near = (a, b, description) => check(Math.abs(a - b) < 1e-8, description);
check(/devToolbar\s*:\s*\{\s*enabled\s*:\s*false\s*\}/.test(fs.readFileSync(path.join(root, 'motdes/astro.config.mjs'), 'utf8')), 'Astro dev toolbar cannot cover the complete bottom M');

const triggers = {
  mission_in: { progress: 0, isActive: false },
  profile_progress: { progress: 0, isActive: false },
  vision: { progress: 0, isActive: false },
  service_in: { progress: 0, isActive: false },
};
const reducedMotion = { matches: false };
const viewport = { innerWidth: 1440, innerHeight: 900, matchMedia: () => reducedMotion };
const device = { isSPLayout: false };
const lerper = new Lerper();
const context = vm.createContext({
  THREE, Animator, lerper, ...timeline, ...geometry, ...shaders,
  deviceManager: device, window: viewport,
  topScrollManager: { getTrigger: (name) => triggers[name] || null, getProfileProgress: () => triggers.profile_progress.progress },
});
const mainLogoSource = read('scripts/gl/main-logo.js');
vm.runInContext(mainLogoSource.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '') + '\nglobalThis.Subject = MainLogo;', context);
const logo = new context.Subject({ commonUniforms: {}, transparentBuffer: { uniformSet: {} }, envMap: null, noiseTexture: null, serviceSceneTexture: null, renderOrderBase: 0 });
const outerScale = Number(read('scripts/gl/index.js').match(/const LOGO_SCALE = ([\d.]+)/)[1]);
logo.scale.setScalar(outerScale);
logo.position.set(0, -0.3, 0);
// The opening video and white MV stages can skip rendering the main scene.
// Start with the same unpropagated parent transform as a fresh page load.
const mainScene = new THREE.Scene();
const outlineScene = new THREE.Scene();
mainScene.add(logo);
outlineScene.add(logo.outlineContainer);
logo.in();
const mesh = logo.children[0];
const mainMeshes = [mesh, ...logo.outlineContainer.children.filter((object) => object.isMesh)];
const materials = mainMeshes.map((object) => object.material);
const visibility = () => [mesh.visible, logo.outlineContainer.visible, ...mainMeshes.slice(1).map((object) => object.visible)];
const cloud = logo.outlineContainer.children.find((object) => object.isPoints);
check(!cloud, 'The M contains no particle Points object');
const update = () => logo.update({ deltaTime: 1 / 60 });
const profileAt = (progress) => {
  triggers.mission_in.progress = 1;
  triggers.mission_in.isActive = false;
  triggers.profile_progress.progress = progress;
  triggers.profile_progress.isActive = progress < 1;
  update();
  return {
    uniforms: materials.map((material) => ({ reveal: material.uniforms.uProfileReveal.value, yaw: material.uniforms.uProfileYaw.value, pitch: material.uniforms.uProfilePitch.value })),
    visibility: visibility(), scale: mesh.scale.toArray(), position: mesh.position.toArray(), debug: logo.debugState,
  };
};

update();
near(new THREE.Vector3().setFromMatrixScale(logo.outlineContainer.matrixWorld).x, outerScale * mesh.scale.x,
  'The separate outline inherits the full M size before the main scene has ever rendered');
near(new THREE.Vector3().setFromMatrixPosition(logo.outlineContainer.matrixWorld).y, -0.3,
  'The separate outline inherits the parent position without a main-scene render');
check(visibility().every(Boolean), 'WORKS retains its original visible model before ABOUT');
near(mesh.scale.x, 3, 'WORKS retains its original model scale');
near(mesh.position.y, 0, 'WORKS retains its original model position');
near(materials[0].uniforms.uProfileReveal.value, 1, 'WORKS has full material opacity');
for (const leadIn of [0, 0.1, 0.5, 0.99]) {
  triggers.mission_in.progress = leadIn;
  triggers.mission_in.isActive = true;
  update();
  check(visibility().every((visible) => visible === false), 'Mission lead-in hides glass, outline, depth base and side screen together');
  check(materials.every((material) => material.uniforms.uProfileReveal.value === 0), 'Mission lead-in has zero opacity for every material');
}
for (const reading of [0, 0.064, 0.46, 0.62, 0.78, 0.83, 0.84]) {
  const state = profileAt(reading);
  const expected = profileLogoFrame(reading), visible = expected.reveal > .0001;
  check(state.visibility.every((actual) => actual === visible), `All M layers share the small reading-stage visibility at ${reading}`);
  check(state.uniforms.every((uniform) => Math.abs(uniform.reveal - expected.reveal) < 1e-8), 'Every M material shares the early complete reveal');
  equal([state.debug.visionRotate, state.debug.serviceIn, state.debug.serviceRotate], [0, 0, 0], 'Bottom M stays fully closed at the first navigation stop and all three film stops');
  check(!logo.canGrab(new THREE.Vector2(0, 0), new THREE.PerspectiveCamera()), 'Decorative reading M cannot intercept grabbing');
  equal(logo.debugUniformIdentity().profileRevealShared, true, 'All four materials share one reveal uniform object');
}
profileAt(.79);
const smallScale = mesh.scale.x, smallY = mesh.position.y;
const revealedStates = [];
for (const progress of [.797, .805, .82, .839, 0.85, 0.87, 0.89, 0.9, 0.92, 0.96, 0.98, 1]) {
  const state = profileAt(progress);
  const expected = profileLogoFrame(progress);
  check(state.visibility.every(Boolean), 'Growing M remains visible through the final exit and profile signature');
  near(state.uniforms[0].reveal, expected.reveal, 'Final material opacity follows the production reveal curve');
  check(state.uniforms.every((uniform) => uniform.reveal === state.uniforms[0].reveal), 'Glass, outline, base and side screen fade together');
  equal([state.debug.visionRotate, state.debug.serviceIn, state.debug.serviceRotate], [0, 0, 0], 'The final M never starts the side-screen unfolding');
  if (progress === .797) { near(mesh.scale.x, smallScale, 'M stays small until the final outward exit begins'); near(mesh.position.y, smallY, 'M keeps its bottom anchor before the exit'); }
  if (progress > .797) check(mesh.scale.x > smallScale && mesh.position.y > smallY, 'M already grows and rises during the final outward exit');
  if (revealedStates.length) check(mesh.scale.x > revealedStates.at(-1).scale, 'M grows continuously through the end of Profile');
  revealedStates.push({ progress, reveal: state.debug.profileReveal, scale: state.debug.profileScale });
}
const handoffScale = mesh.scale.x, handoffY = mesh.position.y;
check(handoffScale > smallScale && handoffScale < 3 && handoffY > smallY, 'Profile passes an already enlarged M into the continuing PORTFOLIO growth');
near(materials[0].uniforms.uProfileYaw.value, 0, 'Completing the profile restores the original yaw');
near(materials[0].uniforms.uProfilePitch.value, 0, 'Completing the profile restores the original pitch');
// Restoring scroll directly into PORTFOLIO must also work without first
// visiting or rendering WORKS or ABOUT to initialize the model's ancestors.
const restoredLogo = new context.Subject({ commonUniforms: {}, transparentBuffer: { uniformSet: {} }, envMap: null, noiseTexture: null, serviceSceneTexture: null, renderOrderBase: 0 });
triggers.vision.progress = 0.68;
lerper.remove('mainLogo_portfolio');
restoredLogo.scale.setScalar(outerScale);
restoredLogo.position.set(0, -0.3, 0);
mainScene.add(restoredLogo);
outlineScene.add(restoredLogo.outlineContainer);
restoredLogo.in();
restoredLogo.update({ deltaTime: 1 / 60 });
outlineScene.updateMatrixWorld(true);
const restoredOutline = restoredLogo.outlineContainer.children.find((object) => object.isMesh);
near(new THREE.Vector3().setFromMatrixScale(restoredOutline.matrixWorld).x, outerScale * 3,
  'Direct PORTFOLIO entry renders the complete large M in the separate scene');
const portfolioCamera = new THREE.PerspectiveCamera(35 + 18 / (1760 / 1405), 1760 / 1405, 0.1, 1000);
portfolioCamera.position.z = 10;
portfolioCamera.updateMatrixWorld(true);
const portfolioPosition = restoredOutline.geometry.getAttribute('position');
const portfolioVertex = new THREE.Vector3();
let portfolioMinY = Infinity, portfolioMaxY = -Infinity;
for (let index = 0; index < portfolioPosition.count; index += 1) {
  portfolioVertex.fromBufferAttribute(portfolioPosition, index).applyMatrix4(restoredOutline.matrixWorld).project(portfolioCamera);
  portfolioMinY = Math.min(portfolioMinY, portfolioVertex.y);
  portfolioMaxY = Math.max(portfolioMaxY, portfolioVertex.y);
}
const portfolioHeightFraction = (portfolioMaxY - portfolioMinY) / 2;
check(portfolioHeightFraction > 0.5 && portfolioHeightFraction < 0.9,
  'At the feedback viewport the PORTFOLIO M occupies more than half the screen height instead of a small badge');
near(restoredLogo.debugState.profileReveal, 1, 'Direct PORTFOLIO entry retains the completed opacity');
equal([restoredLogo.debugState.visionRotate, restoredLogo.debugState.serviceRotate], [0, 0],
  'The large PORTFOLIO M does not begin unfolding before its original triggers');
mainScene.remove(restoredLogo);
outlineScene.remove(restoredLogo.outlineContainer);
triggers.vision.progress = 0;
lerper.remove('mainLogo_portfolio');
for (const progress of [0.705, 0.83, 0.87, 0.999, 1]) {
  const active = profileAt(progress);
  triggers.profile_progress.isActive = false;
  update();
  equal({ visibility: visibility(), scale: mesh.scale.toArray(), position: mesh.position.toArray(), debug: logo.debugState },
    { visibility: active.visibility, scale: active.scale, position: active.position, debug: active.debug },
    'An inactive profile trigger retains the same scroll state after the mission wipe');
  if (progress < 1) check(!logo.canGrab(new THREE.Vector2(0, 0), new THREE.PerspectiveCamera()), 'An inactive unfinished profile still prevents grabbing its final M');
}
// The Profile to PORTFOLIO boundary continues from the enlarged pose.
profileAt(1 - 1e-10);
near(mesh.scale.x, handoffScale, 'The last profile frame approaches the enlarged handoff size');
near(mesh.position.y, handoffY, 'The last profile frame approaches the raised handoff anchor');
triggers.profile_progress.isActive = false;
triggers.profile_progress.progress = 1;
update();
near(mesh.scale.x, handoffScale, 'The active-to-inactive profile handoff introduces no scale jump');
near(mesh.position.y, handoffY, 'The active-to-inactive profile handoff introduces no position jump');
// Reverse all the way out of ABOUT, including the partially revealed wipe.
for (const leadIn of [0.99, 0.5, 0.01]) {
  triggers.profile_progress.progress = 0;
  triggers.profile_progress.isActive = false;
  triggers.mission_in.progress = leadIn;
  triggers.mission_in.isActive = true;
  update();
  check(visibility().every((visible) => !visible), 'Reverse scrolling through the mission wipe keeps every M layer absent');
}
triggers.mission_in.progress = 0;
triggers.mission_in.isActive = false;
update();
check(visibility().every(Boolean), 'Returning to WORKS reveals its original M again');
near(mesh.scale.x, 3, 'Returning to WORKS restores the model scale');
near(mesh.position.y, 0, 'Returning to WORKS restores the model position');
near(materials[0].uniforms.uProfileReveal.value, 1, 'Returning to WORKS restores full opacity');
const positions = [0, 0.064, 0.46, 0.62, 0.83, 0.84, 0.85, 0.87, 0.9, 0.92, 0.96, 0.98, 1];
const forwards = positions.map((p) => JSON.stringify(profileAt(p)));
const backwards = [...positions].reverse().map((p) => JSON.stringify(profileAt(p))).reverse();
equal(backwards, forwards, 'Entering, revealing, returning and reverse scrolling produce identical model states');
reducedMotion.matches = true;
profileAt(0.87);
near(materials[0].uniforms.uProfileYaw.value, 0, 'Reduced motion removes the final logo yaw');
near(materials[0].uniforms.uProfilePitch.value, 0, 'Reduced motion removes the final logo pitch');
near(materials[0].uniforms.uProfileReveal.value, profileLogoFrame(0.87).reveal, 'Reduced motion preserves the final reveal timing');
reducedMotion.matches = false;

// Test the three speck locations against the real front-facing depth base.
// The old unindexed shell reproduces the inverted bevel faces; the revised
// indexed shell must occlude every stray interior fragment without widening M.
const cleanShell = geometry.createLogoOutlineGeometry();
const oldShell = cleanShell.clone().setIndex(null);
cleanShell.computeBoundingBox(); oldShell.computeBoundingBox();
equal(cleanShell.boundingBox.min.toArray(), oldShell.boundingBox.min.toArray(), 'Cleaning flecks preserves the exact outer minimum bounds');
equal(cleanShell.boundingBox.max.toArray(), oldShell.boundingBox.max.toArray(), 'Cleaning flecks preserves the exact outer maximum bounds');
const depthBase = new THREE.Mesh(geometry.createLogoGeometry(), new THREE.MeshBasicMaterial());
const oldOutline = new THREE.Mesh(oldShell, new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
const cleanOutline = new THREE.Mesh(cleanShell, new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
const probe = new THREE.Raycaster();
const fleckCounts = { before: 0, after: 0, rays: 0 };
for (const [cx, cy] of [[-.115, .04], [.115, .04], [0, -.04]]) {
  for (let iy = -20; iy <= 20; iy += 1) for (let ix = -20; ix <= 20; ix += 1) {
    probe.set(new THREE.Vector3(cx + ix * .0002, cy + iy * .0002, 1), new THREE.Vector3(0, 0, -1));
    const base = probe.intersectObject(depthBase)[0];
    for (const [key, shell] of [['before', oldOutline], ['after', cleanOutline]]) {
      const hit = probe.intersectObject(shell)[0];
      if (hit && (!base || hit.distance < base.distance - 1e-8)) fleckCounts[key] += 1;
    }
    fleckCounts.rays += 1;
  }
}
check(fleckCounts.before > 0, 'The actual original shell reproduces the interior white specks');
equal(fleckCounts.after, 0, 'The revised shell has no exposed interior fragments at all three speck locations');
let edgePixels = 0;
const bounds = cleanShell.boundingBox;
for (const side of [-1, 1]) for (let iy = -40; iy <= 40; iy += 1) {
  const x = side * (bounds.max.x - .0003);
  probe.set(new THREE.Vector3(x, iy * .002, 1), new THREE.Vector3(0, 0, -1));
  const a = probe.intersectObject(depthBase)[0], b = probe.intersectObject(cleanOutline)[0];
  if (b && (!a || b.distance < a.distance - 1e-8)) edgePixels += 1;
}
check(edgePixels > 120, 'Both tall silhouette strokes remain visible after removing inverted bevel faces');
for (const object of [depthBase, oldOutline, cleanOutline]) { object.geometry.dispose(); object.material.dispose(); }

const scene = new MissionVisionScene({});
const backgrounds = [];
for (const progress of [0, 0.12, 0.62, 0.87, 0.95, 0.98, 1, 0.87, 0]) {
  const expected = profileBackdropFrame(progress).dark;
  scene.setProfileBackdrop(expected);
  near(scene.debugState.profileDark, 0, 'Profile progress never darkens the real MV canvas');
  near(scene.debugState.profileAmount, expected, 'The backdrop API still records progress for lifecycle diagnostics');
  equal(scene.debugState.gridVisible, true, 'The original MV grid stays visible throughout the profile');
  equal(scene.debugState.background, '#d7dbdc', 'The profile and final M keep the original light paper canvas');
  backgrounds.push({ progress, ...scene.debugState });
}
for (const invalid of [NaN, undefined, -1, 2]) {
  scene.setProfileBackdrop(invalid);
  near(scene.debugState.profileDark, 0, 'Invalid backdrop values cannot darken the white canvas');
  check(Number.isFinite(scene.debugState.profileAmount) && scene.debugState.profileAmount >= 0 && scene.debugState.profileAmount <= 1, 'Backdrop clamps diagnostic values safely');
}

// Project every real geometry vertex through the shader's profile rotations.
const postcss = (await import(pathToFileURL(path.join(root, 'motdes/node_modules/postcss/lib/postcss.js')))).default;
const cssTree = postcss.parse(profileCss);
const cssMatchesViewport = (node, width, height) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== 'atrule' || parent.name !== 'media') continue;
    if (/prefers-reduced-motion/.test(parent.params)) return false;
    for (const [, limit, axis, pixels] of parent.params.matchAll(/\((max|min)-(width|height):\s*([\d.]+)px\)/g)) {
      const actual = axis === 'width' ? width : height;
      if (limit === 'max' ? actual > Number(pixels) : actual < Number(pixels)) return false;
    }
  }
  return true;
};
const viewportStyles = (selector, width, height) => {
  const values = {};
  cssTree.walkRules((rule) => {
    if (!rule.selector.split(',').map((item) => item.trim()).includes(selector) || !cssMatchesViewport(rule, width, height)) return;
    rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
  });
  return values;
};
const pixels = (value, width, height) => {
  if (/^clamp\(/.test(value)) {
    const args = value.slice(6, -1).split(',').map((arg) => pixels(arg.trim(), width, height));
    return Math.max(args[0], Math.min(args[1], args[2]));
  }
  if (value.endsWith('vw')) return parseFloat(value) * width / 100;
  if (value.endsWith('vh')) return parseFloat(value) * height / 100;
  return parseFloat(value);
};
const caseBottomPx = (width, height) => {
  const text = viewportStyles('.ProfileStory__case_title', width, height), eyebrow = viewportStyles('.ProfileStory__case_eyebrow', width, height);
  const tagline = viewportStyles('.ProfileStory__case_tagline', width, height), caption = viewportStyles('.ProfileStory__case_caption', width, height);
  const lineHeight = (style) => pixels(style['font-size'], width, height) * Number(style['line-height']);
  const margin = (style, name, item) => pixels(style[`margin-${name}`] || style.margin?.split(/\s+/)[item] || '0', width, height);
  const textHeight = lineHeight(eyebrow) + margin(eyebrow, 'bottom', 2) + lineHeight(text) * 2 + margin(tagline, 'top', 0) + lineHeight(tagline);
  const portrait = width <= 768 && !(height <= 600 && width >= 520);
  const stageWidth = width * .86;
  const mediaColumnWidth = portrait ? stageWidth : stageWidth * .94 * 58 / 86;
  const mediaHeight = Math.min(mediaColumnWidth * 9 / 16, height * .55) + margin(caption, 'top', 0) + lineHeight(caption);
  const stageHeight = portrait ? textHeight + 24 + mediaHeight : Math.max(textHeight, mediaHeight);
  return height / 2 + stageHeight / 2;
};
equal(viewportStyles('.ProfileStory__progress_track', 390, 844).width, '30px', 'Mobile progress track leaves room around the bottom M');
equal(viewportStyles('.ProfileStory__case_title', 390, 500)['font-size'], 'clamp(34px, 7vw, 42px)', 'Narrow short screens keep the declaration within the reserved bottom-M space');
const projectionRuns = [];
for (const [width, height, mobile] of [[1440, 900, false], [390, 500, true], [390, 844, true], [667, 375, true]]) {
  viewport.innerWidth = width;
  viewport.innerHeight = height;
  device.isSPLayout = mobile;
  let referencePose;
  for (const progress of [0.064, 0.138667, 0.288, 0.46, 0.54, 0.62, 0.70, 0.78, 0.84, 0.92, 0.96]) {
    const layout = profileLogoLayout(mobile, height);
    profileAt(progress);
    const pose = { scale: mesh.scale.toArray(), position: mesh.position.toArray(), yaw: mesh.material.uniforms.uProfileYaw.value, pitch: mesh.material.uniforms.uProfilePitch.value };
    referencePose ??= pose;
    const frame = profileLogoFrame(progress);
    if (progress <= .797) equal(pose, referencePose, 'The actual M keeps its small bottom pose through all showcase holds');
    else check(pose.scale[0] > referencePose.scale[0] && pose.position[1] > referencePose.position[1], 'Final exit enlarges and raises M at each responsive viewport');
    equal(logo.debugState.profileParticles, null, 'Particles remain absent at every reading stop');
    const halfHeight = Math.tan(THREE.MathUtils.degToRad((35 + 18 / (width / height)) / 2)) * 10;
    const center = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const expectedCenterY = layout.centerY * frame.layout + (1 - logo.position.y / halfHeight) / 2 * (1 - frame.layout);
    near((1 - center.y / halfHeight) / 2, expectedCenterY, 'M moves continuously from its responsive dock toward the original center');
    const camera = new THREE.PerspectiveCamera(35 + 18 / (width / height), width / height, 0.1, 1000);
    camera.position.z = 10;
    camera.updateMatrixWorld(true);
    const vertex = new THREE.Vector3();
    const position = mesh.geometry.getAttribute('position');
    const yaw = mesh.material.uniforms.uProfileYaw.value;
    const pitch = mesh.material.uniforms.uProfilePitch.value;
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index);
      const x = vertex.x * Math.cos(yaw) + vertex.z * Math.sin(yaw);
      const z = -vertex.x * Math.sin(yaw) + vertex.z * Math.cos(yaw);
      const y = vertex.y * Math.cos(pitch) + z * Math.sin(pitch);
      vertex.set(x, y, -vertex.y * Math.sin(pitch) + z * Math.cos(pitch));
      vertex.applyMatrix4(mesh.matrixWorld).project(camera);
      bounds.minX = Math.min(bounds.minX, vertex.x); bounds.maxX = Math.max(bounds.maxX, vertex.x);
      bounds.minY = Math.min(bounds.minY, vertex.y); bounds.maxY = Math.max(bounds.maxY, vertex.y);
    }
    if (progress <= .797) {
      check(bounds.minX >= -1 && bounds.maxX <= 1 && bounds.minY >= -1 && bounds.maxY <= 1, 'The complete small M fits inside the real projected viewport');
      check((bounds.maxY - bounds.minY) / 2 < .15, 'Reading M stays below fifteen percent of viewport height');
    }
    const topPx = (1 - bounds.maxY) * height / 2;
    equal(Array.from(logo.outlineContainer.matrixWorld.elements), Array.from(mesh.matrixWorld.elements), 'The independent outline retains the same final model transform');
    logo.outlineContainer.updateMatrixWorld(true);
    projectionRuns.push({ width, height, mobile, progress, centerVh: expectedCenterY * 100, topVh: Math.round((1 - bounds.maxY) * 500) / 10, bottomVh: Math.round((1 - bounds.minY) * 500) / 10 });
  }
}
for (const shader of [shaders.mainLogoFrag, shaders.mainLogoOutlineFrag, shaders.mainLogoScreenFrag]) {
  check(shader.includes('uniform float uProfileReveal;'), 'Every fragment shader consumes the shared reveal uniform');
  check(shader.includes('if(uProfileReveal<=0.0001){discard;}'), 'Fully hidden fragments cannot write ghost color or depth');
}
check(shaders.mainLogoFrag.includes('gl_FragColor=vec4(c,uProfileReveal)'), 'Glass alpha follows final reveal');
check(shaders.mainLogoOutlineFrag.includes('gl_FragColor=vec4(vec3(1.0),uProfileReveal)'), 'Outline alpha follows final reveal');
check(shaders.mainLogoScreenFrag.includes('smoothstep(0.0,0.1,uVisionRotate)*uProfileReveal'), 'Side-screen alpha preserves its old unfolding gate and the new profile reveal');
viewport.innerWidth = 1440; viewport.innerHeight = 900; device.isSPLayout = false;
profileAt(0.78);
profileAt(1);
let portfolioTime = 0;
const portfolioStates = [];
for (const progress of [0, .17, .32, .48, .62, .68, .74, .88, 1]) {
  triggers.vision.progress = progress;
  for (let i = 0; i < 240; i += 1) { lerper.update(portfolioTime += 1000 / 60); update(); }
  if (portfolioStates.length) check(mesh.scale.x >= portfolioStates.at(-1).scale, 'PORTFOLIO grows the actual mesh continuously toward its final size');
  if (progress <= .74) equal([logo.debugState.visionRotate, logo.debugState.serviceRotate, logo.debugState.serviceIn], [0, 0, 0], 'Growth and the large-M hold keep every turn and unfolding gate closed');
  if (progress >= .62) { near(mesh.scale.x, 3, 'Growth completes before the rotation phase'); near(mesh.position.y, 0, 'Growth arrives at the original unfolding anchor'); }
  if (progress === .32) check(mesh.scale.x > smallScale && mesh.scale.x < 3, 'Middle of PORTFOLIO shows an intermediate M size');
  if (progress > .74) check(logo.debugState.visionRotate > 0, 'Further scrolling starts the turn only after growth and hold');
  portfolioStates.push({ progress, scale: mesh.scale.x, y: mesh.position.y, reveal: logo.debugState.profileReveal, turn: logo.debugState.visionRotate });
}
for (const expected of [...portfolioStates].reverse()) {
  triggers.vision.progress = expected.progress;
  for (let i = 0; i < 240; i += 1) { lerper.update(portfolioTime += 1000 / 60); update(); }
  near(mesh.scale.x, expected.scale, 'Reverse scroll retraces the same growth size');
  near(mesh.position.y, expected.y, 'Reverse scroll retraces the same growth anchor');
  near(logo.debugState.profileReveal, expected.reveal, 'Reverse scroll retraces the same ink');
}
triggers.vision.progress = 1;
for (let i = 0; i < 100; i += 1) {
  lerper.update(portfolioTime += 1000 / 60); update();
  if (mesh.scale.x < 3 - 1e-8) equal([logo.debugState.visionRotate, logo.debugState.serviceRotate], [0, 0], 'A fast scroll cannot turn the model while damped growth is still catching up');
}
reducedMotion.matches = true;
triggers.vision.progress = .32;
update();
near(mesh.scale.x, portfolioStates.find((state) => state.progress === .32).scale, 'Reduced motion follows the current growth position without trailing');
equal([logo.debugState.visionRotate, logo.debugState.serviceRotate], [0, 0], 'Returning from the turned M to reduced-motion growth closes all rotation gates immediately');
reducedMotion.matches = false;
profileAt(1);
triggers.service_in.progress = 0.5;
triggers.vision.progress = 1;
lerper.set('service_renderer', 1, 1);
let time = portfolioTime;
for (let frame = 0; frame < 120; frame += 1) { lerper.update(time += 16.7); update(); }
check(logo.debugState.serviceRotate > 0.49, 'The original service unfolding still advances after the profile completes');
near(materials[0].uniforms.uProfileReveal.value, 1, 'Service unfolding retains full logo reveal');
near(mesh.scale.x, 3, 'Service uses the original model scale');
near(mesh.position.y, 0, 'Service uses the original model position');
// Reuse the previous reentry reading frame to test stale expanded uniforms and
// grab inertia before lifecycle cleanup could conceal their rollback effects.
logo.grab();
logo.dragBy(.03, .02, new THREE.PerspectiveCamera());
logo.release();
mesh.quaternion.setFromEuler(new THREE.Euler(.2, .3, .1));
profileAt(0.064);
equal([logo.debugState.visionRotate, logo.debugState.serviceIn, logo.debugState.serviceRotate], [0, 0, 0], 'Rolling from expanded Service to the first chapter immediately closes all three shader gates');
equal(mesh.quaternion.toArray(), [0, 0, 0, 1], 'Rolling into reading clears residual drag and service quaternion on the actual mesh');
check(visibility().every(Boolean), 'Rolling into the first chapter preserves a complete visible small M');
logo.out();
equal(lerper.get('mainLogo_portfolio'), undefined, 'Leaving the page clears the portfolio growth follower');
check(visibility().every(Boolean), 'GL cleanup restores visibility for every M layer');
near(materials[0].uniforms.uProfileReveal.value, 1, 'GL cleanup clears the hidden reveal state');
near(mesh.scale.x, 3, 'GL cleanup restores scale');
near(mesh.position.y, 0, 'GL cleanup restores position');
triggers.service_in.progress = 0; triggers.vision.progress = 0; lerper.get('service_renderer').current = 0;
logo.in();
profileAt(0.92);
check(visibility().every(Boolean), 'Repeated entry reveals the M at the end again');
const glSource = read('scripts/gl/index.js');
check(glSource.includes("this.#profileTrigger = topScrollManager.getTrigger('profile_progress');"), 'GL wires the real profile trigger');
check(glSource.includes('setProfileBackdrop(profileBackdropFrame(profileProgress).dark)'), 'GL updates the real MV background from profile progress');
check(glSource.includes('this.#mvScene.setProfileBackdrop(0);'), 'GL clears the profile backdrop on page exit');
// Exercise the actual GL update/in/out methods with a renderer stub. Exposing
// private fields is confined to this VM copy; production code stays untouched.
const glContext = vm.createContext({ THREE, Animator, animator, lerper, window: viewport,
  profileBackdropFrame, topScrollManager: { getTrigger: (name) => triggers[name] || null, getProfileProgress: () => triggers.profile_progress.progress } });
vm.runInContext(glSource.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '').replace(/#([A-Za-z_]\w*)/g, '_$1')
  + '\nglobalThis.GLSubject = GL;', glContext);
const gl = new glContext.GLSubject();
const idleLayer = () => ({ update() {}, in() {}, out() {} });
let renders = [];
gl._started = true;
gl._commonUniforms = { uTime: { value: 0 } };
gl._noise = { render() {} };
gl._cameraController = idleLayer();
gl._serviceScene = idleLayer();
gl._thumbScene = idleLayer();
gl._logo2D = idleLayer();
gl._bgQuadTree = idleLayer();
gl._mainLogo = logo;
gl._mvScene = scene;
gl._renderer = { setRenderTarget() {}, clear() {}, setClearColor() {}, render(target) { renders.push(target); }, info: { render: { calls: 0, triangles: 0 } } };
gl._blitMaterial = { uniforms: { uVisibleMissionVision: { value: 0 }, uVisibleMissionVisionMotionBlur: { value: 0 }, uVisibleService: { value: 0 } } };
gl._bloom = { render() {} };
gl._compositeRT = { texture: {} };
triggers.mission_in.progress = 0;
triggers.mission_in.isActive = false;
triggers.service_in.progress = 0;
triggers.profile_progress.progress = 0.705;
triggers.profile_progress.isActive = false;
gl.in(null);
gl.update(1 / 60);
equal(gl.debugProfileBackdrop().background, '#d7dbdc', 'GL retains the white profile backdrop even while MV is not being rendered');
near(gl.debugProfileBackdrop().profileAmount, 1, 'GL still updates the backdrop API when the MV renderer branch is inactive');
check(!renders.includes(scene), 'The inactive MV renderer branch was actually skipped in this fixture');
const inactiveState = JSON.stringify(gl.debugProfileBackdrop());
equal(JSON.stringify(gl.debugProfileBackdrop()), inactiveState, 'Stopping the main loop preserves the last finite canvas state');
gl._missionTrigger = null;
gl._serviceTrigger = { progress: 1 };
gl._visibleMV = 1;
renders = [];
triggers.profile_progress.progress = 1;
gl.update(1 / 60);
equal(gl.debugProfileBackdrop().background, '#d7dbdc', 'An offscreen or service-covered MV scene still resets its backdrop when the profile finishes');
check(Number.isFinite(gl.debugProfileBackdrop().profileDark), 'The inactive scene background state remains finite');
triggers.profile_progress.progress = 0.92;
gl.update(1 / 60);
equal(gl.debugProfileBackdrop().background, '#d7dbdc', 'Reverse scrolling keeps the original white backdrop on the next GL frame');
near(gl.debugProfileBackdrop().profileDark, 0, 'Reverse scrolling never enables a dark backdrop');
gl.out();
equal(gl.debugProfileBackdrop().background, '#d7dbdc', 'Actual GL.out restores the default canvas background');
equal(gl.debugProfileBackdrop().gridVisible, true, 'Actual GL.out restores the default grid');
gl.in(null);
triggers.profile_progress.progress = 0.705;
gl.update(1 / 60);
equal(gl.debugProfileBackdrop().background, '#d7dbdc', 'A repeated GL.in retains the original white profile backdrop');
near(gl.debugProfileBackdrop().profileDark, 0, 'A repeated GL.in never enables a dark backdrop');
const report = { status: 'passed', checks, portfolioHeightFraction, portfolioStates, revealedStates, fleckCounts, silhouetteEdgeSamples: edgePixels, projectionRuns, backgrounds, scope: 'Actual MainLogo including small reading pose and sequential PORTFOLIO growth hold and turn, forward reverse and fast scroll, unrendered ancestors and direct entry, removed particle layer, silhouette and bevel ray intersections, shaders, MissionVisionScene, and GL lifecycle/update methods with real Three.js geometry plus production timeline. Renderer calls are stubbed. Offline only; no GPU rendering, browser, localhost HTTP or network verification.' };
fs.writeFileSync(path.join(root, 'analysis/profile-scroll/verification-gl.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
