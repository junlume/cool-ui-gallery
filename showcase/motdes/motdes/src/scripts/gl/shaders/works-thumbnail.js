import { VIDEO_CORNER_RADIUS, videoCornerMask } from './video-corners.js';

/**
 * WORKS 那一圈环绕的作品屏幕用的着色器。
 * 基于原站屏幕效果，四角使用与板面绑定的圆角遮罩。
 *
 * 片元里那个 4 次采样的循环是色散：每一次用不同的 lens_distortion 强度
 * 分别取 R/G/B，叠出玻璃屏幕边缘的彩边。背面（vFront<0.5）走另一套 uv，
 * 所以从侧面看过去是一条被压扁的高光而不是镜像画面。
 */

export const worksThumbnailVert = `#define GLSLIFY 1
uniform float uTexAspect;uniform float uPosX;uniform float uScrollVelocity;
#define MESH_ASPECT ( 16.0 / 9.0 )
varying vec2 vUv;varying vec2 vMeshUv;varying float vFunya;varying vec3 vNormal;varying vec3 vNormalGeo;varying float vFront;varying vec3 vMVPosition;varying vec3 vRefDir;mat2 rotate(float rad){return mat2(cos(rad),sin(rad),-sin(rad),cos(rad));}
#define PI 3.14159265359
#define TPI 6.28318530718
#define HPI 1.57079632679
void main(void){vFunya=abs(uScrollVelocity);vec3 pos=position;pos+=length(position.xy)*vec3(1.0,-0.1,0.0)*vec3(vec2(min(0.1,uScrollVelocity*0.0)),0.0);pos.z*=0.2;pos.z+=cos(pos.x/4.0*PI/2.0*0.5)*1.5-1.0;vUv=uv;vMeshUv=uv;if(uTexAspect<=MESH_ASPECT){vUv.y-=0.5;vUv.y*=uTexAspect/MESH_ASPECT;vUv.y+=0.5;}else{vUv.x-=0.5;vUv.x/=uTexAspect/MESH_ASPECT;vUv.x+=0.5;}vec4 mvPosition=modelViewMatrix*vec4(pos,1.0);gl_Position=projectionMatrix*mvPosition;vNormalGeo=normal;vNormal=normal*normalMatrix;vFront=step(0.5,normal.z);vMVPosition=mvPosition.xyz;vRefDir=reflect(-vMVPosition,normalize(vNormal));vRefDir.yz*=rotate(0.2);vRefDir.xy*=rotate(-0.9);vRefDir.xz*=rotate(0.3);}`;

export const worksThumbnailFrag = `#define GLSLIFY 1
${videoCornerMask}
uniform sampler2D uTex;uniform samplerCube uEnvMap;uniform float uLoaded;uniform float uPosX;uniform float uWorksProgress;uniform float uAlpha;uniform float uScrollVelocity;varying vec2 vUv;varying vec2 vMeshUv;varying float vFunya;varying vec3 vNormal;varying vec3 vNormalGeo;varying float vFront;varying vec3 vMVPosition;varying vec3 vRefDir;mat2 rotate(float rad){return mat2(cos(rad),sin(rad),-sin(rad),cos(rad));}uniform float uTime;float sdBox(in vec2 p,in vec2 b){vec2 d=abs(p)-b;return length(max(d,0.0))+min(max(d.x,d.y),0.0);}float opRound(in vec2 p,in float r){return sdBox(p,vec2(0.5))-r;}vec2 lens_distortion(vec2 r,float alpha){return r*(1.0-alpha*dot(r,r));}void main(void){float cornerCoverage=videoCornerCoverage(vMeshUv,16.0/9.0,${VIDEO_CORNER_RADIUS});if(cornerCoverage<=0.0) discard;vec2 uv=vUv;vec2 meshCuv=(vMeshUv-0.5);vec2 moveUVOffset=vec2(0.0);moveUVOffset.x-=uScrollVelocity*1.0;vec2 normalOffset=vec2(0.0);float frontDir=dot(normalize(vNormal),vec3(0.0,0.0,1.0));normalOffset-=vNormal.xy*0.5*smoothstep(0.8,1.0,frontDir);vec4 col=vec4(0.0);if(vFront<0.5){uv.x*=0.01;uv.x+=1.0-vNormalGeo.x*0.19;uv.x+=-vNormal.x*0.5;}for(int i=0;i<4;i++){float fi=float(i)/4.0;vec2 cuv=uv-0.5;cuv*=1.3;cuv.x*=0.9;float distBase=0.1+fi*0.03;col.x+=texture2D(uTex,lens_distortion(cuv,distBase+0.1)+0.5+normalOffset*1.0).x;col.y+=texture2D(uTex,lens_distortion(cuv,distBase+0.12)+0.5+normalOffset*1.01).y;col.z+=texture2D(uTex,lens_distortion(cuv,distBase+0.14)+0.5+normalOffset*1.02).z;}col.xyz/=4.0;col.w=1.0;col.xyz*=smoothstep(0.9,0.49,length(meshCuv));col.w*=uLoaded;col.w*=uAlpha*cornerCoverage;col.xyz=mix(col.xyz,vec3(smoothstep(0.0,0.2,vRefDir.x)),0.05);gl_FragColor=col;}`;

