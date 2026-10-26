/**
 * 最终合成。这一趟把三件原站分散在两个 pass 里做的事合到一处：
 *
 *   ① 流体位移与提亮   —— 场景按速度场偏移、按流速提亮，四周压暗角
 *   ② 开场圆形擦除     —— 场景从 2× 缩回 1×，一个从中心长出的圆把构造
 *                        图纸擦掉换成场景，交界处有一圈折射推挤
 *   ③ 整体增益 1.3
 *
 * 分两趟，和原站一致：
 *   sceneComposite  取 uv + fluids*0.01，把主/亮底/服务三层混起来
 *   finalComposite  取 uv − fluids*0.001，叠三级辉光，再整体 ×1.3
 * 中间必须落一张 RT —— 辉光要拿"已经混完"的画面做亮部提取，
 * 拆不开。
 *
 * ⚠️ 开场那段（uLoaded<0.999）的每个常数都取自原站字面量，别调：
 *   0.2+uLoaded*0.7   擦除边缘的软硬（越到后面越软）
 *   uLoaded*1.4       圆的推进（1.4 保证到 uLoaded=1 时四角也擦到）
 *   0.5+uLoaded*0.5   场景缩放（0.5 的 UV 缩放 = 2 倍放大）
 *   sin(r*PI)*0.1     交界环的推挤幅度
 *   1.0/0.8           图纸容器占 80% 视口宽
 *   smoothstep(.5,.4) 图纸左右各 10% 渐隐
 */

export const compositeVert = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 人物背景向上移 5vh；环绕保持原位置，各自画框同时约束采样和辉光。
const coinFrameGLSL = `
vec2 coinFrameUv(vec2 uv, float videoAspect, float screenAspect) {
  vec2 p = uv - 0.5;
  if (videoAspect > screenAspect) p.y *= videoAspect / screenAspect;
  else p.x *= screenAspect / videoAspect;
  return p / 0.92 + 0.5;
}
vec2 coinBackgroundUv(vec2 uv, float videoAspect, float screenAspect) {
  return coinFrameUv(uv - vec2(0.0, 0.05), videoAspect, screenAspect);
}
float coinFrameMask(vec2 p) {
  float sides = smoothstep(0.0, 0.025, p.x) * (1.0 - smoothstep(0.975, 1.0, p.x));
  float top = 1.0 - smoothstep(0.985, 1.0, p.y);
  return sides * top * smoothstep(0.0, 0.18, p.y);
}
float missionCoverage(vec2 uv, float visible, float motionBlur, float height) {
  float range = 1.0 / height + abs(motionBlur) * 0.2;
  float roundEdge = -cos((uv.x - 0.5) * 3.14159265359) * motionBlur;
  float edge = motionBlur > 0.0 ? visible * (1.0 + range) : visible;
  return smoothstep(0.0, range, -uv.y + edge + roundEdge);
}
`;

export const compositeFrag = `
#define PI 3.14159265359
uniform sampler2D uSceneTex;
uniform sampler2D uMissionVisionTex;
uniform sampler2D uServiceTex;
uniform sampler2D uThumbnailTex;
uniform sampler2D uFluidsTex;
uniform sampler2D uLoadingSVGTex;
uniform sampler2D uCoinVideoTex;
uniform float uCoinVideoAspect;
uniform float uCoinVideoMix;
uniform float uLoaded;
uniform float uScreenAspectRatio;
uniform vec2 uResolution;
uniform float uVisibleMissionVision;
uniform float uVisibleMissionVisionMotionBlur;
uniform float uVisibleService;
varying vec2 vUv;
${coinFrameGLSL}

void main(void) {
  vec2 uv = vUv;
  vec2 cuv = uv - 0.5;
  vec4 fluids = texture2D(uFluidsTex, uv);
  float fluidsLength = length(fluids.xy);

  // 按屏幕比例校正过的中心向量 —— 擦除圆在宽屏上也得是正圆
  vec2 acuv = cuv;
  if (uScreenAspectRatio > 1.0) { acuv.y /= uScreenAspectRatio; }
  else { acuv.x *= uScreenAspectRatio; }

  float r = 1.0;
  vec2 sceneUv = uv;
  vec2 push = vec2(0.0);
  if (uLoaded < 0.999) {
    r = smoothstep(0.0, 0.2 + uLoaded * 0.7, -length(acuv) + uLoaded * 1.4);
    push = sin(r * PI) * normalize(acuv) * 0.1;
    sceneUv -= 0.5;
    sceneUv *= (0.5 + uLoaded * 0.5);
    sceneUv += 0.5;
    sceneUv -= push;
  }
  sceneUv += fluids.xy * 0.01;

  vec3 col = texture2D(uSceneTex, sceneUv).xyz;
  col *= smoothstep(1.2, 0.0, length(cuv));
  col *= 1.0 + fluidsLength * 0.8;
  vec2 frameUv = coinFrameUv(uv, uCoinVideoAspect, uScreenAspectRatio);
  float frameMask = coinFrameMask(frameUv);
  float bottomSoftness = 1.0 - smoothstep(0.02, 0.24, frameUv.y);

  // The video replaces only the main backdrop, underneath the orbit and later scenes.
  // Divide out finalFrag's gain so the cut from the HTML video keeps the same colour.
  // SDR / 1.3 also stays below the bloom threshold, preserving the footage's colour.
  if (uCoinVideoMix > 0.0) {
    vec2 backgroundUv = coinBackgroundUv(uv, uCoinVideoAspect, uScreenAspectRatio);
    float backgroundMask = coinFrameMask(backgroundUv);
    float backgroundSoftness = 1.0 - smoothstep(0.02, 0.24, backgroundUv.y);
    // 复用环绕的屏幕速度场，再映射到视频比例；画框边缘的位移柔和收敛。
    // 只扭曲素材采样，画框和底部模糊一起随背景上移。
    vec2 videoScreenUv = uv + fluids.xy * 0.01 * backgroundMask;
    vec2 videoUv = clamp(coinBackgroundUv(videoScreenUv, uCoinVideoAspect, uScreenAspectRatio), 0.0, 1.0);
    vec3 videoCol = texture2D(uCoinVideoTex, videoUv).rgb;
    if (backgroundSoftness > 0.001 && backgroundMask > 0.0) {
      vec2 blur = vec2(0.004, 0.008) * backgroundSoftness;
      videoCol = videoCol * 0.4
        + texture2D(uCoinVideoTex, clamp(videoUv + vec2(blur.x, 0.0), 0.0, 1.0)).rgb * 0.15
        + texture2D(uCoinVideoTex, clamp(videoUv - vec2(blur.x, 0.0), 0.0, 1.0)).rgb * 0.15
        + texture2D(uCoinVideoTex, clamp(videoUv + vec2(0.0, blur.y), 0.0, 1.0)).rgb * 0.15
        + texture2D(uCoinVideoTex, clamp(videoUv - vec2(0.0, blur.y), 0.0, 1.0)).rgb * 0.15;
    }
    videoCol *= backgroundMask / 1.3;
    col = mix(col, videoCol, uCoinVideoMix);
  }

  // WORKS 那一圈环绕的屏幕。单独渲一张带 alpha 的 RT，按 alpha 叠上来 ——
  // 取样用的是 sceneUv 而不是 uv，所以开场那 3 秒它跟着主场景一起被放大、
  // 一起被擦除圆推挤，不会自己站在原地不动。
  vec4 thumb = texture2D(uThumbnailTex, sceneUv);
  if (uCoinVideoMix > 0.0) {
    // 仅底部过渡区域增加采样，上方作品保持清晰。先模糊，后约束画框。
    if (bottomSoftness > 0.001 && frameMask > 0.0) {
      vec2 blur = vec2(14.0) * bottomSoftness / uResolution;
      thumb = thumb * 0.4
        + texture2D(uThumbnailTex, sceneUv + vec2(blur.x, 0.0)) * 0.15
        + texture2D(uThumbnailTex, sceneUv - vec2(blur.x, 0.0)) * 0.15
        + texture2D(uThumbnailTex, sceneUv + vec2(0.0, blur.y)) * 0.15
        + texture2D(uThumbnailTex, sceneUv - vec2(0.0, blur.y)) * 0.15;
    }
    // 透明 RT 中 RGB 已乘 alpha，先还原，避免柔化边缘变成黑边。
    thumb.rgb /= max(thumb.a, 0.0001);
    thumb.a *= frameMask;
  }
  col = mix(col, thumb.rgb, thumb.a);

  // ---- MISSION / VISION：亮底版面从上方压下来 ----
  // range 随"擦除速度"变宽 → 移动越快边缘越糊，等于一层廉价但很像样的运动模糊。
  // round 让边界不是一条直线而是一道弧，弧的深浅同样由速度决定：
  // 停住时 MotionBlur→0，弧和模糊一起消失，落定成一条干净的水平线。
  vec3 mv = texture2D(uMissionVisionTex, uv - fluids.xy * 0.01).xyz;
  float mvSelector = missionCoverage(vUv, uVisibleMissionVision, uVisibleMissionVisionMotionBlur, uResolution.y);
  float missionFluidsThreshold = 0.4 + uVisibleService * 10.0;
  mv *= 1.0 + length(fluids.xyz) * 0.1 * missionFluidsThreshold;
  mv *= smoothstep(1.5, 0.3, length(cuv));
  col = mix(col, mv, mvSelector);

  // SERVICE 一旦完全进入就整片顶替。用 step 而不是 mix 是原站的写法 ——
  // 交接本身由 MISSION/VISION 那条弧线完成，不需要再叠一次交叉淡化。
  vec3 svc = texture2D(uServiceTex, uv + fluids.xy * 0.01).xyz;
  svc *= 1.0 + fluidsLength * 0.8;
  svc *= smoothstep(1.5, 0.3, length(cuv));
  col = mix(col, svc, step(0.9999, uVisibleService));

  if (uLoaded < 0.999) {
    vec2 luv = uv - push;
    vec2 loadingUv = luv;
    loadingUv.y = 1.0 - loadingUv.y;
    loadingUv -= 0.5;
    float gradMask = 1.0;
    if (uScreenAspectRatio > 1.0) {
      loadingUv.y /= uScreenAspectRatio;
      loadingUv *= 1.0 / 0.8;
      gradMask = smoothstep(0.5, 0.4, abs(loadingUv.x));
    } else {
      loadingUv.x *= uScreenAspectRatio;
    }
    loadingUv += 0.5;
    vec3 loadingSVG = texture2D(uLoadingSVGTex, loadingUv).xyz * gradMask;
    col = mix(loadingSVG, col, smoothstep(0.0, 0.5, r));
  }

  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * 最终一趟：整屏再被速度场推一点，叠三级辉光，最后 1.3 的总增益。
 * 顺序不能换 —— 辉光是加在**位移后**的画面上的，先加后位移会把光晕拖出重影。
 */
export const finalFrag = `
uniform sampler2D uTex;
uniform sampler2D uFluidsTex;
uniform sampler2D uBloom0;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform vec3 uBloomWeights;
uniform float uCoinVideoMix;
uniform float uCoinVideoAspect;
uniform float uScreenAspectRatio;
uniform float uVisibleMissionVision;
uniform float uVisibleMissionVisionMotionBlur;
uniform vec2 uResolution;
varying vec2 vUv;
${coinFrameGLSL}

void main(void) {
  vec2 uv = vUv;
  vec4 fluids = texture2D(uFluidsTex, uv);
  // 人物和环绕已在上一趟分别采样速度场，避免再次扭曲固定的画框边界。
  uv -= fluids.xy * 0.001 * (1.0 - uCoinVideoMix);
  vec3 col = texture2D(uTex, uv).xyz;
  vec3 bloom = texture2D(uBloom0, uv).xyz * uBloomWeights.x
             + texture2D(uBloom1, uv).xyz * uBloomWeights.y
             + texture2D(uBloom2, uv).xyz * uBloomWeights.z;
  float frameMask = coinFrameMask(coinFrameUv(vUv, uCoinVideoAspect, uScreenAspectRatio));
  float backgroundMask = coinFrameMask(coinBackgroundUv(vUv, uCoinVideoAspect, uScreenAspectRatio));
  // 同时容纳上移背景和原位环绕，避免辉光扩散到两者画框之外。
  float covered = missionCoverage(vUv, uVisibleMissionVision, uVisibleMissionVisionMotionBlur, uResolution.y);
  float boundedBloom = mix(max(frameMask, backgroundMask), 1.0, covered);
  col += bloom * mix(1.0, boundedBloom, uCoinVideoMix);
  col *= 1.3;
  gl_FragColor = vec4(col, 1.0);
}`;
