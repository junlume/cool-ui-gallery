import { VIDEO_CORNER_RADIUS, videoCornerMask } from './video-corners.js';

/**
 * SERVICE 段那面卷起来的视频墙用的着色器。
 * 基于 .ref/app.js 的波面效果；案例背景沿时间轻缓平移。
 *
 *   serviceListVert   共用顶点着色器 —— 用 defines 分流 IS_GRID / IS_CROSS /
 *                     IS_TITLE / IS_THUMBNAIL，几何本身都是单位平面
 *   thumbnailFrag     视频面板的片元
 *   serviceTitleFrag  "SERVICE" 标题带
 */

export const serviceListVert = `#define GLSLIFY 1
varying vec2 vUv;varying vec3 vNormal;uniform float uServiceIn;uniform vec3 uScale;uniform float uTime;uniform float uThumbnailScroll;uniform float uStelllaIn;uniform float uStelllaView;uniform float uSPWeight;
#define PI 3.14159265359
#define TPI 6.28318530718
#define HPI 1.57079632679
mat2 rotate(float rad){return mat2(cos(rad),sin(rad),-sin(rad),cos(rad));}
#ifdef IS_CROSS
attribute vec2 instanceId;
#endif
#ifdef IS_THUMBNAIL
varying vec2 vPanelUv;
uniform float uInstanceId;
#endif
#ifdef IS_STELLLA
uniform float uCanvasAspect;uniform float uVideoAspect;
#endif
float ease(float x){return-(cos(PI*x)-1.0)/2.0;}float ease2(float x){return x<0.5 ? 4.0*x*x*x : 1.0-pow(-2.0*x+2.0,3.0)/2.0;}vec2 getCoverUV(vec2 uv,float canvasAspect,float videoAspect){vec2 newUv=uv;float scaleX=1.0;float scaleY=1.0;newUv-=0.5;if(canvasAspect>videoAspect){newUv.y/=canvasAspect;newUv.y*=videoAspect;}else{newUv.x*=canvasAspect;newUv.x/=videoAspect;}newUv+=0.5;return newUv;}void main(void){vUv=uv;vec2 localPos=position.xy;
#ifdef IS_CROSS
vec2 loopPos=instanceId.xy;loopPos.x=mod(loopPos.x-uTime*0.015-uThumbnailScroll*0.3-uServiceIn*0.2,1.0);localPos=(loopPos-0.5)*1.0;
#endif
#ifdef IS_THUMBNAIL
vPanelUv=uv;
float x=uInstanceId-(uThumbnailScroll-1.0);x+=0.09*uSPWeight;localPos=position.xy*0.3;localPos.x*=(16.0/9.0)*0.85;localPos.x+=x*0.95;localPos.x+=-0.05*(1.0-uStelllaIn);
#ifndef IS_STELLLA
localPos.x-=uStelllaView*0.5;
#endif
#endif
#ifndef IS_THUMBNAIL
localPos.x*=1.4;
#endif
float theta=localPos.x*PI+(1.0-uServiceIn)*8.0+-uStelllaIn*2.0;float wavePow=(4.0*uServiceIn);wavePow*=1.0-uStelllaIn;wavePow*=(1.0-uSPWeight*0.2);vec3 curvedPos=vec3(0.0);curvedPos=vec3(localPos.x*uScale.x,localPos.y*uScale.y,-sin(theta)*wavePow);
#ifndef IS_THUMBNAIL
curvedPos.y*=1.7;
#endif
#ifdef IS_THUMBNAIL
curvedPos.y+=0.6*uSPWeight;
#endif
vNormal=vec3(0.0,0.0,1.0);float directionTheta=cos(theta)*(uServiceIn*(1.0-uStelllaIn))*0.7;vNormal.xz*=rotate(directionTheta);vec3 pos=vec3(0.0);
#ifdef IS_GRID
pos=curvedPos;
#endif
#ifdef IS_CROSS
pos=position*0.2;pos.xz*=rotate(directionTheta);pos+=curvedPos;
#endif
#ifdef IS_THUMBNAIL
pos=curvedPos;
#endif
#ifdef IS_TITLE
pos=curvedPos;
#endif
gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
#ifdef IS_STELLLA
float stelllaFit=uStelllaView;float curve=mix(0.3,0.2,uSPWeight);float w=smoothstep(0.0,1.0,-uv.x*curve+stelllaFit*(1.0+curve));gl_Position=mix(gl_Position,vec4(position.xy*2.0,0.0,1.0),w);vUv=mix(vUv,getCoverUV(vUv,uCanvasAspect,uVideoAspect),w);
#endif
}`;

export const serviceTitleFrag = `#define GLSLIFY 1
uniform sampler2D uServiceTitleTex;
uniform sampler2D uPrevTexture;
uniform sampler2D uNextTexture;
uniform float uTextureBlend;
uniform float uHasPrevTexture;
uniform float uHasNextTexture;
varying vec2 vUv;
uniform float uServiceIn;
uniform float uThumbnailScroll;
uniform float uTime;
void main(void) {
  vec2 serviceTitleUv = vUv;
  serviceTitleUv.y *= 4.5;
  serviceTitleUv.x *= 1.1;
  serviceTitleUv.x += uThumbnailScroll * 0.2 + uTime * 0.015;
  serviceTitleUv.x = fract(serviceTitleUv.x) * 1.1;
  serviceTitleUv.y = fract(serviceTitleUv.y);
  float titleCol = texture2D(uServiceTitleTex, serviceTitleUv).w;
  titleCol *= mix(0.8, (1.0 - vUv.x) * 0.0, uServiceIn);

  vec2 texUv = (vUv - 0.5) * vec2(0.7, 0.98) + 0.5;
  // 视频原生运动之外，放大的背景轻缓漂移；前景和文字保持稳定。
  texUv += vec2(sin(uTime * 0.18) * 0.012, cos(uTime * 0.13) * 0.008);
  vec3 prevTexture = vec3(0.0);
  vec3 nextTexture = vec3(0.0);
  if (uHasPrevTexture > 0.5) {
    prevTexture = texture2D(uPrevTexture, texUv + vec2(uTextureBlend * 0.05, 0.0)).rgb;
  }
  if (uHasNextTexture > 0.5) {
    nextTexture = texture2D(uNextTexture, texUv - vec2((1.0 - uTextureBlend) * 0.05, 0.0)).rgb;
  }
  vec3 blendedTexture = mix(prevTexture, nextTexture, uTextureBlend);
  vec3 col = blendedTexture * (1.0 - vUv.x) * 0.4 + titleCol;
  gl_FragColor = vec4(col, 1.0);
}`;

export const thumbnailFrag = `#define GLSLIFY 1
${videoCornerMask}
varying vec2 vPanelUv;
#ifdef IS_STELLLA
uniform float uStelllaView;
#endif
uniform sampler2D uTextureA;uniform sampler2D uTextureB;uniform float uTextureAlpha;uniform float uMixWeight;uniform float uServiceIn;varying vec2 vUv;varying vec3 vNormal;void main(void){
float cornerCoverage=videoCornerCoverage(vPanelUv,(16.0/9.0)*0.85,${VIDEO_CORNER_RADIUS});
#ifdef IS_STELLLA
// The final panel becomes a full-bleed background; release its corners with that transition.
cornerCoverage=mix(cornerCoverage,1.0,smoothstep(0.0,0.85,uStelllaView));
#endif
if(cornerCoverage<=0.0) discard;
vec2 uv=vUv;vec4 texColorA=texture2D(uTextureA,uv);vec4 texColorB=texture2D(uTextureB,uv);vec4 mixedColor=mix(texColorA,texColorB,uMixWeight);
#ifndef IS_STELLLA
mixedColor.w*=smoothstep(1.0,0.3,length(vUv-0.5));
#endif
mixedColor.rgb*=0.7;gl_FragColor=vec4(mixedColor.rgb,mixedColor.a*cornerCoverage*uTextureAlpha*smoothstep(0.5,1.0,uServiceIn));}`;
